/**
 * Server-sent events with `id:` lines, so a reconnecting browser can send `Last-Event-ID`.
 * `sseResponse` in `@/lib/sse` cannot carry ids (its `send` takes only the event), so the
 * events route uses this instead. Same headers and 15-second keep-alive.
 */
import { encodeSseEvent, type InterviewEvent } from "@/contracts";

const HEARTBEAT_MS = 15_000;

export function sseResponseWithIds(
  run: (send: (id: number, event: InterviewEvent) => void, signal: AbortSignal) => Promise<void>,
  requestSignal?: AbortSignal,
): Response {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;

  const shutdown = () => {
    closed = true;
    if (timer) clearInterval(timer);
  };
  const push = (chunk: string) => {
    if (closed) return;
    try {
      controllerRef?.enqueue(encoder.encode(chunk));
    } catch {
      shutdown();
    }
  };
  requestSignal?.addEventListener("abort", () => abort.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      timer = setInterval(() => push(": keep-alive\n\n"), HEARTBEAT_MS);
      void run((id, event) => push(`id: ${id}\n${encodeSseEvent(event)}`), abort.signal)
        .catch((err) => {
          console.error("[sse] events run failed:", err instanceof Error ? err.message : String(err));
          push(encodeSseEvent({ type: "error", message: "Something went wrong", retryable: true }));
        })
        .finally(() => {
          if (closed) return;
          shutdown();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
    },
    cancel() {
      shutdown();
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
