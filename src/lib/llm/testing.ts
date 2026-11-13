import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resetLimiters, resetTiming, timing } from "./limiter";
import { resetJsonRejections } from "./core";
import { setClientFactory, type ClientFactory } from "./client";
import type { LlmMeta, LlmOptions } from "./types";

export type LlmFake = (opts: LlmOptions) => string | object | Promise<string | object>;

let fake: LlmFake | null = null;
let fixturesDir: string | null = null;

/** Install a fake responder for tests. With a fake set, no network client is ever created. */
export function setLlmFake(responder: LlmFake | null): void {
  fake = responder;
}
export const getLlmFake = () => fake;

/** Where recordings live. Defaults to `$LLM_FIXTURES_DIR` or `<cwd>/fixtures/llm`. */
export function setLlmFixturesDir(dir: string | null): void {
  fixturesDir = dir;
}
export function getFixturesDir(): string {
  return fixturesDir ?? process.env.LLM_FIXTURES_DIR?.trim() ?? path.join(process.cwd(), "fixtures", "llm");
}

/** Replace backoff sleeping (tests). */
export function setLlmSleep(fn: ((ms: number, signal?: AbortSignal) => Promise<void>) | null): void {
  const real = timing.sleep;
  if (fn) {
    realSleep ??= real;
    timing.sleep = fn;
  } else if (realSleep) {
    timing.sleep = realSleep;
    realSleep = null;
  }
}
let realSleep: typeof timing.sleep | null = null;

export { setClientFactory as setLlmClientFactory };
export type { ClientFactory };

/** Clear fake, factory, limiters, remembered response_format rejections and fixture dir. */
export function resetLlmState(): void {
  fake = null;
  fixturesDir = null;
  setClientFactory(null);
  setLlmSleep(null);
  resetLimiters();
  resetTiming();
  resetJsonRejections();
}

/** Stable key of a call: role, purpose, messages and the schema-independent options. */
export function recordingHash(opts: LlmOptions): string {
  const key = JSON.stringify({
    role: opts.role,
    purpose: opts.purpose,
    messages: opts.messages,
    maxTokens: opts.maxTokens ?? null,
    temperature: opts.temperature ?? null,
  });
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

const safePurpose = (p: string) => p.replace(/[^\w.-]+/g, "_") || "unknown";

export function recordingPath(opts: LlmOptions): string {
  return path.join(getFixturesDir(), safePurpose(opts.purpose), `${recordingHash(opts)}.json`);
}

export type Recording = { text: string; meta: LlmMeta };

export async function readRecording(opts: LlmOptions): Promise<Recording | null> {
  try {
    const parsed = JSON.parse(await readFile(recordingPath(opts), "utf8")) as Recording;
    return typeof parsed.text === "string" && parsed.meta ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeRecording(opts: LlmOptions, rec: Recording): Promise<void> {
  const file = recordingPath(opts);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(rec, null, 2) + "\n", "utf8");
}

export function missingRecordingMessage(opts: LlmOptions): string {
  const hash = recordingHash(opts);
  if (process.env.NODE_ENV === "test") {
    return (
      `No LLM fake installed and no recording for purpose "${opts.purpose}" (hash ${hash}). ` +
      `In tests, call setLlmFake(...) from "@/lib/llm" before the call; tests never reach a live model.`
    );
  }
  return (
    `LLM_MODE=replay but no recording for purpose "${opts.purpose}" (hash ${hash}) at ` +
    `${recordingPath(opts)}. Run once with LLM_MODE=record to create it.`
  );
}
