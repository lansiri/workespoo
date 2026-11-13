import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { chatJson, chatStream, chatText, recordingHash, resetLlmState, setLlmClientFactory, setLlmFake, setLlmFixturesDir, type LlmOptions } from "./index";
import { fakeProviders, setEnv } from "./testkit";

const opts: LlmOptions = { role: "analyst", purpose: "fake.test", messages: [{ role: "user", content: "hello" }] };
let dir: string;

beforeEach(async () => {
  resetLlmState();
  setEnv();
  dir = await mkdtemp(path.join(os.tmpdir(), "llm-fix-"));
  setLlmFixturesDir(dir);
});
afterEach(async () => {
  resetLlmState();
  await rm(dir, { recursive: true, force: true });
});

describe("setLlmFake", () => {
  it("serves a string responder to text and stream, in several chunks, with no client created", async () => {
    let created = 0;
    setLlmClientFactory(() => { created++; throw new Error("no network"); });
    setLlmFake((o) => `echo:${o.messages[0].content}`);
    expect((await chatText(opts)).text).toBe("echo:hello");
    const s = chatStream(opts);
    const parts: string[] = [];
    for await (const p of s) parts.push(p);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("")).toBe("echo:hello");
    expect(await s.meta).toMatchObject({ provider: "fake", ok: true });
    expect(created).toBe(0);
  });
  it("JSON-stringifies an object responder and validates it through chatJson", async () => {
    setLlmFake(async () => ({ n: 3 }));
    const r = await chatJson({ ...opts, schema: z.object({ n: z.number() }) });
    expect(r.data).toEqual({ n: 3 });
  });
  it("lets a responder see the retry message", async () => {
    let calls = 0;
    setLlmFake((o) => (++calls === 1 ? "{}" : o.messages.at(-1)!.content.startsWith("Your output was not valid") ? { n: 1 } : "{}"));
    const r = await chatJson({ ...opts, schema: z.object({ n: z.number() }) });
    expect(r.data).toEqual({ n: 1 });
  });
  it("reports a throwing responder as an LlmError", async () => {
    setLlmFake(() => { throw new Error("boom"); });
    await expect(chatText(opts)).rejects.toThrow("boom");
  });
});

describe("replay and record", () => {
  it("replay without a fake or recording names purpose and hash; in tests it says to install a fake", async () => {
    setEnv({ LLM_MODE: "replay" });
    const err = (await chatText(opts).catch((e) => e)) as Error;
    expect(err.message).toContain("fake.test");
    expect(err.message).toContain(recordingHash(opts));
    expect(err.message).toContain("setLlmFake");
  });
  it("outside tests the replay miss points at LLM_MODE=record", async () => {
    setEnv({ LLM_MODE: "replay" });
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "development";
    try {
      const err = (await chatText(opts).catch((e) => e)) as Error;
      expect(err.message).toContain("LLM_MODE=record");
      expect(err.message).toContain(recordingHash(opts));
    } finally {
      (process.env as Record<string, string>).NODE_ENV = prev!;
    }
  });
  it("record writes a fixture that replay then serves", async () => {
    setEnv({
      LLM_MODE: "record",
      LLM_ANALYST: "nvidia:m",
      NVIDIA_API_KEY: "nvapi-SECRET",
    });
    setLlmClientFactory(fakeProviders({ nvidia: [{ text: "recorded answer" }] }).factory);
    expect((await chatText(opts)).text).toBe("recorded answer");
    const file = path.join(dir, "fake.test", `${recordingHash(opts)}.json`);
    const saved = JSON.parse(await readFile(file, "utf8"));
    expect(saved.text).toBe("recorded answer");
    expect(saved.meta.provider).toBe("nvidia");
    expect(JSON.stringify(saved)).not.toContain("nvapi-SECRET");
    expect(await readdir(path.join(dir, "fake.test"))).toHaveLength(1);

    setEnv({ LLM_MODE: "replay" });
    setLlmClientFactory(() => { throw new Error("replay must not build a client"); });
    expect((await chatText(opts)).text).toBe("recorded answer");
    const s = chatStream(opts);
    let out = "";
    for await (const p of s) out += p;
    expect(out).toBe("recorded answer");
  });
  it("the hash ignores signal, timeout, db and guard but not messages", () => {
    const h = recordingHash(opts);
    expect(recordingHash({ ...opts, timeoutMs: 1, guard: "x", signal: new AbortController().signal })).toBe(h);
    expect(recordingHash({ ...opts, messages: [{ role: "user", content: "other" }] })).not.toBe(h);
  });
});
