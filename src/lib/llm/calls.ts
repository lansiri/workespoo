import { z } from "zod";
import { llmCall } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { llmConfigured as configured } from "./config";
import { buildMeta, newState, redact, runReal } from "./core";
import { parseLenientJson, retryMessage, summariseZodError } from "./json";
import {
  getLlmFake,
  missingRecordingMessage,
  readRecording,
  writeRecording,
} from "./testing";
import { LlmError, type CallState, type Internal, type LlmMeta, type LlmOptions } from "./types";
import type { LlmRole } from "@/contracts/trust";

function chunks(text: string): string[] {
  if (!text) return [];
  const size = Math.max(1, Math.ceil(text.length / 3));
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

async function* canned(
  text: string,
  opts: LlmOptions,
  state: CallState,
  provider: string,
  model: string,
): AsyncGenerator<string, void, void> {
  state.provider = provider;
  state.model = model;
  state.attempts = 1;
  for (const c of chunks(text)) {
    if (opts.signal?.aborted) {
      state.meta = buildMeta(state, false, "aborted");
      return;
    }
    state.firstTokenMs ??= Date.now() - state.startedAt;
    yield c;
  }
  state.meta = buildMeta(state, true, null);
}

/** Fake, replay, record or real, in that order of precedence. Yields text deltas. */
async function* source(opts: LlmOptions, internal: Internal, state: CallState): AsyncGenerator<string, void, void> {
  const fake = getLlmFake();
  if (fake) {
    let out: string | object;
    try {
      out = await fake(opts);
    } catch (e) {
      state.provider = "fake";
      state.model = "fake";
      state.attempts = 1;
      const message = `LLM fake threw: ${e instanceof Error ? e.message : String(e)}`;
      state.meta = buildMeta(state, false, message);
      throw new LlmError(message, state.meta);
    }
    yield* canned(typeof out === "string" ? out : JSON.stringify(out), opts, state, "fake", "fake");
    return;
  }

  const mode = getEnv().LLM_MODE;
  if (mode === "replay") {
    const rec = await readRecording(opts);
    if (!rec) {
      const message = missingRecordingMessage(opts);
      state.provider = "replay";
      state.model = "replay";
      state.meta = buildMeta(state, false, message);
      throw new LlmError(message, state.meta);
    }
    yield* canned(rec.text, opts, state, rec.meta.provider, rec.meta.model);
    state.tokensIn = rec.meta.tokensIn;
    state.tokensOut = rec.meta.tokensOut;
    if (state.meta) state.meta = { ...state.meta, tokensIn: rec.meta.tokensIn, tokensOut: rec.meta.tokensOut };
    return;
  }

  let text = "";
  for await (const t of runReal(opts, internal, state)) {
    text += t;
    yield t;
  }
  if (mode === "record" && state.meta?.ok) {
    try {
      await writeRecording(opts, { text, meta: state.meta });
    } catch {
      // recording is a convenience; never fail the call
    }
  }
}

/** One `llm_call` row. A logging failure never fails the call. */
export async function logCall(opts: LlmOptions, meta: LlmMeta): Promise<void> {
  if (!opts.db) return;
  try {
    await opts.db.insert(llmCall).values({
      role: opts.role,
      provider: meta.provider,
      model: meta.model,
      purpose: opts.purpose.slice(0, 80),
      latencyMs: meta.latencyMs,
      firstTokenMs: meta.firstTokenMs,
      tokensIn: meta.tokensIn,
      tokensOut: meta.tokensOut,
      ok: meta.ok,
      error: meta.error ? redact(meta.error).slice(0, 500) : null,
      guard: opts.guard ? opts.guard.slice(0, 120) : null,
    });
  } catch {
    // swallow: observability must not break the product
  }
}

/** Collect a full text answer. Throws `LlmError` on failure or abort. No logging. */
async function collect(opts: LlmOptions, internal: Internal): Promise<{ text: string; meta: LlmMeta }> {
  const state = newState();
  let text = "";
  try {
    for await (const t of source(opts, internal, state)) text += t;
  } catch (e) {
    if (e instanceof LlmError) throw e;
    const message = redact(e instanceof Error ? e.message : "LLM call failed");
    state.meta = buildMeta(state, false, message);
    throw new LlmError(message, state.meta);
  }
  const meta = state.meta ?? buildMeta(state, true, null);
  if (!meta.ok) throw new LlmError(meta.error ?? "LLM call failed", meta);
  return { text, meta };
}

export async function chatText(opts: LlmOptions): Promise<{ text: string; meta: LlmMeta }> {
  try {
    const r = await collect(opts, { stream: false });
    await logCall(opts, r.meta);
    return r;
  } catch (e) {
    if (e instanceof LlmError) await logCall(opts, e.meta);
    throw e;
  }
}

export function chatStream(opts: LlmOptions): AsyncIterable<string> & { meta: Promise<LlmMeta> } {
  const state = newState();
  let resolveMeta!: (m: LlmMeta) => void;
  const meta = new Promise<LlmMeta>((r) => (resolveMeta = r));
  let done = false;
  const finish = async (error: string | null) => {
    if (done) return;
    done = true;
    const m = state.meta ?? buildMeta(state, error === null, error);
    resolveMeta(m);
    await logCall(opts, m);
  };
  const onAbort = () => void finish("aborted");
  if (opts.signal?.aborted) onAbort();
  else opts.signal?.addEventListener("abort", onAbort, { once: true });

  async function* gen(): AsyncGenerator<string, void, void> {
    try {
      for await (const t of source(opts, { stream: true }, state)) yield t;
      await finish(null);
    } catch (e) {
      await finish(e instanceof Error ? redact(e.message) : "LLM call failed");
      throw e;
    } finally {
      opts.signal?.removeEventListener("abort", onAbort);
      await finish("stream closed before completion");
    }
  }
  const it = gen();
  return { [Symbol.asyncIterator]: () => it, meta };
}

function mergeMeta(a: LlmMeta, b: LlmMeta): LlmMeta {
  const add = (x: number | null, y: number | null) => (x === null && y === null ? null : (x ?? 0) + (y ?? 0));
  return {
    ...b,
    latencyMs: a.latencyMs + b.latencyMs,
    firstTokenMs: a.firstTokenMs ?? b.firstTokenMs,
    tokensIn: add(a.tokensIn, b.tokensIn),
    tokensOut: add(a.tokensOut, b.tokensOut),
    attempts: a.attempts + b.attempts,
  };
}

type JsonResult<T> = { data: T; meta: LlmMeta } | { data: null; error: string; meta: LlmMeta };

export async function chatJson<T>(
  opts: LlmOptions & { schema: z.ZodType<T>; coerce?: (raw: unknown) => unknown },
): Promise<JsonResult<T>> {
  const { schema, coerce, ...base } = opts;
  const internal: Internal = { stream: false, json: { schema } };

  const validate = (text: string): { ok: true; data: T } | { ok: false; error: string } => {
    let raw: unknown;
    try {
      raw = parseLenientJson(text);
    } catch (e) {
      return { ok: false, error: `Output was not parseable JSON: ${e instanceof Error ? e.message : "parse error"}` };
    }
    try {
      if (coerce) raw = coerce(raw);
    } catch (e) {
      return { ok: false, error: `coerce failed: ${e instanceof Error ? e.message : "error"}` };
    }
    const r = schema.safeParse(raw);
    return r.success ? { ok: true, data: r.data } : { ok: false, error: summariseZodError(r.error) };
  };

  const finish = async (meta: LlmMeta, data: T | null, error: string | null): Promise<JsonResult<T>> => {
    const final: LlmMeta = { ...meta, ok: data !== null, error };
    await logCall(base, final);
    return data !== null ? { data, meta: final } : { data: null, error: error ?? "invalid output", meta: final };
  };

  let first: { text: string; meta: LlmMeta };
  try {
    first = await collect(base, internal);
  } catch (e) {
    const err = e instanceof LlmError ? e : new LlmError("LLM call failed", newMetaFor(base));
    return finish(err.meta, null, err.message);
  }
  const v1 = validate(first.text);
  if (v1.ok) return finish(first.meta, v1.data, null);

  const retryMessages = [
    ...base.messages,
    ...(first.text ? [{ role: "assistant" as const, content: first.text }] : []),
    { role: "user" as const, content: retryMessage(v1.error) },
  ];
  let second: { text: string; meta: LlmMeta };
  try {
    second = await collect({ ...base, messages: retryMessages }, internal);
  } catch (e) {
    const err = e instanceof LlmError ? e : new LlmError("LLM call failed", first.meta);
    return finish(mergeMeta(first.meta, err.meta), null, err.message);
  }
  const merged = mergeMeta(first.meta, second.meta);
  const v2 = validate(second.text);
  return v2.ok ? finish(merged, v2.data, null) : finish(merged, null, v2.error.slice(0, 300));
}

function newMetaFor(opts: LlmOptions): LlmMeta {
  void opts;
  return buildMeta(newState(), false, "LLM call failed");
}

export function llmConfigured(role: LlmRole): boolean {
  return getLlmFake() !== null || configured(role);
}
