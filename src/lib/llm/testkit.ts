import { resetEnvCache } from "@/lib/env";
import type { Provider } from "./config";
import { timing } from "./limiter";
import type { ChatClient, ClientFactory, CompletionResult, StreamChunk } from "./client";

const ENV_KEYS = [
  "LLM_MODE", "LLM_LIVE", "LLM_ANALYST", "LLM_BULK",
  "NVIDIA_BASE_URL", "NVIDIA_API_KEY", "VERDA_BASE_URL", "VERDA_API_KEY",
  "CUSTOM_LLM_BASE_URL", "CUSTOM_LLM_API_KEY",
  "LLM_EXTRA_BODY_LIVE", "LLM_EXTRA_BODY_ANALYST", "LLM_EXTRA_BODY_BULK",
  "LLM_JSON_MODE", "NVIDIA_MAX_RPM", "VERDA_MAX_RPM", "CUSTOM_LLM_MAX_RPM", "LLM_MAX_CONCURRENCY", "LLM_FIXTURES_DIR",
  "LLM_LIVE_RESERVE_SLOTS", "LLM_LIVE_RESERVE_RPM", "LLM_RPM_SHARE",
];

/** Reset all gateway env vars, apply `vars`, and drop the env cache. */
export function setEnv(vars: Record<string, string> = {}): void {
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.LLM_MODE = "live";
  Object.assign(process.env, vars);
  resetEnvCache();
}

export type Step = {
  /** HTTP-like failure raised before any output. */
  error?: { status?: number; headers?: Record<string, string> };
  text?: string;
  /** Stream pieces; defaults to `[text]`. */
  pieces?: string[];
  reasoning?: string[];
  /** Raise this error after the pieces were delivered (mid-stream failure). */
  errorAfter?: { status?: number };
  /** Answer only after this many (virtual) milliseconds; the abort signal cuts it short. */
  delayMs?: number;
  /** Never answer: wait for the abort signal, then fail (a request that hangs before any output). */
  stall?: boolean;
  /** After the pieces, wait for the abort signal instead of finishing. */
  hang?: boolean;
  usage?: { prompt_tokens: number; completion_tokens: number };
};

export type Call = { provider: string; body: Record<string, unknown> };

export type Fake = {
  factory: ClientFactory;
  calls: Call[];
  created: string[];
  closed: number;
};

function httpError(e: { status?: number; headers?: Record<string, string> }): Error {
  const err = new Error(`fake http ${e.status ?? "network"} SECRET-PROMPT-TEXT`) as Error & { status?: number; headers?: unknown };
  if (e.status !== undefined) err.status = e.status;
  if (e.headers) err.headers = new Headers(e.headers);
  return err;
}

/** A scripted OpenAI-compatible client per provider. Steps are consumed in call order. */
export function fakeProviders(script: Record<string, Step[]>): Fake {
  const fake: Fake = { calls: [], created: [], closed: 0, factory: () => { throw new Error("unset"); } };
  const queues = new Map(Object.entries(script).map(([k, v]) => [k, [...v]]));
  fake.factory = (p: Provider): ChatClient => {
    fake.created.push(p.name);
    return {
      chat: {
        completions: {
          async create(body, options) {
            fake.calls.push({ provider: p.name, body });
            const step = queues.get(p.name)?.shift() ?? { error: { status: 500 } };
            if (step.stall) {
              await new Promise<void>((resolve) => {
                if (options?.signal?.aborted) resolve();
                options?.signal?.addEventListener("abort", () => resolve(), { once: true });
              });
              throw new Error("aborted upstream");
            }
            if (step.delayMs) await timing.timer(step.delayMs, options?.signal);
            if (step.error) throw httpError(step.error);
            const pieces = step.pieces ?? [step.text ?? ""];
            if (!body.stream) {
              return {
                choices: [{ message: { content: pieces.join(""), reasoning_content: "SECRET-REASONING" } }],
                usage: step.usage ?? { prompt_tokens: 5, completion_tokens: 7 },
              } satisfies CompletionResult;
            }
            async function* gen(): AsyncGenerator<StreamChunk> {
              try {
                for (const r of step.reasoning ?? []) yield { choices: [{ delta: { reasoning_content: r } }] };
                for (const piece of pieces) yield { choices: [{ delta: { content: piece } }] };
                if (step.errorAfter) throw httpError(step.errorAfter);
                if (step.hang) {
                  await new Promise<void>((resolve) => {
                    if (options?.signal?.aborted) resolve();
                    options?.signal?.addEventListener("abort", () => resolve(), { once: true });
                  });
                  throw new Error("aborted upstream");
                }
                yield { choices: [], usage: step.usage ?? { prompt_tokens: 5, completion_tokens: 7 } };
              } finally {
                fake.closed++;
              }
            }
            return gen();
          },
        },
      },
    };
  };
  return fake;
}

export type VirtualClock = {
  /** Current virtual time in ms. */
  now: () => number;
  /** Every backoff `sleep` requested, in ms. */
  sleeps: number[];
  /** Move time forward by `ms`, firing the timers that fall due, in time order. */
  advance: (ms: number) => Promise<void>;
  /** Let time run, timer by timer, until `p` settles. Rejections are passed through. */
  settle: <T>(p: Promise<T>) => Promise<T>;
  /** Let pending microtasks and I/O callbacks run without moving time. */
  flush: () => Promise<void>;
};

const idle = () => new Promise<void>((r) => setImmediate(r));

/**
 * Replace the gateway clock with a manual one: time moves only through `advance` and `settle`,
 * so a test never waits and sees time pass deterministically. `resetLlmState()` restores the
 * real clock.
 */
export function installVirtualClock(start = 1_000_000): VirtualClock {
  let now = start;
  const timers: Array<{ at: number; seq: number; fire: () => void }> = [];
  let seq = 0;
  const sleeps: number[] = [];

  const timer = (ms: number, signal?: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error("aborted"));
      const entry = {
        at: now + Math.max(0, ms),
        seq: seq++,
        fire: () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        },
      };
      const onAbort = () => {
        const i = timers.indexOf(entry);
        if (i >= 0) timers.splice(i, 1);
        reject(new Error("aborted"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      timers.push(entry);
    });

  const nextTimer = () => {
    timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
    return timers[0];
  };
  const flush = async () => {
    for (let i = 0; i < 4; i++) await idle();
  };

  timing.now = () => now;
  timing.timer = timer;
  timing.sleep = (ms, signal) => {
    sleeps.push(ms);
    return timer(ms, signal);
  };
  return {
    now: () => now,
    sleeps,
    flush,
    advance: async (ms) => {
      const target = now + ms;
      for (;;) {
        await flush();
        const next = nextTimer();
        if (!next || next.at > target) break;
        timers.shift();
        now = Math.max(now, next.at);
        next.fire();
      }
      now = Math.max(now, target);
      await flush();
    },
    settle: async (p) => {
      let done = false;
      const tracked = p.finally(() => {
        done = true;
      });
      tracked.catch(() => {});
      for (let guard = 0; guard < 10_000; guard++) {
        await flush();
        if (done) return tracked;
        const next = nextTimer();
        if (!next) throw new Error("settle: the call is waiting on something that is not a timer");
        timers.shift();
        now = Math.max(now, next.at);
        next.fire();
      }
      throw new Error("settle: too many timers");
    },
  };
}
