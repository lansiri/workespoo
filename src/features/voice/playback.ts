import { VoiceError } from "./errors";

/** The slice of HTMLAudioElement the queue needs, so tests can inject a fake. */
export interface AudioLike {
  src: string;
  onended: (() => void) | null;
  onerror: ((event?: unknown) => void) | null;
  /** Seconds played so far. Read to notice a clip that has stopped moving. */
  readonly currentTime?: number;
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
  /**
   * Builds a level meter for the audio element. There is none unless one is passed in: a meter
   * routes the element's sound through a Web Audio context, and then the interviewer is only
   * heard while that context stays awake, which a phone does not promise (it suspends audio
   * contexts when the microphone or another app takes over).
   */
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

/**
 * A clip that is playing is looked at twice a second. A phone can pause it without telling us
 * (another sound takes over, the microphone is released, the page goes to the background), and
 * then `ended` never comes and every later sentence would wait behind it for ever. After one
 * second without progress the element is asked to play again; after four the clip is given up,
 * so the next sentence is spoken.
 */
const STALL_CHECK_MS = 500;
const STALL_NUDGE_CHECKS = 2;
const STALL_SKIP_CHECKS = 8;

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
    this.createMeter = options.createMeter;
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
    let watch: ReturnType<typeof setInterval> | undefined;
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
        let lastTime: number | undefined;
        let still = 0;
        watch = setInterval(() => {
          if (done) return;
          const t = audio.currentTime;
          if (typeof t !== "number") return; // not a media element: nothing to watch
          if (t !== lastTime) {
            lastTime = t;
            still = 0;
            return;
          }
          still += 1;
          if (still === STALL_NUDGE_CHECKS) void audio.play().catch(() => {});
          else if (still >= STALL_SKIP_CHECKS) finish();
        }, STALL_CHECK_MS);
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
      if (watch) clearInterval(watch);
      this.revokeUrl(url);
      if (item.generation === this.generation && this.pending <= 1) this.playing = false;
    }
  }
}
