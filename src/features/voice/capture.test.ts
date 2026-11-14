import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startMicCapture, unlockCapture, type CaptureDeps } from "./capture";
import { VoiceError } from "./errors";

class FakeTrack {
  stopped = false;
  listeners = new Map<string, () => void>();
  stop() {
    this.stopped = true;
  }
  addEventListener(type: string, fn: () => void) {
    this.listeners.set(type, fn);
  }
  removeEventListener(type: string) {
    this.listeners.delete(type);
  }
  end() {
    this.listeners.get("ended")?.();
  }
}

function fakeStream(track = new FakeTrack()) {
  return { track, stream: { getTracks: () => [track] } as unknown as MediaStream };
}

class FakeNode {
  connected: unknown[] = [];
  disconnected = false;
  connect(n: unknown) {
    this.connected.push(n);
  }
  disconnect() {
    this.disconnected = true;
  }
}

class FakeWorkletNode extends FakeNode {
  static last: FakeWorkletNode | null = null;
  static autoDone = true;
  static throwOnCreate = false;
  port: { onmessage: ((e: { data: unknown }) => void) | null; messages: unknown[]; postMessage: (m: unknown) => void };
  onprocessorerror: (() => void) | null = null;
  constructor() {
    super();
    if (FakeWorkletNode.throwOnCreate) throw new Error("no node");
    FakeWorkletNode.last = this;
    this.port = {
      onmessage: null,
      messages: [],
      postMessage: (m) => {
        this.port.messages.push(m);
        if (FakeWorkletNode.autoDone && (m as { type?: string }).type === "stop") {
          this.emit({ done: true });
        }
      },
    };
  }
  emit(data: unknown) {
    this.port.onmessage?.({ data });
  }
}

class FakeProcessor extends FakeNode {
  onaudioprocess: ((e: unknown) => void) | null = null;
}

class FakeContext {
  static last: FakeContext | null = null;
  static count = 0;
  static rejectModule = false;
  static withWorklet = true;
  state = "suspended";
  sampleRate = 48000;
  destination = {};
  resumed = 0;
  suspended = 0;
  processor = new FakeProcessor();
  audioWorklet: { addModule: (u: string) => Promise<void> } | undefined;
  constructor() {
    FakeContext.last = this;
    FakeContext.count++;
    this.audioWorklet = FakeContext.withWorklet
      ? { addModule: () => (FakeContext.rejectModule ? Promise.reject(new Error("bad")) : Promise.resolve()) }
      : undefined;
  }
  resume() {
    this.resumed++;
    this.state = "running";
    return Promise.resolve();
  }
  suspend() {
    this.suspended++;
    this.state = "suspended";
    return Promise.resolve();
  }
  createMediaStreamSource() {
    return new FakeNode();
  }
  createGain() {
    return Object.assign(new FakeNode(), { gain: { value: 1 } });
  }
  createScriptProcessor() {
    return this.processor;
  }
}

function deps(over: Partial<CaptureDeps> & { track?: FakeTrack } = {}): CaptureDeps {
  const { track, ...rest } = over;
  return {
    getUserMedia: () => Promise.resolve(fakeStream(track).stream),
    // a fresh constructor per call, so the page-wide context from an earlier test is not reused
    AudioContextCtor: class extends FakeContext {} as unknown as typeof AudioContext,
    AudioWorkletNodeCtor: FakeWorkletNode as unknown as typeof AudioWorkletNode,
    createObjectURL: () => "blob:fake",
    revokeObjectURL: () => {},
    ...rest,
  };
}

const handlers = () => ({ onChunk: vi.fn(), onError: vi.fn() });

beforeEach(() => {
  FakeContext.rejectModule = false;
  FakeContext.withWorklet = true;
  FakeContext.count = 0;
  FakeWorkletNode.autoDone = true;
  FakeWorkletNode.throwOnCreate = false;
  FakeWorkletNode.last = null;
});
afterEach(() => vi.useRealTimers());

describe("startMicCapture with a worklet", () => {
  it("delivers what the processor posts, in order, at the context's rate", async () => {
    const h = handlers();
    const cap = await startMicCapture(h, deps());
    const node = FakeWorkletNode.last!;
    node.emit(new Float32Array([1, 2]));
    FakeContext.last!.sampleRate = 44100;
    node.emit(new Float32Array([3]));
    expect(h.onChunk.mock.calls.map((c) => [Array.from(c[0] as Float32Array), c[1]])).toEqual([
      [[1, 2], 48000],
      [[3], 44100],
    ]);
    await cap.stop();
  });

  it("asks for the rest on stop, waits for the done marker, then stops the tracks", async () => {
    FakeWorkletNode.autoDone = false;
    const track = new FakeTrack();
    const h = handlers();
    const cap = await startMicCapture(h, deps({ track }));
    const node = FakeWorkletNode.last!;
    let finished = false;
    const p = cap.stop().then(() => (finished = true));
    await Promise.resolve();
    expect(node.port.messages).toEqual([{ type: "stop" }]);
    expect(track.stopped).toBe(false);
    node.emit(new Float32Array([9]));
    node.emit({ done: true });
    await p;
    expect(finished).toBe(true);
    expect(h.onChunk).toHaveBeenCalledTimes(1);
    expect(track.stopped).toBe(true);
    expect(node.disconnected).toBe(true);
    expect(FakeContext.last!.suspended).toBe(1);
  });

  it("gives up waiting after 200 ms", async () => {
    vi.useFakeTimers();
    FakeWorkletNode.autoDone = false;
    const track = new FakeTrack();
    const cap = await startMicCapture(handlers(), deps({ track }));
    const p = cap.stop();
    await vi.advanceTimersByTimeAsync(199);
    expect(track.stopped).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await p;
    expect(track.stopped).toBe(true);
  });

  it("is safe to stop twice and delivers nothing afterwards", async () => {
    const h = handlers();
    const track = new FakeTrack();
    const cap = await startMicCapture(h, deps({ track }));
    const node = FakeWorkletNode.last!;
    await Promise.all([cap.stop(), cap.stop()]);
    await cap.stop();
    node.emit(new Float32Array([1]));
    expect(h.onChunk).not.toHaveBeenCalled();
    expect(FakeContext.last!.suspended).toBe(1);
  });

  it("reports a track that ends by itself once", async () => {
    const h = handlers();
    const track = new FakeTrack();
    await startMicCapture(h, deps({ track }));
    track.end();
    track.end();
    expect(h.onError).toHaveBeenCalledTimes(1);
    const err = h.onError.mock.calls[0][0] as VoiceError;
    expect(err).toBeInstanceOf(VoiceError);
    expect(err.code).toBe("failed");
  });

  it("reports a worklet error", async () => {
    const h = handlers();
    await startMicCapture(h, deps());
    FakeWorkletNode.last!.onprocessorerror?.();
    expect(h.onError).toHaveBeenCalledTimes(1);
  });
});

describe("fallback", () => {
  it("uses a script processor when addModule rejects", async () => {
    FakeContext.rejectModule = true;
    const h = handlers();
    const cap = await startMicCapture(h, deps());
    expect(FakeWorkletNode.last).toBeNull();
    const buf = new Float32Array([0.5, -0.5]);
    FakeContext.last!.processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => buf } });
    const got = h.onChunk.mock.calls[0][0] as Float32Array;
    expect(Array.from(got)).toEqual([0.5, -0.5]);
    expect(got).not.toBe(buf);
    await cap.stop();
    expect(FakeContext.last!.processor.onaudioprocess).toBeNull();
  });

  it("uses a script processor without audioWorklet", async () => {
    FakeContext.withWorklet = false;
    const h = handlers();
    // a fresh constructor so the earlier context is not reused
    class Ctx2 extends FakeContext {}
    await startMicCapture(h, deps({ AudioContextCtor: Ctx2 as unknown as typeof AudioContext }));
    expect(FakeWorkletNode.last).toBeNull();
    FakeContext.last!.processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(1) } });
    expect(h.onChunk).toHaveBeenCalledTimes(1);
  });

  it("uses a script processor when the node constructor throws", async () => {
    FakeWorkletNode.throwOnCreate = true;
    class Ctx3 extends FakeContext {}
    const h = handlers();
    await startMicCapture(h, deps({ AudioContextCtor: Ctx3 as unknown as typeof AudioContext }));
    FakeContext.last!.processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(1) } });
    expect(h.onChunk).toHaveBeenCalledTimes(1);
  });
});

describe("errors", () => {
  it("maps a refusal to mic-denied and no device to unsupported", async () => {
    const denied = deps({ getUserMedia: () => Promise.reject(new DOMException("no", "NotAllowedError")) });
    await expect(startMicCapture(handlers(), denied)).rejects.toMatchObject({ code: "mic-denied" });
    const none = deps({ getUserMedia: () => Promise.reject(new DOMException("none", "NotFoundError")) });
    await expect(startMicCapture(handlers(), none)).rejects.toMatchObject({ code: "unsupported" });
  });

  it("is unsupported without getUserMedia or an audio context", async () => {
    await expect(
      startMicCapture(handlers(), { ...deps(), getUserMedia: undefined }),
    ).rejects.toMatchObject({ code: "unsupported" });
    await expect(
      startMicCapture(handlers(), { ...deps(), AudioContextCtor: undefined }),
    ).rejects.toMatchObject({ code: "unsupported" });
  });
});

describe("unlockCapture", () => {
  it("never throws without an audio context", () => {
    expect(() => unlockCapture()).not.toThrow();
    expect(() => unlockCapture({ AudioContextCtor: undefined })).not.toThrow();
  });

  it("creates the context once and asks it to resume every time", () => {
    class Ctx4 extends FakeContext {}
    const d = { AudioContextCtor: Ctx4 as unknown as typeof AudioContext };
    unlockCapture(d);
    unlockCapture(d);
    expect(FakeContext.count).toBe(1);
    // Asked again even though the state reads "running": a suspend from a capture that is still
    // stopping may be on its way, and the later request wins.
    expect(FakeContext.last!.resumed).toBe(2);
  });

  it("does not throw when the constructor throws", () => {
    class Boom {
      constructor() {
        throw new Error("x");
      }
    }
    expect(() => unlockCapture({ AudioContextCtor: Boom as unknown as typeof AudioContext })).not.toThrow();
  });
});
