import { VoiceError } from "./errors";

/** The slice of HTMLAudioElement the queue needs, so tests can inject a fake. */
export interface AudioLike {
  src: string;
  onended: (() => void) | null;
  onerror: ((event?: unknown) => void) | null;
  play(): Promise<void>;
  pause(): void;
}

export interface OutputMeter {
  /** 0 to 1, for visualisation only. */
  getLevel(): number;
  resume(): Promise<void>;
}

export interface PlaybackOptions {
  /** Text-to-speech endpoint. Defaults to our server proxy. */
  endpoint?: string;
  fetch?: typeof fetch;
  createAudio?: () => AudioLike;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  /** Builds a level meter for the audio element. Return null when unavailable. */
  createMeter?: (audio: AudioLike) => OutputMeter | null;
  /** Called once per burst of sentences: milliseconds from the first request to the first sound. */
  onFirstAudio?: (ms: number) => void;
  now?: () => number;
  /**
   * How many clips may be fetched at once (default: all of them). Our own speech server
   * synthesises one sentence at a time per language and turns a third request away, so the
   * browser adapter keeps this at two: the clip playing and the next one.
   */
  maxConcurrentFetches?: number;
}

// A header-only 8 kHz mono WAV. Playing it inside a tap unlocks the element on iOS.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

interface Item {
  generation: number;
  clip: Promise<Blob>;
  requestedAt: number;
}

/**
 * Plays sentence clips in the order they were queued. Every clip is fetched as soon as it
 * is queued (so later sentences are ready while earlier ones play) but is played in order.
 * One audio element is reused for every clip, which is what keeps iOS from re-locking audio.
 */
export class PlaybackQueue {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly createAudio: () => AudioLike;
  private readonly createUrl: (blob: Blob) => string;
  private readonly revokeUrl: (url: string) => void;
  private readonly createMeter?: (audio: AudioLike) => OutputMeter | null;
  private readonly onFirstAudio?: (ms: number) => void;
  private readonly now: () => number;
  private readonly maxFetches: number;
  private fetching = 0;
  private fetchWaiting: Array<{ start: () => void; drop: (e: unknown) => void }> = [];

  private audio: AudioLike | null = null;
  private meter: OutputMeter | null = null;
  private generation = 0;
  private abort = new AbortController();
  private tail: Promise<void> = Promise.resolve();
  private current: { finish: () => void } | null = null;
  private pending = 0;
  private burstStart = 0;
  private burstReported = false;
  private playing = false;

  constructor(options: PlaybackOptions = {}) {
    this.endpoint = options.endpoint ?? "/api/voice/tts";
    this.fetchImpl = options.fetch ?? ((...args) => globalThis.fetch(...args));
    this.createAudio = options.createAudio ?? (() => new Audio() as unknown as AudioLike);
    this.createUrl = options.createObjectURL ?? ((b) => URL.createObjectURL(b));
    this.revokeUrl = options.revokeObjectURL ?? ((u) => URL.revokeObjectURL(u));
    this.createMeter = options.createMeter ?? defaultMeter;
    this.onFirstAudio = options.onFirstAudio;
    this.now = options.now ?? (() => performance.now());
    this.maxFetches = options.maxConcurrentFetches ?? Infinity;
  }

  private getAudio(): AudioLike {
    if (!this.audio) {
      this.audio = this.createAudio();
      try {
        this.meter = this.createMeter?.(this.audio) ?? null;
      } catch {
        this.meter = null;
      }
    }
    return this.audio;
  }

  /** Call from inside a user gesture, before any await. Safe to call repeatedly. */
  async unlock(): Promise<void> {
    const audio = this.getAudio();
    const resumed = this.meter?.resume().catch(() => {});
    if (!this.playing) {
      try {
        audio.src = SILENT_WAV;
        await audio.play();
        audio.pause();
      } catch {
        // Unlocking is best effort; a real clip will report a real failure.
      }
    }
    await resumed;
  }

  /** Queue one sentence. Resolves when it has played or was cancelled; rejects if it failed. */
  enqueue(text: string, lang: string): Promise<void> {
    if (this.pending === 0) {
      this.burstStart = this.now();
      this.burstReported = false;
    }
    this.pending += 1;
    const generation = this.generation;
    const signal = this.abort.signal;
    const item: Item = {
      generation,
      requestedAt: this.now(),
      clip: this.limitFetch(() => this.fetchClip(text, lang, signal)),
    };
    item.clip.catch(() => {}); // surfaced through the returned promise below

    const run = this.tail
      .then(() => this.playItem(item))
      .finally(() => {
        if (generation === this.generation) this.pending = Math.max(0, this.pending - 1);
      });
    this.tail = run.catch(() => {});
    return run;
  }

  /** Stop the current clip, drop the queue and abort fetches in flight. Effective at once. */
  cancel(): void {
    this.generation += 1;
    this.abort.abort();
    this.abort = new AbortController();
    for (const waiter of this.fetchWaiting.splice(0))
      waiter.drop(new DOMException("Cancelled", "AbortError"));
    this.tail = Promise.resolve();
    this.pending = 0;
    this.playing = false;
    try {
      this.audio?.pause();
    } catch {
      // ignore
    }
    this.current?.finish();
    this.current = null;
  }

  getOutputLevel(): number | null {
    if (!this.meter) return null;
    return this.playing ? this.meter.getLevel() : 0;
  }

  dispose(): void {
    this.cancel();
    this.audio = null;
    this.meter = null;
  }

  /** Runs `task` now, or once fewer than `maxFetches` clips are being fetched. */
  private limitFetch<T>(task: () => Promise<T>): Promise<T> {
    const run = (): Promise<T> => {
      this.fetching += 1;
      return task().finally(() => {
        this.fetching -= 1;
        this.fetchWaiting.shift()?.start();
      });
    };
    if (this.fetching < this.maxFetches) return run();
    return new Promise<T>((resolve, reject) => {
      this.fetchWaiting.push({ start: () => run().then(resolve, reject), drop: reject });
    });
  }

  private async fetchClip(text: string, lang: string, signal: AbortSignal): Promise<Blob> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, lang }),
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new VoiceError("unavailable", "Speech request failed", { cause: error });
    }
    if (!res.ok) {
      throw new VoiceError("unavailable", `Speech service returned ${res.status}`, {
        status: res.status,
      });
    }
    return res.blob();
  }

  private async playItem(item: Item): Promise<void> {
    if (item.generation !== this.generation) return;
    let blob: Blob;
    try {
      blob = await item.clip;
    } catch (error) {
      if (item.generation !== this.generation) return;
      throw error;
    }
    if (item.generation !== this.generation) return;

    const audio = this.getAudio();
    const url = this.createUrl(blob);
    try {
      await new Promise<void>((resolve, reject) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          audio.onended = null;
          audio.onerror = null;
          if (this.current?.finish === finish) this.current = null;
          resolve();
        };
        this.current = { finish };
        audio.onended = finish;
        audio.onerror = () => {
          if (done) return;
          done = true;
          audio.onended = null;
          audio.onerror = null;
          if (this.current?.finish === finish) this.current = null;
          reject(new VoiceError("failed", "Audio playback failed"));
        };
        audio.src = url;
        this.playing = true;
        audio.play().then(
          () => {
            if (!this.burstReported && item.generation === this.generation) {
              this.burstReported = true;
              this.onFirstAudio?.(this.now() - this.burstStart);
            }
          },
          (error: unknown) => {
            if (done) return;
            done = true;
            if (this.current?.finish === finish) this.current = null;
            reject(new VoiceError("failed", "Audio playback was blocked", { cause: error }));
          },
        );
      });
    } finally {
      this.revokeUrl(url);
      if (item.generation === this.generation && this.pending <= 1) this.playing = false;
    }
  }
}

/** Level meter over the shared audio element, using Web Audio. Browser only. */
function defaultMeter(audio: AudioLike): OutputMeter | null {
  if (typeof window === "undefined" || !(audio instanceof HTMLMediaElement)) return null;
  const Ctx: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  const source = ctx.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(ctx.destination);
  const data = new Uint8Array(analyser.fftSize);
  return {
    getLevel() {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) {
        const d = (v - 128) / 128;
        sum += d * d;
      }
      return Math.min(1, Math.sqrt(sum / data.length) * 3);
    },
    resume: () => ctx.resume(),
  };
}
