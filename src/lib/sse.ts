import { encodeSseEvent, type InterviewEvent } from "@/contracts";

const HEARTBEAT_MS = 15_000;

/**
 * Stream server-sent events. The stream closes when `run` resolves or the client
 * disconnects (`signal` aborts). A comment line is sent every 15 seconds to keep proxies open.
 */
export function sseResponse(
  run: (send: (event: InterviewEvent) => void, signal: AbortSignal) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;

  const push = (chunk: string) => {
    if (closed) return;
    try {
      controllerRef?.enqueue(encoder.encode(chunk));
    } catch {
      shutdown();
    }
  };
  function shutdown() {
    closed = true;
    if (timer) clearInterval(timer);
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      timer = setInterval(() => push(": keep-alive\n\n"), HEARTBEAT_MS);
      const send = (event: InterviewEvent) => push(encodeSseEvent(event));
      void run(send, abort.signal)
        .catch((err) => {
          console.error("[sse] run failed:", err instanceof Error ? err.message : String(err));
          send({ type: "error", message: "Something went wrong", retryable: true });
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
