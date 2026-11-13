import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { llmCall } from "@/db/schema";
import { chatJson, chatStream, chatText, LlmError, resetLlmState, setLlmClientFactory, setLlmSleep, type LlmOptions } from "./index";
import { fakeProviders, setEnv, type Step } from "./testkit";

const KEY_N = "nvapi-SECRETKEY-1234567890";
const KEY_V = "verda-SECRETKEY-abcdef";
const base: LlmOptions = { role: "live", purpose: "test.purpose", messages: [{ role: "user", content: "hi" }] };
let delays: number[] = [];

function configure(extra: Record<string, string> = {}) {
  setEnv({
    LLM_LIVE: "nvidia:nvidia/model:one,verda:vmodel",
    LLM_ANALYST: "nvidia:nvidia/model:one,verda:vmodel",
    NVIDIA_API_KEY: KEY_N,
    VERDA_API_KEY: KEY_V,
    VERDA_BASE_URL: "http://verda.test/v1",
    ...extra,
  });
}
function install(script: Record<string, Step[]>) {
  const f = fakeProviders(script);
  setLlmClientFactory(f.factory);
  return f;
}
async function drain(s: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const t of s) out.push(t);
  return out;
}

beforeEach(() => {
  resetLlmState();
  configure();
  delays = [];
  setLlmSleep(async (ms) => void delays.push(ms));
});

describe("chatText", () => {
  it("returns text with meta, uses defaults and sends the model id intact", async () => {
    const f = install({ nvidia: [{ text: "Hello", usage: { prompt_tokens: 3, completion_tokens: 4 } }] });
    const r = await chatText(base);
    expect(r.text).toBe("Hello");
    expect(r.meta).toMatchObject({ provider: "nvidia", model: "nvidia/model:one", ok: true, error: null, attempts: 1, tokensIn: 3, tokensOut: 4 });
    expect(f.calls[0].body).toMatchObject({ model: "nvidia/model:one", max_tokens: 800, temperature: 0.2, stream: false });
  });
  it("strips think blocks and never returns reasoning_content", async () => {
    install({ nvidia: [{ text: "<think>plan</think>\nAnswer" }] });
    const r = await chatText(base);
    expect(r.text).toBe("Answer");
    expect(r.text).not.toContain("SECRET-REASONING");
  });
  it("merges the configured extra body", async () => {
    configure({ LLM_EXTRA_BODY_LIVE: '{"chat_template_kwargs":{"enable_thinking":false}}' });
    const f = install({ nvidia: [{ text: "x" }] });
    await chatText(base);
    expect(f.calls[0].body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });
  it("throws a safe LlmError when no provider is configured, and creates no client", async () => {
    setEnv();
    const f = install({});
    await expect(chatText(base)).rejects.toBeInstanceOf(LlmError);
    expect(f.created).toEqual([]);
  });
});

describe("retries and fallback", () => {
  it("moves to the next listed provider at once on a 429, without waiting", async () => {
    const f = install({ nvidia: [{ error: { status: 429, headers: { "retry-after": "2" } } }], verda: [{ text: "ok" }] });
    const r = await chatText(base);
    expect(r.meta).toMatchObject({ provider: "verda", attempts: 2 });
    expect(r.meta.queuedMs).toBeLessThan(50);
    expect(delays).toEqual([]);
    expect(f.calls.map((c) => c.provider)).toEqual(["nvidia", "verda"]);
  });
  it("retries twice then falls through after repeated 500s", async () => {
    const f = install({ nvidia: [{ error: { status: 500 } }, { error: { status: 503 } }, { error: { status: 500 } }], verda: [{ text: "from verda" }] });
    const r = await chatText(base);
    expect(r.text).toBe("from verda");
    expect(r.meta).toMatchObject({ provider: "verda", model: "vmodel", attempts: 4 });
    expect(f.calls.filter((c) => c.provider === "nvidia")).toHaveLength(3);
    expect(delays).toHaveLength(2);
  });
  it("retries on network errors", async () => {
    install({ nvidia: [{ error: {} }, { text: "ok" }] });
    expect((await chatText(base)).meta.attempts).toBe(2);
  });
  it("falls through immediately on 401 and on 400", async () => {
    for (const status of [401, 400]) {
      const f = install({ nvidia: [{ error: { status } }], verda: [{ text: "v" }] });
      const r = await chatText(base);
      expect(r.text).toBe("v");
      expect(f.calls.filter((c) => c.provider === "nvidia")).toHaveLength(1);
      expect(delays).toEqual([]);
    }
  });
  it("throws one LlmError with no key or prompt text when everything fails", async () => {
    install({ nvidia: [{ error: { status: 401 } }], verda: [{ error: { status: 401 } }] });
    const err = await chatText(base).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.message).toContain("All LLM providers failed");
    expect(err.message).not.toContain(KEY_N);
    expect(err.message).not.toContain("SECRET-PROMPT-TEXT");
    expect(err.meta.ok).toBe(false);
  });
});

describe("chatStream", () => {
  it("yields deltas as they arrive and resolves meta", async () => {
    install({ nvidia: [{ pieces: ["Hel", "lo ", "world"], reasoning: ["SECRET-REASONING"] }] });
    const s = chatStream(base);
    const out = await drain(s);
    expect(out.join("")).toBe("Hello world");
    expect(out.join("")).not.toContain("SECRET");
    const meta = await s.meta;
    expect(meta).toMatchObject({ ok: true, provider: "nvidia", tokensOut: 7 });
    expect(meta.firstTokenMs).not.toBeNull();
  });
  it("strips think blocks split across chunks, and unterminated ones", async () => {
    install({ nvidia: [{ pieces: ["<thi", "nk>hidden</th", "ink>Visi", "ble"] }, { pieces: ["Shown<think>never end", "ing"] }] });
    expect((await drain(chatStream(base))).join("")).toBe("Visible");
    expect((await drain(chatStream(base))).join("")).toBe("Shown");
  });
  it("falls through before any text, but not after text was yielded", async () => {
    install({ nvidia: [{ error: { status: 500 } }, { error: { status: 500 } }, { error: { status: 500 } }], verda: [{ pieces: ["a", "b"] }] });
    const s = chatStream(base);
    expect((await drain(s)).join("")).toBe("ab");
    expect((await s.meta).provider).toBe("verda");

    const f = install({ nvidia: [{ pieces: ["partial"], errorAfter: { status: 500 } }], verda: [{ text: "SHOULD NOT BE USED" }] });
    const s2 = chatStream(base);
    const got: string[] = [];
    await expect((async () => { for await (const t of s2) got.push(t); })()).rejects.toBeInstanceOf(LlmError);
    expect(got.join("")).toBe("partial");
    expect(f.calls.map((c) => c.provider)).toEqual(["nvidia"]);
    expect(await s2.meta).toMatchObject({ ok: false, provider: "nvidia" });
  });
  it("aborting after text arrived stops the upstream stream and counts as a completed call", async () => {
    const f = install({ nvidia: [{ pieces: ["first"], hang: true }] });
    const ac = new AbortController();
    const s = chatStream({ ...base, signal: ac.signal });
    const got: string[] = [];
    for await (const t of s) {
      got.push(t);
      ac.abort();
    }
    expect(got).toEqual(["first"]);
    const meta = await s.meta;
    // The interviewer's guard does exactly this after the question: not a failure.
    expect(meta).toMatchObject({ ok: true, error: null });
    expect(meta.firstTokenMs).not.toBeNull();
    await new Promise((r) => setTimeout(r, 10));
    expect(f.closed).toBe(1);
  });
  it("resolves meta on abort even when the consumer stopped reading", async () => {
    install({ nvidia: [{ pieces: ["x"], hang: true }] });
    const ac = new AbortController();
    const s = chatStream({ ...base, signal: ac.signal });
    const it = s[Symbol.asyncIterator]();
    await it.next();
    ac.abort();
    expect(await s.meta).toMatchObject({ ok: true, error: null });
  });
  it("an abort before any text arrived is recorded as aborted, not as a completed call", async () => {
    install({ nvidia: [{ pieces: [], hang: true }] });
    const ac = new AbortController();
    const s = chatStream({ ...base, signal: ac.signal });
    const it = s[Symbol.asyncIterator]();
    const pending = it.next();
    await new Promise((r) => setTimeout(r, 10));
    ac.abort();
    await pending.catch(() => {});
    expect(await s.meta).toMatchObject({ ok: false, error: "aborted", firstTokenMs: null });
  });
});

describe("chatJson", () => {
  const Schema = z.object({ skill: z.string(), years: z.number() });
  const json = (o: unknown) => JSON.stringify(o);

  it("requests json_object by default and parses fences and leading prose", async () => {
    const f = install({ nvidia: [{ text: 'Sure! Here you go:\n```json\n' + json({ skill: "welding", years: 3 }) + '\n```\nHope it helps' }] });
    const r = await chatJson({ ...base, schema: Schema });
    expect(r.data).toEqual({ skill: "welding", years: 3 });
    expect(f.calls[0].body.response_format).toEqual({ type: "json_object" });
  });
  it("supports json_schema and none modes", async () => {
    configure({ LLM_JSON_MODE: "json_schema" });
    let f = install({ nvidia: [{ text: json({ skill: "a", years: 1 }) }] });
    await chatJson({ ...base, schema: Schema });
    expect((f.calls[0].body.response_format as { type: string }).type).toBe("json_schema");
    configure({ LLM_JSON_MODE: "none" });
    f = install({ nvidia: [{ text: json({ skill: "a", years: 1 }) }] });
    await chatJson({ ...base, schema: Schema });
    expect(f.calls[0].body.response_format).toBeUndefined();
  });
  it("applies coerce before validation", async () => {
    install({ nvidia: [{ text: json({ skill: "a", years: "4" }) }] });
    const r = await chatJson({ ...base, schema: Schema, coerce: (raw) => ({ ...(raw as object), years: Number((raw as { years: string }).years) }) });
    expect(r.data).toEqual({ skill: "a", years: 4 });
  });
  it("retries once with the exact retry message, then succeeds", async () => {
    const f = install({ nvidia: [{ text: json({ skill: "a" }) }, { text: json({ skill: "a", years: 2 }) }] });
    const r = await chatJson({ ...base, schema: Schema });
    expect(r.data).toEqual({ skill: "a", years: 2 });
    const msgs = f.calls[1].body.messages as Array<{ role: string; content: string }>;
    const last = msgs[msgs.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toMatch(/^Your output was not valid\. Error: .*years.*\. Return only the JSON object in the exact format\.$/);
    expect(r.meta.attempts).toBe(2);
  });
  it("resolves data null after a second failure and does not throw", async () => {
    const f = install({ nvidia: [{ text: "not json" }, { text: json({ skill: 1 }) }] });
    const r = await chatJson({ ...base, schema: Schema });
    expect(r.data).toBeNull();
    expect(r).toHaveProperty("error");
    expect(r.meta.ok).toBe(false);
    expect(f.calls).toHaveLength(2);
  });
  it("resolves data null when the provider fails", async () => {
    install({ nvidia: [{ error: { status: 401 } }], verda: [{ error: { status: 401 } }] });
    const r = await chatJson({ ...base, schema: Schema });
    expect(r.data).toBeNull();
  });
  it("retries without response_format after a 400 and remembers it for provider and model", async () => {
    const f = install({
      nvidia: [{ error: { status: 400 } }, { text: json({ skill: "a", years: 1 }) }, { text: json({ skill: "b", years: 2 }) }],
    });
    const r = await chatJson({ ...base, schema: Schema });
    expect(r.data).toEqual({ skill: "a", years: 1 });
    expect(f.calls.map((c) => c.provider)).toEqual(["nvidia", "nvidia"]);
    expect(f.calls[0].body.response_format).toBeDefined();
    expect(f.calls[1].body.response_format).toBeUndefined();
    expect(delays).toEqual([]);
    await chatJson({ ...base, schema: Schema });
    expect(f.calls[2].body.response_format).toBeUndefined();
  });
});

describe("llm_call logging", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  }, 120_000);
  afterAll(async () => {
    await t.close();
  });

  it("writes one row per call with the final provider and the guard", async () => {
    install({ nvidia: [{ error: { status: 400 } }], verda: [{ text: "hej", usage: { prompt_tokens: 2, completion_tokens: 3 } }] });
    await chatText({ ...base, purpose: "log.text", db: t.db, guard: "dropped_praise" });
    const rows = await t.db.select().from(llmCall).where(eq(llmCall.purpose, "log.text"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ role: "live", provider: "verda", model: "vmodel", ok: true, error: null, guard: "dropped_praise", tokensIn: 2, tokensOut: 3 });
  });
  it("logs failures without any key", async () => {
    install({ nvidia: [{ error: { status: 401 } }], verda: [{ error: { status: 401 } }] });
    await expect(chatText({ ...base, purpose: "log.fail", db: t.db })).rejects.toBeInstanceOf(LlmError);
    const [row] = await t.db.select().from(llmCall).where(eq(llmCall.purpose, "log.fail"));
    expect(row.ok).toBe(false);
    expect(row.error).toContain("HTTP 401");
    expect(row.error).not.toContain(KEY_V);
  });
  it("logs streams once and chatJson once", async () => {
    install({ nvidia: [{ pieces: ["a", "b"] }, { text: '{"skill":"x","years":1}' }] });
    await drain(chatStream({ ...base, purpose: "log.stream", db: t.db }));
    await chatJson({ ...base, purpose: "log.json", db: t.db, schema: z.object({ skill: z.string(), years: z.number() }) });
    expect(await t.db.select().from(llmCall).where(eq(llmCall.purpose, "log.stream"))).toHaveLength(1);
    expect(await t.db.select().from(llmCall).where(eq(llmCall.purpose, "log.json"))).toHaveLength(1);
  });
  it("swallows a logging failure", async () => {
    install({ nvidia: [{ text: "fine" }] });
    const broken = { insert: () => { throw new Error("db down"); } } as unknown as typeof t.db;
    const r = await chatText({ ...base, db: broken });
    expect(r.text).toBe("fine");
  });
});
