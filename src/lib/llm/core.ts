import { z } from "zod";
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  configuredSecrets,
  defaultTimeoutMs,
  getExtraBody,
  getJsonMode,
  getProvider,
  getRoleEntries,
  maxConcurrency,
  nvidiaMaxRpm,
  type RoleEntry,
} from "./config";
import { getClient, type ChatClient, type CompletionResult, type StreamChunk } from "./client";
import { rpmFor, semaphoreFor, timing } from "./limiter";
import { ThinkStripper } from "./think";
import { LlmError, type CallState, type Internal, type LlmMeta, type LlmOptions } from "./types";

const MAX_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 20_000;

/** `provider:model` pairs that rejected `response_format`, for the life of the process. */
const jsonRejected = new Set<string>();
export function resetJsonRejections(): void {
  jsonRejected.clear();
}
export const jsonWasRejected = (e: RoleEntry) => jsonRejected.has(`${e.provider}:${e.model}`);

export function newState(provider = "none", model = "none"): CallState {
  return {
    startedAt: timing.now(),
    provider,
    model,
    attempts: 0,
    firstTokenMs: null,
    tokensIn: null,
    tokensOut: null,
  };
}

export function buildMeta(s: CallState, ok: boolean, error: string | null): LlmMeta {
  return {
    provider: s.provider,
    model: s.model,
    latencyMs: Math.max(0, Math.round(timing.now() - s.startedAt)),
    firstTokenMs: s.firstTokenMs === null ? null : Math.round(s.firstTokenMs),
    tokensIn: s.tokensIn,
    tokensOut: s.tokensOut,
    ok,
    error,
    attempts: s.attempts,
  };
}

class TimeoutMarker extends Error {}
class AbortMarker extends Error {}

type Classified = { kind: "retry" | "next"; status?: number; retryAfterMs?: number; message: string };

function headerValue(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== "object") return null;
  const h = headers as { get?: (n: string) => string | null } & Record<string, unknown>;
  if (typeof h.get === "function") return h.get(name);
  const v = h[name] ?? h[name.toLowerCase()];
  return typeof v === "string" ? v : null;
}

function parseRetryAfter(v: string | null): number | undefined {
  if (!v) return undefined;
  const secs = Number(v);
  const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(v) - timing.now();
  return Number.isFinite(ms) && ms >= 0 ? Math.min(ms, MAX_RETRY_AFTER_MS) : undefined;
}

export function redact(text: string): string {
  let out = text;
  for (const k of configuredSecrets()) out = out.split(k).join("[redacted]");
  return out;
}

/** A message that never carries prompt, output or key text. */
function classify(e: unknown, entry: RoleEntry): Classified {
  const who = `${entry.provider}:${entry.model}`;
  if (e instanceof TimeoutMarker) return { kind: "next", message: `${who} timed out` };
  const status = (e as { status?: unknown } | null)?.status;
  if (typeof status === "number") {
    const code = (e as { code?: unknown }).code;
    const suffix = typeof code === "string" && /^[\w.-]{1,40}$/.test(code) ? ` (${code})` : "";
    const message = redact(`${who} returned HTTP ${status}${suffix}`);
    const retryable = status === 429 || status >= 500;
    return {
      kind: retryable ? "retry" : "next",
      status,
      retryAfterMs: parseRetryAfter(headerValue((e as { headers?: unknown }).headers, "retry-after")),
      message,
    };
  }
  return { kind: "retry", message: `${who} network error` };
}

function backoffMs(retry: number, c: Classified): number {
  if (c.retryAfterMs !== undefined) return c.retryAfterMs;
  return 400 * 2 ** retry + Math.floor(Math.random() * 200);
}

function numberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

type Sent = { client: ChatClient; body: Record<string, unknown>; stream: boolean; timeoutMs: number; signal?: AbortSignal };

/** One upstream request. Yields clean text; reasoning fields are never read. */
async function* sendRequest(a: Sent, state: CallState): AsyncGenerator<string, void, void> {
  const ac = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, a.timeoutMs);
  };
  const onOuterAbort = () => ac.abort();
  if (a.signal?.aborted) ac.abort();
  else a.signal?.addEventListener("abort", onOuterAbort, { once: true });
  const aborted = new Promise<never>((_, reject) => {
    const f = () => reject(new AbortMarker());
    if (ac.signal.aborted) f();
    else ac.signal.addEventListener("abort", f, { once: true });
  });
  aborted.catch(() => {});

  const strip = new ThinkStripper();
  let upstream: AsyncIterator<StreamChunk> | undefined;
  const take = (u: CompletionResult["usage"]) => {
    if (u) {
      state.tokensIn = numberOrNull(u.prompt_tokens) ?? state.tokensIn;
      state.tokensOut = numberOrNull(u.completion_tokens) ?? state.tokensOut;
    }
  };
  arm();
  try {
    const res = await Promise.race([a.client.chat.completions.create(a.body, { signal: ac.signal }), aborted]);
    if (!a.stream) {
      const r = res as CompletionResult;
      take(r.usage);
      const content = r.choices?.[0]?.message?.content;
      const out = strip.push(typeof content === "string" ? content : "") + strip.flush();
      if (out) {
        clearTimeout(timer);
        yield out;
      }
      return;
    }
    upstream = (res as AsyncIterable<StreamChunk>)[Symbol.asyncIterator]();
    for (;;) {
      const r = await Promise.race([upstream.next(), aborted]);
      if (r.done) break;
      arm();
      take(r.value.usage);
      const piece = r.value.choices?.[0]?.delta?.content;
      const text = typeof piece === "string" ? strip.push(piece) : "";
      if (text) {
        clearTimeout(timer);
        yield text;
        arm();
      }
    }
    const tail = strip.flush();
    if (tail) yield tail;
  } catch (e) {
    if (timedOut && !a.signal?.aborted) throw new TimeoutMarker();
    throw e;
  } finally {
    clearTimeout(timer);
    a.signal?.removeEventListener("abort", onOuterAbort);
    ac.abort();
    const it = upstream;
    if (it?.return) Promise.resolve(it.return()).catch(() => {});
  }
}

function responseFormat(schema: z.ZodType): Record<string, unknown> | null {
  const mode = getJsonMode();
  if (mode === "none") return null;
  if (mode === "json_schema") {
    try {
      return { type: "json_schema", json_schema: { name: "response", schema: z.toJSONSchema(schema) } };
    } catch {
      return { type: "json_object" };
    }
  }
  return { type: "json_object" };
}

/**
 * The real network path: ordered providers, retries, fallthrough. Yields text deltas and sets
 * `state.meta` at the end. Throws `LlmError` when everything failed. After the first yielded
 * text it never switches provider.
 */
export async function* runReal(opts: LlmOptions, internal: Internal, state: CallState): AsyncGenerator<string, void, void> {
  const entries = getRoleEntries(opts.role);
  const fail = (message: string): LlmError => {
    state.meta = buildMeta(state, false, message);
    return new LlmError(message, state.meta);
  };
  const stop = () => {
    state.meta = buildMeta(state, false, "aborted");
  };
  if (entries.length === 0) {
    throw fail(`No LLM provider is configured for role "${opts.role}".`);
  }
  const timeoutMs = opts.timeoutMs ?? defaultTimeoutMs(opts.role);
  let lastError = "no provider answered";

  for (const entry of entries) {
    const provider = getProvider(entry.provider);
    if (!provider) continue;
    state.provider = entry.provider;
    state.model = entry.model;
    const client = getClient(provider);
    const rejectKey = `${entry.provider}:${entry.model}`;
    let retry = 0;

    for (;;) {
      if (opts.signal?.aborted) return stop();
      const format = internal.json && !jsonRejected.has(rejectKey) ? responseFormat(internal.json.schema) : null;
      const body: Record<string, unknown> = {
        model: entry.model,
        messages: opts.messages,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
        stream: internal.stream,
        ...(internal.stream ? { stream_options: { include_usage: true } } : {}),
        ...(format ? { response_format: format } : {}),
        ...(internal.extraBody ?? getExtraBody(opts.role, entry.provider)),
      };

      let release: (() => void) | undefined;
      let yielded = false;
      try {
        release = await semaphoreFor(entry.provider, maxConcurrency()).acquire(opts.signal);
        if (entry.provider === "nvidia") await rpmFor("nvidia", nvidiaMaxRpm()).wait(opts.signal);
        state.attempts++;
        state.firstTokenMs = null;
        for await (const text of sendRequest({ client, body, stream: internal.stream, timeoutMs, signal: opts.signal }, state)) {
          if (!yielded) {
            yielded = true;
            state.firstTokenMs = timing.now() - state.startedAt;
          }
          yield text;
        }
        state.meta = buildMeta(state, true, null);
        return;
      } catch (e) {
        if (opts.signal?.aborted) return stop();
        if (e instanceof LlmError) throw e;
        const c = classify(e, entry);
        if (yielded) throw fail(`${c.message} after output had started`);
        if (format && c.status === 400) {
          jsonRejected.add(rejectKey); // retry this call without response_format, and remember
          continue;
        }
        lastError = c.message;
        if (c.kind === "retry" && retry < MAX_RETRIES) {
          const wait = backoffMs(retry, c);
          retry++;
          try {
            await timing.sleep(wait, opts.signal);
          } catch {
            return stop();
          }
          continue;
        }
        break; // fall through to the next provider:model
      } finally {
        release?.();
      }
    }
  }
  throw fail(`All LLM providers failed for role "${opts.role}". Last error: ${lastError}`);
}
