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
  defaultDeadlineMs,
  type RoleEntry,
} from "./config";
import { getClient, type ChatClient, type CompletionResult, type StreamChunk } from "./client";
import { GateError, MAX_PAUSE_MS, gateFor, timing } from "./limiter";
import { ThinkStripper } from "./think";
import { LlmError, type CallState, type Internal, type LlmFailReason, type LlmMeta, type LlmOptions } from "./types";

const MAX_RETRIES = 2;

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
    queuedMs: 0,
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
    queuedMs: Math.round(s.queuedMs),
  };
}

class TimeoutMarker extends Error {}
/**
 * The provider answered, and the answer held no text at all. None of this product's prompts
 * has an empty answer as a valid outcome, so it is a provider fault: retried, then the next
 * provider. Seen for real on 14 Nov, when the provider's domain served a parking page with
 * HTTP 200 for 24 minutes and every call "succeeded" with nothing in it.
 */
class EmptyAnswer extends Error {}
class AbortMarker extends Error {}

type Classified = { kind: "retry" | "next"; status?: number; retryAfterMs?: number; message: string; timedOut?: boolean };

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
  return Number.isFinite(ms) && ms > 0 ? ms : undefined; // 0 or past: treat as missing
}

export function redact(text: string): string {
  let out = text;
  for (const k of configuredSecrets()) out = out.split(k).join("[redacted]");
  return out;
}

/** A message that never carries prompt, output or key text. */
function classify(e: unknown, entry: RoleEntry): Classified {
  const who = `${entry.provider}:${entry.model}`;
  if (e instanceof TimeoutMarker) return { kind: "next", message: `${who} timed out`, timedOut: true };
  if (e instanceof EmptyAnswer) return { kind: "retry", message: `${who} returned an empty answer` };
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
  if (c.retryAfterMs !== undefined) return Math.min(c.retryAfterMs, MAX_PAUSE_MS);
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
 * The real network path: ordered providers, the shared gate, retries, fallthrough and the
 * deadline. Yields text deltas and sets `state.meta` at the end. Throws `LlmError` when
 * everything failed. After the first yielded text it never switches provider.
 */
export async function* runReal(opts: LlmOptions, internal: Internal, state: CallState): AsyncGenerator<string, void, void> {
  const entries = getRoleEntries(opts.role);
  const fail = (message: string, reason: LlmFailReason): LlmError => {
    state.meta = buildMeta(state, false, message);
    return new LlmError(message, state.meta, reason);
  };
  const stop = () => {
    state.meta = buildMeta(state, false, "aborted");
  };
  if (entries.length === 0) {
    throw fail(`No LLM provider is configured for role "${opts.role}".`, "not_configured");
  }
  const timeoutMs = opts.timeoutMs ?? defaultTimeoutMs(opts.role);
  const budgetMs = opts.deadlineMs ?? defaultDeadlineMs(opts.role);
  const deadlineAt = internal.deadlineAt ?? state.startedAt + budgetMs;
  let lastError = "no provider answered";
  let lastReason: LlmFailReason = "provider_error";

  // One signal for everything this call waits on: the caller's abort and the deadline.
  const callAc = new AbortController();
  const deadlineAc = new AbortController();
  let deadlineHit = false;
  const onOuterAbort = () => callAc.abort();
  if (opts.signal?.aborted) callAc.abort();
  else opts.signal?.addEventListener("abort", onOuterAbort, { once: true });
  timing.timer(Math.max(0, deadlineAt - timing.now()), deadlineAc.signal).then(
    () => {
      deadlineHit = true;
      callAc.abort();
    },
    () => {},
  );
  const deadlineError = () =>
    fail(
      `The ${budgetMs} ms deadline for this ${opts.role} call passed` +
        (state.attempts > 0 || state.queuedMs > 0 ? `. Last error: ${lastError}` : "."),
      "deadline",
    );

  try {
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      const provider = getProvider(entry.provider);
      if (!provider) continue;
      state.provider = entry.provider;
      state.model = entry.model;
      const client = getClient(provider);
      const rejectKey = `${entry.provider}:${entry.model}`;
      const otherProvider = entries.slice(index + 1).some((e) => e.provider !== entry.provider);
      let retry = 0;
      let liveRetried = false;

      for (;;) {
        if (opts.signal?.aborted) return stop();
        if (deadlineHit || timing.now() >= deadlineAt) throw deadlineError();
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
        const askedAt = timing.now();
        let admitted = false;
        try {
          const admission = await gateFor(entry.provider).acquire({
            role: opts.role,
            signal: callAc.signal,
            deadlineAt,
          });
          release = admission.release;
          admitted = true;
          state.queuedMs += admission.waitedMs;
          state.attempts++;
          state.firstTokenMs = null;
          for await (const text of sendRequest(
            { client, body, stream: internal.stream, timeoutMs, signal: callAc.signal },
            state,
          )) {
            if (!yielded) {
              yielded = true;
              state.firstTokenMs = timing.now() - state.startedAt;
              // a stream's deadline ends at the first text; after that only the idle timeout applies
              if (internal.stream) deadlineAc.abort();
            }
            yield text;
          }
          if (!yielded) throw new EmptyAnswer();
          state.meta = buildMeta(state, true, null);
          return;
        } catch (e) {
          if (!admitted) state.queuedMs += Math.max(0, timing.now() - askedAt); // gave up while queued
          if (opts.signal?.aborted) return stop();
          if (e instanceof LlmError) throw e;
          if (deadlineHit || (e instanceof GateError && e.kind === "deadline")) throw deadlineError();
          if (e instanceof GateError) return stop();
          const c = classify(e, entry);
          if (yielded) throw fail(`${c.message} after output had started`, lastReasonOf(c));
          if (format && c.status === 400) {
            jsonRejected.add(rejectKey); // retry this call without response_format, and remember
            continue;
          }
          lastError = c.message;
          lastReason = lastReasonOf(c);
          if (c.status === 429) {
            gateFor(entry.provider).pause(c.retryAfterMs);
            if (otherProvider) break; // another provider is listed: move on at once
            if (opts.role === "live") {
              if (liveRetried) throw fail(`All LLM providers failed for role "live". Last error: ${lastError}`, "rate_limited"); // one retry after the short pause, then the caller's fallback
              liveRetried = true;
            }
            continue; // analyst and bulk wait out the pause at the gate; not counted in MAX_RETRIES
          }
          if (c.kind === "retry" && retry < MAX_RETRIES) {
            const wait = backoffMs(retry, c);
            if (otherProvider && timing.now() + wait >= deadlineAt) break; // would sleep out the budget: try the next provider
            retry++;
            try {
              await timing.sleep(wait, callAc.signal);
            } catch {
              if (opts.signal?.aborted) return stop();
              throw deadlineError();
            }
            continue;
          }
          break; // fall through to the next provider:model
        } finally {
          release?.();
        }
      }
    }
    throw fail(`All LLM providers failed for role "${opts.role}". Last error: ${lastError}`, lastReason);
  } finally {
    deadlineAc.abort();
    callAc.abort();
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }
}

function lastReasonOf(c: Classified): LlmFailReason {
  if (c.status === 429) return "rate_limited";
  return c.timedOut ? "timeout" : "provider_error";
}
