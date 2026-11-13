import type { z } from "zod";
import type { Db } from "@/db/client";
import type { LlmRole } from "@/contracts/trust";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmMeta = {
  provider: string;
  model: string;
  latencyMs: number;
  firstTokenMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  ok: boolean;
  error: string | null;
  attempts: number;
  /** Total time spent waiting at the rate-limit gate, over all attempts. */
  queuedMs: number;
};

export type LlmOptions = {
  role: LlmRole;
  purpose: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Idle timeout for one attempt: the longest wait for the next piece of the answer. */
  timeoutMs?: number;
  /**
   * Total budget for the call, from the moment it is made: waiting for a rate-limit slot,
   * retries and backoff included. For `chatStream` it ends when the first text arrives; for
   * `chatText` and `chatJson` it covers the whole answer. Defaults: live 6 s, analyst 60 s,
   * bulk 180 s. When it passes the call fails like any other model failure.
   */
  deadlineMs?: number;
  signal?: AbortSignal;
  db?: Db;
  guard?: string | null;
};

/** Why a call failed, for callers that choose a fallback. */
export type LlmFailReason = "rate_limited" | "deadline" | "timeout" | "provider_error" | "not_configured";

/** Thrown by `chatText` and `chatStream` when every provider failed. The message is safe to log. */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly meta: LlmMeta,
    readonly reason: LlmFailReason = "provider_error",
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/** What the core needs beyond the public options. */
export type Internal = {
  stream: boolean;
  /** Absolute time (timing.now) at which the call's total budget ends; set by the caller of runReal. */
  deadlineAt?: number;
  /** JSON mode request for this call (chatJson only). */
  json?: { schema: z.ZodType };
  /** Replaces the configured extra body (probe). */
  extraBody?: Record<string, unknown>;
};

/** Mutable progress of one call, so a stream wrapper can build `meta` at any moment. */
export type CallState = {
  startedAt: number;
  provider: string;
  model: string;
  attempts: number;
  queuedMs: number;
  firstTokenMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  meta?: LlmMeta;
  reason?: LlmFailReason;
};
