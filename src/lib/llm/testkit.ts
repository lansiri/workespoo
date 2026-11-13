import { resetEnvCache } from "@/lib/env";
import type { Provider } from "./config";
import type { ChatClient, ClientFactory, CompletionResult, StreamChunk } from "./client";

const ENV_KEYS = [
  "LLM_MODE", "LLM_LIVE", "LLM_ANALYST", "LLM_BULK",
  "NVIDIA_BASE_URL", "NVIDIA_API_KEY", "VERDA_BASE_URL", "VERDA_API_KEY",
  "CUSTOM_LLM_BASE_URL", "CUSTOM_LLM_API_KEY",
  "LLM_EXTRA_BODY_LIVE", "LLM_EXTRA_BODY_ANALYST", "LLM_EXTRA_BODY_BULK",
  "LLM_JSON_MODE", "NVIDIA_MAX_RPM", "LLM_MAX_CONCURRENCY", "LLM_FIXTURES_DIR",
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
