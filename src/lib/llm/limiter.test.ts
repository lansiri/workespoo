import { beforeEach, describe, expect, it } from "vitest";
import { Gate, GateError } from "./limiter";
import { resetLlmState } from "./testing";
import { setEnv, installVirtualClock, type VirtualClock } from "./testkit";

let clock: VirtualClock;
let gate: Gate;

function setup(vars: Record<string, string> = {}) {
  resetLlmState();
  setEnv(vars);
  clock = installVirtualClock();
  gate = new Gate("verda");
}
beforeEach(() => setup());

type Role = "live" | "analyst" | "bulk";
/** Ask for a slot and record when it is let through. Slots are kept until the test releases them. */
function ask(role: Role, name: string, log: string[], extra: { signal?: AbortSignal; deadlineAt?: number } = {}) {
  return gate.acquire({ role, ...extra }).then(
    (a) => {
      log.push(name);
      return a;
    },
    (e: unknown) => {
      log.push(`${name}:${e instanceof GateError ? e.kind : "error"}`);
      return null;
    },
  );
}

describe("Gate slots", () => {
  it("never runs more than LLM_MAX_CONCURRENCY at once and hands slots over in order", async () => {
    setup({ LLM_MAX_CONCURRENCY: "2", LLM_LIVE_RESERVE_SLOTS: "0", VERDA_MAX_RPM: "0" });
    const log: string[] = [];
    const a = await ask("live", "a", log);
    const b = await ask("live", "b", log);
    const pc = ask("live", "c", log);
    const pd = ask("live", "d", log);
    await clock.flush();
    expect(log).toEqual(["a", "b"]);
    expect(gate.active).toBe(2);
    a!.release();
    await clock.flush();
    expect(log).toEqual(["a", "b", "c"]);
    b!.release();
    await clock.flush();
    expect(log).toEqual(["a", "b", "c", "d"]);
    (await pc)!.release();
    (await pd)!.release();
    expect(gate.active).toBe(0);
  });

  it("serves live, then analyst, then bulk, first come first served within a role", async () => {
    setup({ LLM_MAX_CONCURRENCY: "1", LLM_LIVE_RESERVE_SLOTS: "0", VERDA_MAX_RPM: "0" });
    const log: string[] = [];
    const holder = await ask("bulk", "holder", log);
    const ps = [
      ask("bulk", "bulk1", log),
      ask("analyst", "analyst1", log),
      ask("bulk", "bulk2", log),
      ask("live", "live1", log),
      ask("analyst", "analyst2", log),
      ask("live", "live2", log),
    ];
    await clock.flush();
    // every admitted call gives its slot back at once, so the next waiter in line gets it
    ps.forEach((p) => void p.then((adm) => adm?.release()));
    holder!.release();
    await Promise.all(ps);
    expect(log).toEqual(["holder", "live1", "live2", "analyst1", "analyst2", "bulk1", "bulk2"]);
  });

  it("keeps LLM_LIVE_RESERVE_SLOTS free for live, with a floor of one usable slot", async () => {
    setup({ LLM_MAX_CONCURRENCY: "3", LLM_LIVE_RESERVE_SLOTS: "2", VERDA_MAX_RPM: "0" });
    const log: string[] = [];
    const a = await ask("analyst", "a1", log); // 1 usable slot for background
    void ask("bulk", "b1", log);
    void ask("analyst", "a2", log);
    await clock.flush();
    expect(log).toEqual(["a1"]);
    // live is not held up by the waiting background calls
    const l1 = await ask("live", "l1", log);
    const l2 = await ask("live", "l2", log);
    expect(log).toEqual(["a1", "l1", "l2"]);
    expect(gate.active).toBe(3);
    l1!.release();
    l2!.release();
    await clock.flush();
    expect(log).toEqual(["a1", "l1", "l2"]); // background still waits for its single slot
    a!.release();
    await clock.flush();
    expect(log.slice(3)).toEqual(["a2"]);
  });

  it("floors the usable background slots at one when the reserve is as large as the limit", async () => {
    setup({ LLM_MAX_CONCURRENCY: "2", LLM_LIVE_RESERVE_SLOTS: "5", VERDA_MAX_RPM: "0" });
    const log: string[] = [];
    await ask("bulk", "b1", log);
    void ask("bulk", "b2", log);
    await clock.flush();
    expect(log).toEqual(["b1"]);
  });

  it("release is idempotent and does not free a second slot", async () => {
    setup({ LLM_MAX_CONCURRENCY: "1", LLM_LIVE_RESERVE_SLOTS: "0", VERDA_MAX_RPM: "0" });
    const log: string[] = [];
    const a = await ask("live", "a", log);
    const pb = ask("live", "b", log);
    void ask("live", "c", log);
    a!.release();
    a!.release();
    await clock.flush();
    expect(log).toEqual(["a", "b"]);
    expect(gate.active).toBe(1);
    (await pb)!.release();
  });
});

describe("Gate requests per minute", () => {
  it("lets in budget = floor(max x LLM_RPM_SHARE) requests, then the window slides after 60 s", async () => {
    setup({ VERDA_MAX_RPM: "10", LLM_RPM_SHARE: "0.5", LLM_LIVE_RESERVE_RPM: "0" });
    const log: string[] = [];
    const start = clock.now();
    for (let i = 0; i < 5; i++) (await ask("live", `r${i}`, log))!.release();
    const p = ask("live", "late", log);
    await clock.advance(59_000);
    expect(log).toHaveLength(5);
    await clock.advance(1_001);
    expect(log).toHaveLength(6);
    expect((await p)!.waitedMs).toBeGreaterThanOrEqual(60_000);
    expect(clock.now() - start).toBeGreaterThanOrEqual(60_000);
  });

  it("slides one request at a time as old ones leave the window", async () => {
    setup({ VERDA_MAX_RPM: "2", LLM_LIVE_RESERVE_RPM: "0" });
    const log: string[] = [];
    (await ask("live", "t0", log))!.release();
    await clock.advance(10_000);
    (await ask("live", "t10", log))!.release();
    const p = ask("live", "t20", log);
    await clock.advance(49_000);
    expect(log).toEqual(["t0", "t10"]);
    await clock.advance(1_500);
    expect(log).toEqual(["t0", "t10", "t20"]);
    (await p)!.release();
  });

  it("keeps LLM_LIVE_RESERVE_RPM of the minute for live and floors the background budget at one", async () => {
    setup({ VERDA_MAX_RPM: "10", LLM_LIVE_RESERVE_RPM: "6" });
    const log: string[] = [];
    for (let i = 0; i < 4; i++) (await ask("analyst", `a${i}`, log))!.release();
    void ask("bulk", "b-blocked", log);
    await clock.flush();
    expect(log).toHaveLength(4);
    for (let i = 0; i < 6; i++) (await ask("live", `l${i}`, log))!.release();
    expect(log.filter((x) => x.startsWith("l"))).toHaveLength(6);
    expect(log).not.toContain("b-blocked");

    setup({ VERDA_MAX_RPM: "3", LLM_LIVE_RESERVE_RPM: "6" });
    const log2: string[] = [];
    (await ask("bulk", "only", log2))!.release();
    void ask("bulk", "second", log2);
    await clock.flush();
    expect(log2).toEqual(["only"]);
  });

  it("treats VERDA_MAX_RPM=0 as no per-minute limit and defaults to 36 and 30", async () => {
    setup({ VERDA_MAX_RPM: "0", LLM_MAX_CONCURRENCY: "100" });
    const log: string[] = [];
    for (let i = 0; i < 80; i++) void ask("bulk", `x${i}`, log);
    await clock.flush();
    expect(log).toHaveLength(80);

    setup({ LLM_MAX_CONCURRENCY: "100", LLM_LIVE_RESERVE_RPM: "0" });
    const v: string[] = [];
    for (let i = 0; i < 40; i++) void ask("live", `v${i}`, v);
    await clock.flush();
    expect(v).toHaveLength(36);
    gate = new Gate("nvidia");
    const n: string[] = [];
    for (let i = 0; i < 40; i++) void ask("live", `n${i}`, n);
    await clock.flush();
    expect(n).toHaveLength(30);
  });

  it("a live call never waits behind background calls for the minute budget", async () => {
    setup({ VERDA_MAX_RPM: "8", LLM_LIVE_RESERVE_RPM: "2" });
    const log: string[] = [];
    for (let i = 0; i < 12; i++) void ask("bulk", `b${i}`, log);
    await clock.flush();
    expect(log).toHaveLength(6);
    const l = await ask("live", "live", log);
    expect(l!.waitedMs).toBe(0);
  });
});

describe("Gate pause after HTTP 429", () => {
  it("holds background roles for the Retry-After time and live for at most one second", async () => {
    setup({ VERDA_MAX_RPM: "0" });
    const log: string[] = [];
    gate.pause(8_000);
    void ask("bulk", "bulk", log);
    void ask("analyst", "analyst", log);
    const live = ask("live", "live", log);
    await clock.advance(900);
    expect(log).toEqual([]);
    await clock.advance(200);
    expect(log).toEqual(["live"]);
    await clock.advance(6_800);
    expect(log).toEqual(["live"]);
    await clock.advance(200);
    expect(log).toEqual(["live", "analyst", "bulk"]);
    (await live)!.release();
  });

  it("uses 10 s when Retry-After is missing and never more than 60 s", async () => {
    setup({ VERDA_MAX_RPM: "0" });
    const log: string[] = [];
    gate.pause(undefined);
    void ask("analyst", "a", log);
    await clock.advance(9_900);
    expect(log).toEqual([]);
    await clock.advance(200);
    expect(log).toEqual(["a"]);

    gate.pause(500_000);
    void ask("bulk", "b", log);
    await clock.advance(59_900);
    expect(log).toEqual(["a"]);
    await clock.advance(200);
    expect(log).toEqual(["a", "b"]);
  });
});

describe("Gate abort and deadline", () => {
  it("an aborted waiter leaves no waiter behind and frees no slot twice", async () => {
    setup({ LLM_MAX_CONCURRENCY: "1", LLM_LIVE_RESERVE_SLOTS: "0", VERDA_MAX_RPM: "0" });
    const log: string[] = [];
    const holder = await ask("live", "holder", log);
    const ac = new AbortController();
    const aborted = ask("live", "aborted", log, { signal: ac.signal });
    const next = ask("live", "next", log);
    await clock.flush();
    expect(gate.waiting).toBe(2);
    ac.abort();
    await clock.flush();
    expect(log).toContain("aborted:aborted");
    expect(gate.waiting).toBe(1);
    await aborted;
    holder!.release();
    await clock.flush();
    expect(log).toContain("next"); // the wake-up was not swallowed by the aborted waiter
    expect(gate.active).toBe(1);
    (await next)!.release();
    expect(gate.active).toBe(0);
  });

  it("rejects at once when already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(gate.acquire({ role: "live", signal: ac.signal })).rejects.toMatchObject({ kind: "aborted" });
    expect(gate.waiting).toBe(0);
  });

  it("an aborted higher-priority waiter stops blocking the ones behind it", async () => {
    setup({ VERDA_MAX_RPM: "10", LLM_LIVE_RESERVE_RPM: "0" });
    const log: string[] = [];
    gate.pause(5_000); // everything waits; live is released after 1 s
    const ac = new AbortController();
    void ask("live", "live", log, { signal: ac.signal });
    void ask("analyst", "analyst", log);
    ac.abort();
    await clock.advance(5_100);
    expect(log).toEqual(["live:aborted", "analyst"]);
  });

  it("fails a waiter whose deadline passes in the queue", async () => {
    setup({ LLM_MAX_CONCURRENCY: "1", LLM_LIVE_RESERVE_SLOTS: "0", VERDA_MAX_RPM: "0" });
    const log: string[] = [];
    await ask("live", "holder", log);
    void ask("live", "late", log, { deadlineAt: clock.now() + 2_000 });
    await clock.advance(1_900);
    expect(log).toEqual(["holder"]);
    await clock.advance(200);
    expect(log).toEqual(["holder", "late:deadline"]);
    expect(gate.waiting).toBe(0);
  });

  it("rejects at once when the deadline has already passed", async () => {
    await expect(gate.acquire({ role: "live", deadlineAt: clock.now() - 1 })).rejects.toMatchObject({ kind: "deadline" });
  });
});
