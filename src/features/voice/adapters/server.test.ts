import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ListenHandlers } from "@/contracts/voice";
import type { MicCapture, MicCaptureHandlers } from "../capture";
import { VoiceError } from "../errors";
import { PlaybackQueue, type AudioLike } from "../playback";
import { createServerAdapter } from "./server";

// A stand-in for the real audio arithmetic: no resampling (the test feeds 16 kHz), a segmenter that
// cuts every 16 000 samples, and the real 16-bit packing rule in miniature.
vi.mock("../pcm", () => ({
  createResampler: () => ({ push: (c: Float32Array) => c, flush: () => new Float32Array(0) }),
  createSegmenter: () => {
    let held: number[] = [];
    return {
      push(samples: Float32Array) {
        held.push(...samples);
        const out: Float32Array[] = [];
        while (held.length >= 16000) out.push(Float32Array.from(held.splice(0, 16000)));
        return out;
      },
      flush() {
        const rest = Float32Array.from(held);
        held = [];
        return rest;
      },
    };
  },
  toPcm16: (s: Float32Array) => Int16Array.from(s, (v) => Math.round(v * 1000)),
  levelOf: (s: Float32Array) => (s.length ? Math.abs(s[0]) : 0),
}));

const second = (value: number, seconds = 1) => new Float32Array(Math.round(16000 * seconds)).fill(value);

interface Call {
  body: number[];
  signal: AbortSignal;
  type: string | null;
}

function reply(status: number, body: unknown = { text: "" }, headers: Record<string, string> = {}) {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status, headers }));
}

function setup(
  options: {
    answers?: (call: Call, n: number) => Promise<Response>;
    captureFails?: unknown;
    supported?: boolean;
  } = {},
) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe("/api/voice/stt");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    const call: Call = {
      body: Array.from(init.body as Int16Array),
      signal: init.signal as AbortSignal,
      type: headers["Content-Type"] ?? null,
    };
    calls.push(call);
    return (options.answers ?? (() => reply(200, { text: `t${calls.length}` })()))(call, calls.length);
  }) as unknown as typeof fetch;

  let capHandlers!: MicCaptureHandlers;
  const stopCapture = vi.fn(async () => {});
  const startCapture = vi.fn(async (h: MicCaptureHandlers): Promise<MicCapture> => {
    if (options.captureFails) throw options.captureFails;
    capHandlers = h;
    return { stop: stopCapture };
  });
  const order: string[] = [];
  const unlockCapture = vi.fn(() => order.push("unlockCapture"));
  const adapter = createServerAdapter({
    fetch: fetchImpl,
    startCapture,
    unlockCapture,
    captureSupported: () => options.supported ?? true,
    releaseTailMs: 200,
  });
  const partials: string[] = [];
  const errors: Error[] = [];
  const levels: number[] = [];
  const handlers: ListenHandlers = {
    onPartial: (t) => partials.push(t),
    onError: (e) => errors.push(e),
    onLevel: (l) => levels.push(l),
  };
  return {
    adapter,
    calls,
    fetchImpl,
    startCapture,
    stopCapture,
    unlockCapture,
    order,
    partials,
    errors,
    levels,
    handlers,
    chunk: (s: Float32Array, rate = 16000) => capHandlers.onChunk(s, rate),
    capError: (e: Error) => capHandlers.onError(e),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("server adapter listening", () => {
  it("is the server adapter and takes partials", () => {
    const { adapter } = setup();
    expect(adapter.id).toBe("server");
    expect(adapter.supportsPartials).toBe(true);
  });

  it("sends finished segments in order as PCM bytes, and partials grow in that order", async () => {
    const t = setup();
    await t.adapter.startListening(t.handlers);
    t.chunk(second(0.001));
    t.chunk(second(0.002));
    await vi.advanceTimersByTimeAsync(0);
    expect(t.levels).toEqual([Math.fround(0.001), Math.fround(0.002)]);
    expect(t.calls).toHaveLength(2);
    expect(t.calls[0].type).toBe("application/octet-stream");
    expect(t.calls[0].body).toHaveLength(16000);
    expect(t.calls[0].body[0]).toBe(1);
    expect(t.calls[1].body[0]).toBe(2);
    expect(t.partials).toEqual(["t1", "t1 t2"]);
  });

  it("sends one request at a time", async () => {
    let release!: () => void;
    const t = setup({
      answers: (_c, n) =>
        n === 1
          ? new Promise((r) => {
              release = () => r(new Response(JSON.stringify({ text: "one" })));
            })
          : Promise.resolve(new Response(JSON.stringify({ text: "two" }))),
    });
    await t.adapter.startListening(t.handlers);
    t.chunk(second(0.1));
    t.chunk(second(0.2));
    await vi.advanceTimersByTimeAsync(0);
    expect(t.calls).toHaveLength(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.calls).toHaveLength(2);
    expect(t.partials).toEqual(["one", "one two"]);
  });

  it("keeps capturing for the release tail, then sends the rest and resolves with the whole text", async () => {
    const t = setup();
    await t.adapter.startListening(t.handlers);
    t.chunk(second(0.1, 1.5));
    const stopped = t.adapter.stopListening();
    await vi.advanceTimersByTimeAsync(100);
    t.chunk(second(0.3, 0.5)); // still inside the tail
    expect(t.stopCapture).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(t.stopCapture).toHaveBeenCalledTimes(1);
    await expect(stopped).resolves.toBe("t1 t2");
    expect(t.calls).toHaveLength(2);
    expect(t.calls[1].body).toHaveLength(16000);
    expect(t.calls[1].body[0]).toBe(100);
    expect(t.calls[1].body.at(-1)).toBe(300);
  });

  it("does not send a last piece shorter than the minimum", async () => {
    const t = setup();
    await t.adapter.startListening(t.handlers);
    t.chunk(second(0.1, 0.2));
    const stopped = t.adapter.stopListening();
    await vi.advanceTimersByTimeAsync(200);
    await expect(stopped).resolves.toBe("");
    expect(t.calls).toHaveLength(0);
  });

  it("resolves with an empty string when there is no press, or release came before capture started", async () => {
    const t = setup();
    await expect(t.adapter.stopListening()).resolves.toBe("");
    let open!: () => void;
    const slow = setup();
    slow.startCapture.mockImplementationOnce(
      () =>
        new Promise<MicCapture>((r) => {
          open = () => r({ stop: slow.stopCapture });
        }),
    );
    const start = slow.adapter.startListening(slow.handlers);
    await expect(slow.adapter.stopListening()).resolves.toBe("");
    open();
    await start;
    expect(slow.stopCapture).toHaveBeenCalledTimes(1);
  });

  it("passes capture failures on startup as voice errors", async () => {
    const t = setup({ captureFails: new VoiceError("mic-denied") });
    await expect(t.adapter.startListening(t.handlers)).rejects.toMatchObject({ code: "mic-denied" });
    await expect(t.adapter.stopListening()).resolves.toBe("");
  });

  it("sends a capture error after the start to onError", async () => {
    const t = setup();
    await t.adapter.startListening(t.handlers);
    t.capError(new Error("track ended"));
    expect(t.errors).toHaveLength(1);
    const stopped = t.adapter.stopListening();
    await vi.advanceTimersByTimeAsync(200);
    await expect(stopped).resolves.toBe("");
  });

  it("a capture that fails mid-press ends the press: microphone released, sending stopped, nothing kept", async () => {
    let answer!: (r: Response) => void;
    const t = setup({ answers: () => new Promise<Response>((resolve) => (answer = resolve)) });
    await t.adapter.startListening(t.handlers);
    t.chunk(second(0.1)); // one segment on its way
    await vi.advanceTimersByTimeAsync(0);
    expect(t.calls).toHaveLength(1);

    t.capError(new VoiceError("mic-denied"));
    // Reported once, with its own code, so the room can switch to typing for good.
    expect(t.errors).toHaveLength(1);
    expect(t.errors[0]).toMatchObject({ code: "mic-denied" });
    // The controller is now in its error state and will not call stopListening: the adapter
    // has already let the microphone go and stopped the request in flight.
    expect(t.stopCapture).toHaveBeenCalledTimes(1);
    expect(t.calls[0].signal.aborted).toBe(true);

    // Whatever still arrives is ignored: no further request, no partial text.
    t.chunk(second(0.2));
    answer(new Response(JSON.stringify({ text: "late" }), { status: 200 }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.calls).toHaveLength(1);
    expect(t.partials).toEqual([]);
    await expect(t.adapter.stopListening()).resolves.toBe("");
  });

  it("unlocks the capture context again at every press, still inside the gesture", async () => {
    const t = setup();
    const started = t.adapter.startListening(t.handlers);
    // Before the first await of startListening: the microphone has not been asked for yet.
    expect(t.unlockCapture).toHaveBeenCalledTimes(1);
    await started;
    const stopped = t.adapter.stopListening();
    await vi.advanceTimersByTimeAsync(200);
    await stopped;
    void t.adapter.startListening(t.handlers);
    expect(t.unlockCapture).toHaveBeenCalledTimes(2);
  });

  it("a tap sends nothing; the shortest real answer is sent", async () => {
    // 0.1 s held plus the 0.2 s tail: under 0.4 s in all, so it is a tap.
    const tap = setup();
    await tap.adapter.startListening(tap.handlers);
    tap.chunk(second(0.5, 0.1));
    const tapped = tap.adapter.stopListening();
    tap.chunk(second(0.5, 0.2)); // the tail
    await vi.advanceTimersByTimeAsync(200);
    await expect(tapped).resolves.toBe("");
    expect(tap.calls).toHaveLength(0);

    // 0.3 s held plus the tail: half a second, a short word.
    const word = setup();
    await word.adapter.startListening(word.handlers);
    word.chunk(second(0.5, 0.3));
    const said = word.adapter.stopListening();
    word.chunk(second(0.5, 0.2));
    await vi.advanceTimersByTimeAsync(200);
    await expect(said).resolves.toBe("t1");
    expect(word.calls).toHaveLength(1);
    expect(word.calls[0].body).toHaveLength(8000);
  });
});

describe("server adapter retries", () => {
  async function press(t: ReturnType<typeof setup>) {
    await t.adapter.startListening(t.handlers);
    t.chunk(second(0.1));
    const stopped = t.adapter.stopListening();
    const settled = stopped.then(
      (v) => ({ ok: true as const, v }),
      (e: unknown) => ({ ok: false as const, e }),
    );
    return { settled };
  }

  it.each([
    [500, 3],
    [502, 3],
    [429, 3],
  ])("tries %i again after 1.2 s and then after 3 s, then fails the press", async (status, n) => {
    const t = setup({ answers: () => reply(status)() });
    const { settled } = await press(t);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1199);
    expect(t.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2999);
    expect(t.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.calls).toHaveLength(n);
    const r = await settled;
    expect(r.ok).toBe(false);
    expect((r as { e: VoiceError }).e).toMatchObject({ code: "failed", status });
  });

  it("tries a network failure again and reports unavailable when it keeps failing", async () => {
    const t = setup({ answers: () => Promise.reject(new TypeError("offline")) });
    const { settled } = await press(t);
    await vi.advanceTimersByTimeAsync(200 + 1200 + 3000);
    expect(t.calls).toHaveLength(3);
    const r = await settled;
    expect((r as { e: VoiceError }).e).toMatchObject({ code: "unavailable" });
  });

  it("uses Retry-After for a 429, capped at 3 s", async () => {
    const t = setup({
      answers: (_c, n) => reply(n < 3 ? 429 : 200, { text: "ok" }, { "Retry-After": n === 1 ? "1" : "30" })(),
    });
    const { settled } = await press(t);
    await vi.advanceTimersByTimeAsync(999);
    expect(t.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2999);
    expect(t.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.calls).toHaveLength(3);
    expect(await settled).toEqual({ ok: true, v: "ok" });
  });

  it.each([400, 401, 403, 413])("does not try %i again", async (status) => {
    const t = setup({ answers: () => reply(status)() });
    const { settled } = await press(t);
    await vi.advanceTimersByTimeAsync(200);
    const r = await settled;
    expect(t.calls).toHaveLength(1);
    expect((r as { e: VoiceError }).e).toMatchObject({ code: "failed", status });
  });

  it("does not try 503 again and reports unavailable", async () => {
    const t = setup({ answers: () => reply(503)() });
    const { settled } = await press(t);
    await vi.advanceTimersByTimeAsync(200);
    const r = await settled;
    expect(t.calls).toHaveLength(1);
    expect((r as { e: VoiceError }).e).toMatchObject({ code: "unavailable", status: 503 });
  });

  it("does not reject when the second try works", async () => {
    const t = setup({ answers: (_c, n) => reply(n === 1 ? 500 : 200, { text: "fine" })() });
    const { settled } = await press(t);
    await vi.advanceTimersByTimeAsync(200 + 1200);
    expect(await settled).toEqual({ ok: true, v: "fine" });
    expect(t.errors).toHaveLength(0);
  });

  it("reports nothing while the button is still held, and sends nothing after a final failure", async () => {
    const t = setup({ answers: () => reply(400)() });
    await t.adapter.startListening(t.handlers);
    t.chunk(second(0.1));
    t.chunk(second(0.2));
    await vi.advanceTimersByTimeAsync(0);
    expect(t.errors).toHaveLength(0);
    expect(t.calls).toHaveLength(1);
    const stopped = t.adapter.stopListening();
    const check = expect(stopped).rejects.toMatchObject({ code: "failed" });
    await vi.advanceTimersByTimeAsync(200);
    await check;
    expect(t.calls).toHaveLength(1);
  });

  it("gives up after 25 s of waiting", async () => {
    const t = setup({ answers: () => new Promise<Response>(() => {}) });
    await t.adapter.startListening(t.handlers);
    t.chunk(second(0.1));
    const stopped = t.adapter.stopListening();
    const check = expect(stopped).rejects.toMatchObject({ code: "unavailable" });
    await vi.advanceTimersByTimeAsync(24_000);
    let settled = false;
    void stopped.catch(() => {}).then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    await check;
    expect(t.calls[0].signal.aborted).toBe(true);
  });
});

describe("server adapter lifecycle", () => {
  it("dispose stops the capture and aborts requests in flight, and the pending stop resolves", async () => {
    const t = setup({ answers: () => new Promise<Response>(() => {}) });
    await t.adapter.startListening(t.handlers);
    t.chunk(second(0.1));
    await vi.advanceTimersByTimeAsync(0);
    const stopped = t.adapter.stopListening();
    await vi.advanceTimersByTimeAsync(300);
    t.adapter.dispose();
    await expect(stopped).resolves.toBe("");
    expect(t.calls[0].signal.aborted).toBe(true);
    expect(t.stopCapture).toHaveBeenCalled();
  });

  it("dispose during a press that is still held aborts it", async () => {
    const t = setup();
    await t.adapter.startListening(t.handlers);
    t.adapter.dispose();
    expect(t.stopCapture).toHaveBeenCalled();
    t.chunk(second(0.1)); // a late chunk is ignored
    await vi.advanceTimersByTimeAsync(0);
    expect(t.calls).toHaveLength(0);
  });

  it("prepare unlocks speech and capture before its first await", () => {
    const t = setup();
    const unlock = vi.spyOn(PlaybackQueue.prototype, "unlock").mockResolvedValue();
    const adapter = createServerAdapter({
      captureSupported: () => true,
      unlockCapture: () => order.push("capture"),
      speech: () => "server",
    });
    const order: string[] = [];
    unlock.mockImplementation(async () => {});
    void adapter.prepare();
    // Nothing has been awaited yet: both ran synchronously.
    expect(order).toEqual(["capture"]);
    expect(unlock).toHaveBeenCalledTimes(1);
    unlock.mockRestore();
    void t;
  });

  it("prepare throws unsupported when capture is not supported, and does not open the microphone", async () => {
    const t = setup({ supported: false });
    await expect(t.adapter.prepare()).rejects.toMatchObject({ code: "unsupported" });
    expect(t.unlockCapture).toHaveBeenCalledTimes(1);
    expect(t.startCapture).not.toHaveBeenCalled();
  });

  it("prepare resolves when supported, without opening the microphone", async () => {
    const t = setup();
    await t.adapter.prepare();
    expect(t.startCapture).not.toHaveBeenCalled();
  });
});

describe("server adapter speech", () => {
  it("speaks through the shared output and stops speech when listening starts", async () => {
    const played: string[] = [];
    let paused = 0;
    const audio: AudioLike = {
      src: "",
      onended: null,
      onerror: null,
      play: async () => {
        played.push(audio.src);
      },
      pause: () => {
        paused += 1;
      },
    };
    const requests: string[] = [];
    const playback = new PlaybackQueue({
      fetch: (async (_u: string, init: RequestInit) => {
        requests.push(JSON.parse(init.body as string).text);
        return new Response(new Blob(["x"]));
      }) as unknown as typeof fetch,
      createAudio: () => audio,
      createObjectURL: () => "blob:1",
      revokeObjectURL: () => {},
      createMeter: () => null,
      now: () => 0,
    });
    const engines: string[] = [];
    const startCapture = vi.fn(async (): Promise<MicCapture> => ({ stop: async () => {} }));
    const adapter = createServerAdapter({
      speech: () => "server",
      playback,
      onSpeechEngine: (e) => engines.push(e),
      startCapture,
      unlockCapture: () => {},
      captureSupported: () => true,
    });
    const done = adapter.speak("Hello.", { lang: "en" });
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toEqual(["Hello."]);
    expect(played).toHaveLength(1);
    await adapter.startListening({ onError: () => {} });
    expect(paused).toBeGreaterThan(0);
    await done;
    audio.onended?.();
    expect(adapter.getOutputLevel()).toBeNull();
  });
});
