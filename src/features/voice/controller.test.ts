import { describe, expect, it, vi } from "vitest";
import type { ListenHandlers, VoiceAdapter } from "@/contracts/voice";
import { VoiceController } from "./controller";
import { VoiceError } from "./errors";

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeAdapter(overrides: Partial<VoiceAdapter> = {}) {
  const speaks: ReturnType<typeof deferred<void>>[] = [];
  let handlers: ListenHandlers | null = null;
  const adapter = {
    id: "browser",
    supportsPartials: true,
    prepare: vi.fn(async () => {}),
    startListening: vi.fn(async (h: ListenHandlers) => {
      handlers = h;
    }),
    stopListening: vi.fn(async () => "hello there"),
    speak: vi.fn(() => {
      const d = deferred<void>();
      speaks.push(d);
      return d.promise;
    }),
    cancelSpeech: vi.fn(() => {
      speaks.splice(0).forEach((d) => d.resolve());
    }),
    getOutputLevel: () => 0.5,
    dispose: vi.fn(),
    ...overrides,
  } satisfies VoiceAdapter;
  return { adapter: adapter as VoiceAdapter, speaks, handlers: () => handlers! };
}

describe("VoiceController", () => {
  it("is unavailable without an adapter and ignores input", async () => {
    const c = new VoiceController({ adapter: null });
    expect(c.getState().status).toBe("unavailable");
    await c.pressTalk();
    expect(await c.releaseTalk()).toBe("");
    expect(c.getState().status).toBe("unavailable");
  });

  it("press, partials, release returns the final transcript", async () => {
    const f = fakeAdapter();
    let t = 0;
    const c = new VoiceController({ adapter: f.adapter, now: () => (t += 100) });
    await c.pressTalk();
    expect(c.getState().status).toBe("listening");
    f.handlers().onPartial?.("hel");
    expect(c.getState().partial).toBe("hel");
    f.handlers().onLevel?.(0.4);
    expect(c.getState().inputLevel).toBe(0.4);
    const text = await c.releaseTalk();
    expect(text).toBe("hello there");
    expect(c.getState()).toMatchObject({
      status: "idle",
      partial: "",
      finalTranscript: "hello there",
    });
    expect(c.getState().timings.releaseToFinalMs).toBe(100);
  });

  it("release before the connection is ready waits for it", async () => {
    const start = deferred();
    const f = fakeAdapter({ startListening: vi.fn(() => start.promise) });
    const c = new VoiceController({ adapter: f.adapter });
    const pressed = c.pressTalk();
    const released = c.releaseTalk();
    expect(c.getState().status).toBe("transcribing");
    expect(f.adapter.stopListening).not.toHaveBeenCalled();
    start.resolve();
    await pressed;
    expect(await released).toBe("hello there");
  });

  it("pressing talk while speaking cancels speech first", async () => {
    const f = fakeAdapter();
    const c = new VoiceController({ adapter: f.adapter });
    void c.speakSentences(["One.", "Two."], "en");
    expect(c.getState().status).toBe("speaking");
    await c.pressTalk();
    expect(f.adapter.cancelSpeech).toHaveBeenCalled();
    expect(c.getState().status).toBe("listening");
    const order = vi.mocked(f.adapter.cancelSpeech).mock.invocationCallOrder[0];
    expect(order).toBeLessThan(vi.mocked(f.adapter.startListening).mock.invocationCallOrder[0]);
  });

  it("speaks every sentence, then returns to idle", async () => {
    const f = fakeAdapter();
    const c = new VoiceController({ adapter: f.adapter });
    const done = c.speakSentences(["One.", " ", "Two."], "fi");
    expect(f.adapter.speak).toHaveBeenCalledTimes(2);
    expect(f.adapter.speak).toHaveBeenCalledWith("One.", { lang: "fi" });
    f.speaks.splice(0).forEach((d) => d.resolve());
    await done;
    expect(c.getState().status).toBe("idle");
  });

  it("cancelSpeech returns to idle and a stale run does not overwrite later state", async () => {
    const f = fakeAdapter();
    const c = new VoiceController({ adapter: f.adapter });
    const done = c.speakSentences(["One."], "en");
    c.cancelSpeech();
    expect(c.getState().status).toBe("idle");
    await c.pressTalk();
    await done;
    expect(c.getState().status).toBe("listening");
  });

  it("does not speak while capturing", async () => {
    const f = fakeAdapter();
    const c = new VoiceController({ adapter: f.adapter });
    await c.pressTalk();
    await c.speakSentences(["Nope."], "en");
    expect(f.adapter.speak).not.toHaveBeenCalled();
    expect(c.getState().status).toBe("listening");
  });

  it("a prepare failure for an unsupported browser makes voice unavailable", async () => {
    const f = fakeAdapter({
      prepare: vi.fn(async () => {
        throw new VoiceError("unsupported");
      }),
    });
    const c = new VoiceController({ adapter: f.adapter });
    await c.pressTalk();
    expect(c.getState()).toMatchObject({ status: "unavailable" });
    expect(c.getState().error?.code).toBe("unsupported");
  });

  it("a start failure (mic denied) moves to error and release returns empty", async () => {
    const f = fakeAdapter({
      startListening: vi.fn(async () => {
        throw new VoiceError("mic-denied");
      }),
    });
    const c = new VoiceController({ adapter: f.adapter });
    await c.pressTalk();
    expect(c.getState().status).toBe("error");
    expect(c.getState().error?.code).toBe("mic-denied");
    expect(await c.releaseTalk()).toBe("");
    c.clearError();
    expect(c.getState().status).toBe("idle");
  });

  it("an adapter error while listening ends the press", async () => {
    const f = fakeAdapter();
    const c = new VoiceController({ adapter: f.adapter });
    await c.pressTalk();
    f.handlers().onError(new Error("socket closed"));
    expect(c.getState().status).toBe("error");
    expect(await c.releaseTalk()).toBe("");
  });

  it("a stop failure moves to error", async () => {
    const f = fakeAdapter({
      stopListening: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    const c = new VoiceController({ adapter: f.adapter });
    await c.pressTalk();
    expect(await c.releaseTalk()).toBe("");
    expect(c.getState().status).toBe("error");
  });

  it("a speech failure moves to error and stops the rest", async () => {
    const f = fakeAdapter({
      speak: vi.fn(async () => {
        throw new VoiceError("unavailable");
      }),
    });
    const c = new VoiceController({ adapter: f.adapter });
    await c.speakSentences(["One."], "en");
    expect(c.getState().status).toBe("error");
    expect(c.getState().error?.code).toBe("unavailable");
    expect(f.adapter.cancelSpeech).toHaveBeenCalled();
  });

  it("an empty transcript is returned as an empty string", async () => {
    const f = fakeAdapter({ stopListening: vi.fn(async () => "  ") });
    const c = new VoiceController({ adapter: f.adapter });
    await c.pressTalk();
    expect(await c.releaseTalk()).toBe("");
    expect(c.getState().status).toBe("idle");
  });

  it("records the first-audio timing", () => {
    const c = new VoiceController({ adapter: fakeAdapter().adapter });
    c.recordFirstAudio(420);
    expect(c.getState().timings.requestToFirstAudioMs).toBe(420);
  });
});
