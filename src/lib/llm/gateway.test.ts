import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { llmCall } from "@/db/schema";
import {
  chatJson,
  chatStream,
  chatText,
  LlmError,
  resetLlmState,
  setLlmClientFactory,
  setLlmFake,
  type LlmOptions,
} from "./index";
import { gateFor } from "./limiter";
import { fakeProviders, setEnv, installVirtualClock, type Step, type VirtualClock } from "./testkit";

const live: LlmOptions = { role: "live", purpose: "gw.live", messages: [{ role: "user", content: "hi" }] };
const analyst: LlmOptions = { role: "analyst", purpose: "gw.analyst", messages: [{ role: "user", content: "hi" }] };
const bulk: LlmOptions = { role: "bulk", purpose: "gw.bulk", messages: [{ role: "user", content: "hi" }] };
const tooMany = (retryAfter?: number): Step => ({
  error: { status: 429, headers: retryAfter === undefined ? {} : { "retry-after": String(retryAfter) } },
});

let clock: VirtualClock;

function configure(vars: Record<string, string> = {}) {
  setEnv({
    LLM_LIVE: "verda:vmodel",
    LLM_ANALYST: "verda:vmodel",
    LLM_BULK: "verda:vmodel",
    VERDA_API_KEY: "verda-SECRETKEY-abcdef",
    VERDA_BASE_URL: "http://verda.test/v1",
    ...vars,
  });
}
function install(script: Record<string, Step[]>) {
  const f = fakeProviders(script);
  setLlmClientFactory(f.factory);
  return f;
}
const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as LlmError);

beforeEach(() => {
  resetLlmState();
  configure();
  clock = installVirtualClock();
});

describe("HTTP 429 by role", () => {
  it("a live call moves to the next listed provider at once, with no wait", async () => {
    configure({ LLM_LIVE: "nvidia:n1,verda:vmodel", NVIDIA_API_KEY: "nvapi-SECRETKEY-1234567890" });
    const f = install({ nvidia: [tooMany(30)], verda: [{ text: "ok" }] });
    const before = clock.now();
    const r = await chatText(live);
    expect(r.meta).toMatchObject({ provider: "verda", attempts: 2, queuedMs: 0 });
    expect(clock.now()).toBe(before);
    expect(f.calls.map((c) => c.provider)).toEqual(["nvidia", "verda"]);
  });

  it("a live call without another provider tries once more after its pause, then fails as rate_limited", async () => {
    const f = install({ verda: [tooMany(30), tooMany(30), { text: "never used" }] });
    const before = clock.now();
    const err = await clock.settle(failure(chatText(live)));
    expect(err).toBeInstanceOf(LlmError);
    expect(err!.reason).toBe("rate_limited");
    expect(f.calls).toHaveLength(2);
    const took = clock.now() - before;
    expect(took).toBeGreaterThanOrEqual(1000);
    expect(took).toBeLessThan(1500);
    expect(err!.message).not.toContain("SECRET");
  });

  it("a 429 holds background calls for the Retry-After time while a live call fails within about a second", async () => {
    const f = install({ verda: [tooMany(30), tooMany(30), { text: "background answer" }] });
    const t0 = clock.now();
    const liveCall = failure(chatText(live));
    await clock.flush();
    const bgCall = chatText(analyst);
    await clock.advance(1_500);
    const err = await liveCall;
    expect(err!.reason).toBe("rate_limited");
    expect(f.calls).toHaveLength(2); // the analyst call has not been sent
    await clock.advance(20_000);
    expect(f.calls).toHaveLength(2);
    const r = await clock.settle(bgCall);
    expect(r.text).toBe("background answer");
    expect(clock.now() - t0).toBeGreaterThanOrEqual(30_000);
    expect(r.meta.queuedMs).toBeGreaterThanOrEqual(29_000);
  });

  it("a background call survives several 429s without using up MAX_RETRIES", async () => {
    const f = install({ verda: [tooMany(2), tooMany(2), tooMany(2), tooMany(2), { text: "finally" }] });
    const r = await clock.settle(chatText(bulk));
    expect(r.text).toBe("finally");
    expect(r.meta.attempts).toBe(5);
    expect(f.calls).toHaveLength(5);
    expect(r.meta.queuedMs).toBeGreaterThanOrEqual(8_000);
    expect(clock.sleeps).toEqual([]); // waited at the gate, not in the backoff
  });

  it("a background call that keeps getting 429 stops at its deadline, with no request after it", async () => {
    const f = install({ verda: Array.from({ length: 20 }, () => tooMany(5)) });
    const t0 = clock.now();
    const err = await clock.settle(failure(chatText({ ...analyst, deadlineMs: 20_000 })));
    expect(err!.reason).toBe("deadline");
    expect(clock.now() - t0).toBe(20_000);
    expect(f.calls.length).toBeGreaterThanOrEqual(3);
    expect(f.calls.length).toBeLessThanOrEqual(5);
    expect(err!.meta.queuedMs).toBeGreaterThan(10_000);
    expect(gateFor("verda").waiting).toBe(0);
  });

  it("uses 10 s when Retry-After is missing", async () => {
    install({ verda: [tooMany(), { text: "ok" }] });
    const t0 = clock.now();
    await clock.settle(chatText(analyst));
    expect(clock.now() - t0).toBe(10_000);
  });
});

describe("deadlines", () => {
  it("fails when the deadline passes while queued, and counts the wait", async () => {
    configure({ LLM_MAX_CONCURRENCY: "1", LLM_LIVE_RESERVE_SLOTS: "0", VERDA_MAX_RPM: "0" });
    const f = install({ verda: [{ stall: true }, { text: "never" }] });
    const holder = failure(chatText({ ...live, deadlineMs: 5_000 }));
    await clock.flush();
    const queued = failure(chatText({ ...live, deadlineMs: 1_000 }));
    const err = await clock.settle(queued);
    expect(err!.reason).toBe("deadline");
    expect(err!.meta.queuedMs).toBe(1_000);
    expect(f.calls).toHaveLength(1);
    expect(gateFor("verda").waiting).toBe(0);
    expect((await clock.settle(holder))!.reason).toBe("deadline");
    expect(gateFor("verda").active).toBe(0);
  });

  it("fails when the deadline passes during a retry wait", async () => {
    const f = install({ verda: [{ error: { status: 500 } }, { text: "never" }] });
    const err = await clock.settle(failure(chatText({ ...analyst, deadlineMs: 100 })));
    expect(err!.reason).toBe("deadline");
    expect(f.calls).toHaveLength(1);
    expect(clock.sleeps).toHaveLength(1);
    expect(gateFor("verda").active).toBe(0);
  });

  it("aborts the request in flight when the deadline passes", async () => {
    const f = install({ verda: [{ stall: true }] });
    const t0 = clock.now();
    const err = await clock.settle(failure(chatText({ ...live, deadlineMs: 2_000 })));
    expect(err!.reason).toBe("deadline");
    expect(clock.now() - t0).toBe(2_000);
    expect(err!.meta).toMatchObject({ ok: false, attempts: 1, latencyMs: 2_000 });
    expect(f.calls).toHaveLength(1);
    expect(gateFor("verda").active).toBe(0);
  });

  it("uses the role defaults: live 6 s, analyst 60 s, bulk 180 s", async () => {
    for (const [opts, ms] of [[live, 6_000], [analyst, 60_000], [bulk, 180_000]] as const) {
      install({ verda: [{ stall: true }] });
      const t0 = clock.now();
      const err = await clock.settle(failure(chatText(opts)));
      expect(err!.reason).toBe("deadline");
      expect(clock.now() - t0).toBe(ms);
    }
  });

  it("a stream's deadline ends when the first text arrives", async () => {
    install({ verda: [{ pieces: ["first"], hang: true }] });
    const ac = new AbortController();
    const s = chatStream({ ...live, deadlineMs: 1_000, signal: ac.signal });
    const it = s[Symbol.asyncIterator]();
    const first = await it.next();
    expect(first.value).toBe("first");
    await clock.advance(30_000); // far past the deadline; only the idle timeout applies now
    let settled = false;
    void s.meta.then(() => (settled = true));
    await clock.flush();
    expect(settled).toBe(false);
    ac.abort();
    expect((await s.meta).error).toBe("aborted");
  });

  it("a stream that has no text by the deadline fails as deadline", async () => {
    install({ verda: [{ stall: true }] });
    const s = chatStream({ ...live, deadlineMs: 1_000 });
    const err = await clock.settle(
      (async () => {
        try {
          for await (const t of s) void t;
          return null;
        } catch (e) {
          return e as LlmError;
        }
      })(),
    );
    expect(err!.reason).toBe("deadline");
    expect((await s.meta).ok).toBe(false);
  });

  it("chatJson gives the first answer and the repair attempt one budget", async () => {
    const Schema = z.object({ n: z.number() });
    install({ verda: [{ text: "not json", delayMs: 3_000 }, { text: '{"n":1}', delayMs: 3_000 }] });
    const t0 = clock.now();
    const r = await clock.settle(chatJson({ ...analyst, deadlineMs: 4_000, schema: Schema }));
    expect(r.data).toBeNull();
    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error).toContain("deadline");
    expect(clock.now() - t0).toBe(4_000);
    expect(r.meta.attempts).toBe(2);

    install({ verda: [{ text: "not json", delayMs: 3_000 }, { text: '{"n":1}', delayMs: 3_000 }] });
    const ok = await clock.settle(chatJson({ ...analyst, deadlineMs: 10_000, schema: Schema }));
    expect(ok.data).toEqual({ n: 1 });
  });
});

describe("failure reasons", () => {
  it("names not_configured, provider_error and timeout", async () => {
    setEnv();
    install({});
    expect((await failure(chatText(live)))!.reason).toBe("not_configured");

    configure();
    install({ verda: [{ error: { status: 401 } }] });
    expect((await failure(chatText(live)))!.reason).toBe("provider_error");

    install({ verda: [{ stall: true }] });
    const err = await failure(chatText({ ...live, timeoutMs: 20, deadlineMs: 60_000 }));
    expect(err!.reason).toBe("timeout");
  });
});

describe("queuedMs and attempts", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  }, 120_000);
  afterAll(async () => {
    await t.close();
  });

  it("reports the wait at the gate on the meta and on the llm_call row", async () => {
    configure({ LLM_MAX_CONCURRENCY: "1", LLM_LIVE_RESERVE_SLOTS: "0", VERDA_MAX_RPM: "0" });
    install({ verda: [{ text: "one", delayMs: 3_000 }, { error: { status: 500 } }, { text: "two" }] });
    const first = chatText({ ...live, purpose: "gw.first", deadlineMs: 20_000 });
    await clock.flush();
    const second = chatText({ ...live, purpose: "gw.second", db: t.db, deadlineMs: 20_000 });
    const [a, b] = await clock.settle(Promise.all([first, second]));
    expect(a.meta).toMatchObject({ queuedMs: 0, attempts: 1 });
    expect(b.meta.attempts).toBe(2);
    expect(b.meta.queuedMs).toBe(3_000);
    const [row] = await t.db.select().from(llmCall).where(eq(llmCall.purpose, "gw.second"));
    expect(row).toMatchObject({ attempts: 2, queuedMs: 3_000, ok: true });
  });

  it("logs a failed call with its attempts and wait", async () => {
    install({ verda: [{ stall: true }] });
    const err = await clock.settle(failure(chatText({ ...live, purpose: "gw.fail", db: t.db, deadlineMs: 1_000 })));
    expect(err!.reason).toBe("deadline");
    const [row] = await t.db.select().from(llmCall).where(eq(llmCall.purpose, "gw.fail"));
    expect(row).toMatchObject({ attempts: 1, queuedMs: 0, ok: false });
    expect(row.error).not.toContain("SECRET");
  });
});

describe("a live call never waits behind background calls", () => {
  it("is let in at once while analyst calls hold every background slot", async () => {
    configure({ LLM_MAX_CONCURRENCY: "3", LLM_LIVE_RESERVE_SLOTS: "2", VERDA_MAX_RPM: "0" });
    const f = install({ verda: [{ stall: true }, { text: "live answer" }, { stall: true }, { stall: true }] });
    const bg = [1, 2, 3].map(() => failure(chatText({ ...analyst, deadlineMs: 50_000 })));
    await clock.flush();
    expect(f.calls).toHaveLength(1); // one background slot, the rest queue
    const r = await chatText(live);
    expect(r.meta.queuedMs).toBe(0);
    expect(f.calls).toHaveLength(2);
    await clock.settle(Promise.all(bg));
  });

  it("is let in at once while background calls have spent their share of the minute", async () => {
    configure({ VERDA_MAX_RPM: "8", LLM_LIVE_RESERVE_RPM: "2" });
    const script: Step[] = Array.from({ length: 6 }, () => ({ text: "bg" }));
    script.push({ text: "live answer" }, { text: "bg" }, { text: "bg" });
    const f = install({ verda: script });
    const bg = Array.from({ length: 8 }, () => chatText({ ...bulk, deadlineMs: 400_000 }));
    await clock.flush();
    expect(f.calls).toHaveLength(6);
    const r = await chatText(live);
    expect(r.text).toBe("live answer");
    expect(r.meta.queuedMs).toBe(0);
    await clock.settle(Promise.all(bg));
  });
});

describe("abort and the fake", () => {
  it("aborting a call that is queued leaves no waiter behind", async () => {
    configure({ LLM_MAX_CONCURRENCY: "1", LLM_LIVE_RESERVE_SLOTS: "0", VERDA_MAX_RPM: "0" });
    install({ verda: [{ stall: true }, { text: "after" }] });
    const holder = failure(chatText({ ...live, deadlineMs: 50_000 }));
    await clock.flush();
    const ac = new AbortController();
    const queued = failure(chatText({ ...live, signal: ac.signal }));
    await clock.flush();
    expect(gateFor("verda").waiting).toBe(1);
    ac.abort();
    const err = await queued;
    expect(err!.meta.error).toBe("aborted");
    expect(gateFor("verda").waiting).toBe(0);
    expect(gateFor("verda").active).toBe(1);
    await clock.advance(50_000);
    await holder;
    expect(gateFor("verda").active).toBe(0);
  });

  it("fake mode never touches the gate or the clock", async () => {
    configure({ LLM_MAX_CONCURRENCY: "1", VERDA_MAX_RPM: "1" });
    setLlmFake(() => "canned");
    const before = clock.now();
    for (let i = 0; i < 5; i++) expect((await chatText(live)).text).toBe("canned");
    expect(clock.now()).toBe(before);
    expect(gateFor("verda").active).toBe(0);
  });
});
