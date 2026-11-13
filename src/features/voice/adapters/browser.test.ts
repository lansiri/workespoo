import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackQueue, type AudioLike } from "../playback";
import { createBrowserAdapter, type SpeechEngine } from "./browser";

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

/** A minimal speechSynthesis that records utterances and ends them on demand. */
class FakeSynth {
  spoken: { text: string; lang: string; u: FakeUtterance }[] = [];
  cancelled = 0;
  speak = vi.fn((u: FakeUtterance) => {
    if (u.text) this.spoken.push({ text: u.text, lang: u.lang, u });
  });
  cancel = vi.fn(() => {
    this.cancelled += 1;
  });
  getVoices = () => [];
}
class FakeUtterance {
  lang = "";
  voice: unknown = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  constructor(readonly text: string) {}
}

class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult = null;
  onerror = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {}
  stop() {
    this.onend?.();
  }
  abort() {}
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function setup(opts: { engine?: SpeechEngine; status?: number; hold?: boolean } = {}) {
  const gates: (() => void)[] = [];
  const audio = new FakeAudio();
  const requests: { url: string; text: string; lang: string; signal: AbortSignal }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const { text, lang } = JSON.parse(init.body as string) as { text: string; lang: string };
    requests.push({ url, text, lang, signal: init.signal as AbortSignal });
    if (opts.hold) await new Promise<void>((r) => gates.push(r));
    const status = opts.status ?? 200;
    return new Response(status === 200 ? new Blob([text]) : JSON.stringify({ error: "x" }), {
      status,
    });
  }) as unknown as typeof fetch;
  const playback = new PlaybackQueue({
    fetch: fetchImpl,
    createAudio: () => audio,
    createObjectURL: (b) => `blob:${b.size}`,
    revokeObjectURL: () => {},
    createMeter: () => null,
    now: () => 0,
    maxConcurrentFetches: 2,
  });
  const engines: SpeechEngine[] = [];
  let engine: SpeechEngine = opts.engine ?? "server";
  const adapter = createBrowserAdapter({
    speech: () => engine,
    onSpeechEngine: (e) => engines.push(e),
    playback,
    recognitionLang: () => "fi-FI",
  });
  return {
    adapter,
    gates,
    audio,
    requests,
    engines,
    setEngine: (e: SpeechEngine) => {
      engine = e;
    },
  };
}

let synth: FakeSynth;
beforeEach(() => {
  synth = new FakeSynth();
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser adapter with server speech", () => {
  it("speaks through the playback queue and /api/voice/tts, not speechSynthesis", async () => {
    const { adapter, audio, requests, engines } = setup();
    const done = adapter.speak("Hei, kiitos.", { lang: "fi" });
    await tick();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ url: "/api/voice/tts", text: "Hei, kiitos.", lang: "fi" });
    expect(audio.played).toHaveLength(1);
    audio.end();
    await done;
    expect(synth.speak).not.toHaveBeenCalled();
    expect(engines).toEqual(["server"]);
  });

  it("plays sentences in order and fetches at most two at a time", async () => {
    const { adapter, audio, requests, gates } = setup({ hold: true });
    const done = ["One.", "Two.", "Three."].map((t) => adapter.speak(t, { lang: "en" }));
    await tick();
    expect(requests.map((r) => r.text)).toEqual(["One.", "Two."]);
    gates[0]();
    await tick();
    await tick();
    expect(requests.map((r) => r.text)).toEqual(["One.", "Two.", "Three."]);
    gates[1]();
    gates[2]();
    await tick();
    audio.end();
    await tick();
    audio.end();
    await tick();
    audio.end();
    await Promise.all(done);
    expect(audio.played).toEqual(["blob:4", "blob:4", "blob:6"]);
  });

  it("cancelSpeech stops the clip and aborts fetches, like the ElevenLabs adapter", async () => {
    const { adapter, audio, requests } = setup();
    const done = [adapter.speak("One.", { lang: "en" }), adapter.speak("Two.", { lang: "en" })];
    await tick();
    adapter.cancelSpeech();
    await Promise.all(done); // cancelled speech resolves, it does not fail
    expect(audio.paused).toBeGreaterThan(0);
    expect(requests.every((r) => r.signal.aborted)).toBe(true);
    expect(synth.cancel).toHaveBeenCalled();
  });

  it("barges in: pressing talk stops the server speech", async () => {
    const { adapter, audio, requests } = setup();
    const done = adapter.speak("A long reply.", { lang: "en" });
    await tick();
    await adapter.startListening({ onError: () => {} });
    await done;
    expect(audio.paused).toBeGreaterThan(0);
    expect(requests[0].signal.aborted).toBe(true);
    expect(FakeRecognition.last?.lang).toBe("fi-FI");
    await adapter.stopListening();
  });

  it("falls back to speechSynthesis when the server answers 503, and stays there", async () => {
    const { adapter, requests, engines } = setup({ status: 503 });
    const first = adapter.speak("First.", { lang: "sv" });
    await tick();
    await tick();
    expect(synth.spoken.map((s) => s.text)).toEqual(["First."]);
    expect(synth.spoken[0].lang).toBe("sv");
    synth.spoken[0].u.onend?.();
    await first;

    const second = adapter.speak("Second.", { lang: "sv" });
    await tick();
    expect(requests).toHaveLength(1); // no new request to the server
    expect(synth.spoken.map((s) => s.text)).toEqual(["First.", "Second."]);
    synth.spoken[1].u.onend?.();
    await second;
    expect(engines).toEqual(["browser", "browser"]);
  });

  it("reports other server failures instead of switching engines", async () => {
    const { adapter } = setup({ status: 429 });
    await expect(adapter.speak("Busy.", { lang: "en" })).rejects.toMatchObject({
      code: "unavailable",
      status: 429,
    });
    expect(synth.speak).not.toHaveBeenCalled();
  });
});

describe("browser adapter with browser speech", () => {
  it("uses speechSynthesis and never calls the server", async () => {
    const { adapter, requests, engines } = setup({ engine: "browser" });
    const done = adapter.speak("Hello.", { lang: "en" });
    await tick();
    expect(requests).toHaveLength(0);
    expect(synth.spoken.map((s) => s.text)).toEqual(["Hello."]);
    synth.spoken[0].u.onend?.();
    await done;
    expect(engines).toEqual(["browser"]);
  });

  it("reads the engine at each sentence", async () => {
    const { adapter, requests, setEngine, audio } = setup({ engine: "browser" });
    const a = adapter.speak("Browser.", { lang: "en" });
    await tick();
    synth.spoken[0].u.onend?.();
    await a;
    setEngine("server");
    const b = adapter.speak("Server.", { lang: "en" });
    await tick();
    expect(requests.map((r) => r.text)).toEqual(["Server."]);
    audio.end();
    await b;
  });
});
