import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeSseEvent, type InterviewEvent } from "@/contracts";
import { sseResponse } from "./sse";
import { readSse } from "./sse-client";

afterEach(() => vi.useRealTimers());

const enc = new TextEncoder();
function chunked(chunks: Uint8Array[]): Response {
  let i = 0;
  return new Response(
    new ReadableStream({
      pull(c) {
        if (i < chunks.length) c.enqueue(chunks[i++]);
        else c.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
async function collect(res: Response): Promise<InterviewEvent[]> {
  const out: InterviewEvent[] = [];
  await readSse(res, (e) => out.push(e));
  return out;
}

const delta = (text: string): InterviewEvent => ({ type: "turn.delta", text });

describe("sseResponse and readSse", () => {
  it("round-trips events with the right headers", async () => {
    const res = sseResponse(async (send) => {
      send(delta("Hello"));
      send({ type: "turn.done", turnIndex: 1, text: "Hello there", kind: "probe" as never, closing: false });
      send({ type: "card.ready", talentId: "tal_1" });
    });
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
    const events = await collect(res);
    expect(events.map((e) => e.type)).toEqual(["turn.delta", "turn.done", "card.ready"]);
    expect(events[0]).toEqual(delta("Hello"));
    expect(events.at(-1)).toEqual({ type: "card.ready", talentId: "tal_1" });
  });

  it("sends an error event when run throws, then closes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const events = await collect(
      sseResponse(async (send) => {
        send(delta("a"));
        throw new Error("secret");
      }),
    );
    expect(events).toEqual([delta("a"), { type: "error", message: "Something went wrong", retryable: true }]);
  });

  it("aborts the signal when the client cancels, and stops the heartbeat", async () => {
    let signal!: AbortSignal;
    let release!: () => void;
    const res = sseResponse(
      (send, s) =>
        new Promise<void>((resolve) => {
          signal = s;
          release = resolve;
          send(delta("x"));
        }),
    );
    const reader = res.body!.getReader();
    await reader.read();
    expect(signal.aborted).toBe(false);
    await reader.cancel();
    expect(signal.aborted).toBe(true);
    release();
  });

  it("sends a comment heartbeat every 15 seconds", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const res = sseResponse(() => new Promise<void>((r) => (release = r)));
    const reader = res.body!.getReader();
    await vi.advanceTimersByTimeAsync(15_000);
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toMatch(/^:/);
    release();
    expect((await reader.read()).done).toBe(true);
  });

  it("reassembles a frame split across chunks, including inside the field name", async () => {
    const bytes = enc.encode(encodeSseEvent(delta("split me")) + encodeSseEvent({ type: "card.ready", talentId: "t" }));
    for (const cut of [1, 5, 12, 30]) {
      const events = await collect(chunked([bytes.slice(0, cut), bytes.slice(cut)]));
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual(delta("split me"));
    }
    // one byte at a time
    const single = await collect(chunked(Array.from(bytes, (b) => Uint8Array.of(b))));
    expect(single).toHaveLength(2);
  });

  it("handles a multi-byte character split across chunks", async () => {
    const text = "Hei äiti €5 \u{1F600} 你好";
    const bytes = enc.encode(encodeSseEvent(delta(text)));
    const emoji = bytes.indexOf(0xf0); // first byte of the 4-byte emoji
    for (const cut of [emoji + 1, emoji + 2, emoji + 3, bytes.indexOf(0xc3) + 1]) {
      const events = await collect(chunked([bytes.slice(0, cut), bytes.slice(cut)]));
      expect(events).toEqual([delta(text)]);
    }
  });

  it("round-trips multi-byte text through sseResponse with tiny reads", async () => {
    const text = "ääkköset \u{1F600}";
    const res = sseResponse(async (send) => send(delta(text)));
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(await collect(chunked(Array.from(bytes, (b) => Uint8Array.of(b))))).toEqual([delta(text)]);
  });

  it("ignores comments, unknown events, invalid data and handles CRLF", async () => {
    const good = JSON.stringify(delta("ok"));
    const raw =
      `: hello\r\n\r\n` +
      `event: mystery\r\ndata: {"type":"mystery"}\r\n\r\n` +
      `event: turn.delta\ndata: {not json}\n\n` +
      `event: turn.delta\ndata: {"type":"turn.delta","text":5}\n\n` +
      `retry: 1000\n\n` +
      `event: turn.delta\r\ndata: ${good}\r\n\r\n` +
      `data:${JSON.stringify(delta("no space"))}\n\n`;
    expect(await collect(chunked([enc.encode(raw)]))).toEqual([delta("ok"), delta("no space")]);
  });

  it("delivers a final frame without a trailing blank line, and throws on HTTP errors", async () => {
    const tail = `event: turn.delta\ndata: ${JSON.stringify(delta("end"))}\n`;
    expect(await collect(chunked([enc.encode(tail)]))).toEqual([delta("end")]);
    await expect(readSse(new Response("no", { status: 500 }), () => {})).rejects.toThrow(/500/);
  });

  it("stops reading when the signal aborts", async () => {
    const ac = new AbortController();
    const seen: InterviewEvent[] = [];
    const res = sseResponse(async (send, signal) => {
      send(delta("one"));
      await new Promise<void>((r) => signal.addEventListener("abort", () => r()));
    });
    const p = readSse(res, (e) => seen.push(e), ac.signal);
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    ac.abort();
    await p;
  });
});
