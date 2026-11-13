// Client-safe: no server-side imports.
import { InterviewEvent } from "@/contracts/events";

function parseFrame(frame: string): InterviewEvent | null {
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    if (field !== "data") continue;
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    data.push(value);
  }
  if (data.length === 0) return null;
  let json: unknown;
  try {
    json = JSON.parse(data.join("\n"));
  } catch {
    return null;
  }
  const parsed = InterviewEvent.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** Read a server-sent event response, calling `onEvent` for each valid `InterviewEvent`. */
export async function readSse(
  response: Response,
  onEvent: (event: InterviewEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!response.ok) throw new Error(`Event stream request failed with status ${response.status}`);
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const onAbort = () => void reader.cancel().catch(() => {});
  if (signal?.aborted) {
    onAbort();
    return;
  }
  signal?.addEventListener("abort", onAbort, { once: true });
  let buffer = "";
  const flush = (final: boolean) => {
    buffer = buffer.replace(/\r\n?/g, "\n");
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const event = parseFrame(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 2);
      if (event) onEvent(event);
    }
    if (final && buffer.trim()) {
      const event = parseFrame(buffer);
      buffer = "";
      if (event) onEvent(event);
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      // A trailing lone "\r" may be half of a "\r\n" split across chunks; keep it for the next round.
      buffer += decoder.decode(value, { stream: true });
      const keep = buffer.endsWith("\r") ? "\r" : "";
      if (keep) buffer = buffer.slice(0, -1);
      flush(false);
      buffer += keep;
    }
    buffer += decoder.decode();
    flush(true);
  } catch (err) {
    if (!signal?.aborted) throw err;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}
