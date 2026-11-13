import { describe, expect, it, vi } from "vitest";
import { PlaybackQueue, type AudioLike } from "./playback";

class FakeAudio implements AudioLike {
  src = "";
  onended: (() => void) | null = null;
  onerror: ((e?: unknown) => void) | null = null;
  played: string[] = [];
  paused = 0;
  play = vi.fn(async () => {
    this.played.push(this.src);
  });
  pause = vi.fn(() => {
    this.paused += 1;
  });
  end() {
    this.onended?.();
  }
}

function setup(fetchImpl?: typeof fetch) {
  const audio = new FakeAudio();
  const requests: { text: string; signal: AbortSignal }[] = [];
  const defaultFetch = (async (_url: string, init: RequestInit) => {
    const { text } = JSON.parse(init.body as string) as { text: string };
    requests.push({ text, signal: init.signal as AbortSignal });
    return new Response(new Blob([text]), { status: 200 });
  }) as unknown as typeof fetch;
  const first = vi.fn();
  const q = new PlaybackQueue({
    fetch: fetchImpl ?? defaultFetch,
    createAudio: () => audio,
    createObjectURL: (b) => `blob:${b.size}`,
    revokeObjectURL: () => {},
    createMeter: () => null,
    onFirstAudio: first,
    now: () => 0,
  });
  return { q, audio, requests, first };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("PlaybackQueue", () => {
  it("fetches every sentence at once but plays them in order", async () => {
    const { q, audio, requests } = setup();
    const done = [q.enqueue("one", "en"), q.enqueue("three", "en"), q.enqueue("two2", "en")];
    await tick();
    expect(requests.map((r) => r.text)).toEqual(["one", "three", "two2"]);
    expect(audio.played).toEqual(["blob:3"]); // only the first is playing
    audio.end();
    await tick();
    expect(audio.played).toEqual(["blob:3", "blob:5"]);
    audio.end();
    await tick();
    audio.end();
    await Promise.all(done);
    expect(audio.played).toEqual(["blob:3", "blob:5", "blob:4"]);
  });

  it("reports the first audio once per burst", async () => {
    const { q, audio, first } = setup();
    const a = q.enqueue("a", "en");
    const b = q.enqueue("b", "en");
    await tick();
    audio.end();
    await tick();
    audio.end();
    await Promise.all([a, b]);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("cancel stops audio, drops the queue, aborts fetches and resolves waiters", async () => {
    const { q, audio, requests } = setup();
    const a = q.enqueue("a", "en");
    const b = q.enqueue("b", "en");
    const c = q.enqueue("c", "en");
    await tick();
    expect(audio.played).toHaveLength(1);
    q.cancel();
    expect(audio.pause).toHaveBeenCalled();
    expect(requests.every((r) => r.signal.aborted)).toBe(true);
    await expect(Promise.all([a, b, c])).resolves.toBeDefined();
    await tick();
    expect(audio.played).toHaveLength(1); // b and c never played
  });

  it("works again after a cancel", async () => {
    const { q, audio } = setup();
    void q.enqueue("old", "en");
    await tick();
    q.cancel();
    const next = q.enqueue("new", "en");
    await tick();
    expect(audio.played.at(-1)).toBe("blob:3");
    audio.end();
    await next;
  });

  it("cancel during an in-flight fetch never plays the late clip", async () => {
    let release!: (r: Response) => void;
    const slow = (() => new Promise<Response>((r) => (release = r))) as unknown as typeof fetch;
    const { q, audio } = setup(slow);
    const p = q.enqueue("late", "en");
    q.cancel();
    release(new Response(new Blob(["x"])));
    await p;
    expect(audio.played).toHaveLength(0);
  });

  it("rejects the failed sentence but still plays the next one", async () => {
    let n = 0;
    const flaky = (async () => {
      n += 1;
      return n === 1 ? new Response("no", { status: 502 }) : new Response(new Blob(["ok"]));
    }) as unknown as typeof fetch;
    const { q, audio } = setup(flaky);
    const bad = q.enqueue("bad", "en");
    const good = q.enqueue("good", "en");
    await expect(bad).rejects.toMatchObject({ code: "unavailable" });
    await tick();
    expect(audio.played).toHaveLength(1);
    audio.end();
    await good;
  });

  it("unlock plays a silent clip on the shared element", async () => {
    const { q, audio } = setup();
    await q.unlock();
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.src.startsWith("data:audio/wav")).toBe(true);
  });

  it("with a fetch limit, holds later sentences back and drops them on cancel", async () => {
    const texts: string[] = [];
    const gates: ((r: Response) => void)[] = [];
    const held = ((_u: string, init: RequestInit) => {
      texts.push((JSON.parse(init.body as string) as { text: string }).text);
      return new Promise<Response>((resolve, reject) => {
        gates.push(resolve);
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    }) as unknown as typeof fetch;
    const audio = new FakeAudio();
    const q = new PlaybackQueue({
      fetch: held,
      createAudio: () => audio,
      createObjectURL: (b) => `blob:${b.size}`,
      revokeObjectURL: () => {},
      createMeter: () => null,
      now: () => 0,
      maxConcurrentFetches: 1,
    });
    const a = q.enqueue("a", "en");
    const b = q.enqueue("b", "en");
    await tick();
    expect(texts).toEqual(["a"]);
    gates[0](new Response(new Blob(["a"])));
    await tick();
    await tick();
    expect(texts).toEqual(["a", "b"]);
    const c = q.enqueue("c", "en");
    q.cancel();
    gates[1](new Response(new Blob(["b"])));
    await Promise.all([a, b, c]);
    await tick();
    expect(texts).toEqual(["a", "b"]); // "c" was never requested

    const d = q.enqueue("d", "en");
    await tick();
    expect(texts).toEqual(["a", "b", "d"]); // the slot freed up again: "d" is requested at once
    q.cancel();
    await d;
  });

  it("keeps the HTTP status on a failed request", async () => {
    const { q } = setup(
      (async () => new Response("no", { status: 503 })) as unknown as typeof fetch,
    );
    await expect(q.enqueue("x", "en")).rejects.toMatchObject({ code: "unavailable", status: 503 });
  });
});
