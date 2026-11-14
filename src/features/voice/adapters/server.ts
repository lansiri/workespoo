import {
  STT_MIN_SECONDS,
  STT_SAMPLE_RATE,
  SttResponse,
  type ListenHandlers,
  type VoiceAdapter,
} from "@/contracts/voice";
import {
  captureSupported as defaultCaptureSupported,
  startMicCapture,
  unlockCapture as defaultUnlockCapture,
  type MicCapture,
  type MicCaptureHandlers,
} from "../capture";
import { toVoiceError, VoiceError, type VoiceErrorCode } from "../errors";
import { createResampler, createSegmenter, levelOf, toPcm16, type Resampler, type Segmenter } from "../pcm";
import { createSpeechOutput, type SpeechOutputOptions } from "../speech";

export interface ServerAdapterOptions extends SpeechOutputOptions {
  /** Where segments go. Default `/api/voice/stt`. */
  endpoint?: string;
  fetch?: typeof fetch;
  startCapture?: (handlers: MicCaptureHandlers) => Promise<MicCapture>;
  unlockCapture?: () => void;
  captureSupported?: () => boolean;
  /** How long capture continues after the button is released, for the last syllable. Default 200. */
  releaseTailMs?: number;
  /** Wait for a number of milliseconds; rejects early when the signal aborts. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Milliseconds, only differences matter. */
  clock?: () => number;
}

/** Waits before the first and the second retry. */
const RETRY_DELAYS_MS = [1200, 3000];
const MAX_RETRY_AFTER_MS = 3000;
/** The longest stopListening waits for the answers, in all. */
const STOP_LIMIT_MS = 25_000;
const MIN_SAMPLES = STT_MIN_SECONDS * STT_SAMPLE_RATE;
/**
 * A press that captured less than this in all (the tail after release included) is a tap, not an
 * answer: nothing is sent, so a stray touch cannot post half a syllable as the person's words.
 * The shortest real answer, a single "yes" with the tail, is longer.
 */
const MIN_PRESS_SAMPLES = 0.4 * STT_SAMPLE_RATE;

const defaultSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/** Settles with `promise`, or rejects at once when the signal aborts, so an abort never leaves a wait hanging. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

/** A failed request, with what the retry rules need to know. */
class SendError extends Error {
  constructor(
    readonly code: VoiceErrorCode,
    readonly retry: boolean,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(`speech recognition request failed${status ? ` (${status})` : ""}`);
  }
}

/** Everything about one press of the button. Dropped when the press is over. */
interface Press {
  handlers: ListenHandlers;
  capture: MicCapture | null;
  /** The button was released (or the press was replaced). */
  stopped: boolean;
  /** No more chunks are taken. */
  closed: boolean;
  disposed: boolean;
  abort: AbortController;
  resampler: Resampler | null;
  rate: number;
  segmenter: Segmenter;
  /** 16 kHz samples heard in this press so far, and whether any of it has been sent. */
  heard: number;
  sent: boolean;
  /** Answers in the order their segments were cut. */
  texts: string[];
  /** Requests run one after another through this chain, which never rejects. */
  chain: Promise<void>;
  failure: VoiceError | null;
  captureError: VoiceError | null;
}

/**
 * Listens through our own server: the microphone's samples are brought to 16 kHz, cut into
 * segments at pauses and sent one at a time to `/api/voice/stt` while the button is still held.
 * No audio and no text is kept after the press, logged or stored.
 */
export function createServerAdapter(options: ServerAdapterOptions = {}): VoiceAdapter {
  const endpoint = options.endpoint ?? "/api/voice/stt";
  const fetchImpl = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const startCapture = options.startCapture ?? startMicCapture;
  const unlockCapture = options.unlockCapture ?? defaultUnlockCapture;
  const captureSupported = options.captureSupported ?? defaultCaptureSupported;
  const releaseTailMs = options.releaseTailMs ?? 200;
  const sleep = options.sleep ?? defaultSleep;
  const clock = options.clock ?? (() => Date.now());
  const speech = createSpeechOutput(options);

  let current: Press | null = null;

  const joined = (press: Press) => press.texts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  async function request(press: Press, body: Int16Array): Promise<string> {
    let res: Response;
    try {
      res = await abortable(
        fetchImpl(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: body as unknown as BodyInit,
          signal: press.abort.signal,
        }),
        press.abort.signal,
      );
    } catch (e) {
      if (press.abort.signal.aborted) throw e;
      throw new SendError("unavailable", true);
    }
    if (res.ok) {
      try {
        return SttResponse.parse(await res.json()).text;
      } catch (e) {
        if (press.abort.signal.aborted) throw e;
        throw new SendError("failed", false, res.status);
      }
    }
    const status = res.status;
    if (status === 503) throw new SendError("unavailable", false, status);
    if (status === 429) {
      const header = res.headers.get("Retry-After");
      const seconds = header === null || header.trim() === "" ? NaN : Number(header);
      const after = Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS) : undefined;
      throw new SendError("failed", true, status, after);
    }
    throw new SendError("failed", status >= 500, status);
  }

  async function requestWithRetry(press: Press, body: Int16Array): Promise<string> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await request(press, body);
      } catch (e) {
        if (!(e instanceof SendError) || !e.retry || attempt >= RETRY_DELAYS_MS.length) throw e;
        await sleep(e.retryAfterMs ?? RETRY_DELAYS_MS[attempt], press.abort.signal);
      }
    }
  }

  function enqueue(press: Press, segment: Float32Array): void {
    if (segment.length < MIN_SAMPLES) return;
    press.sent = true;
    const body = toPcm16(segment);
    press.chain = press.chain.then(async () => {
      if (press.failure || press.abort.signal.aborted) return;
      try {
        press.texts.push(await requestWithRetry(press, body));
        if (!press.disposed) press.handlers.onPartial?.(joined(press));
      } catch (e) {
        if (press.abort.signal.aborted) return;
        const code = e instanceof SendError ? e.code : "failed";
        press.failure = new VoiceError(code, "Speech recognition failed", {
          cause: e,
          status: e instanceof SendError ? e.status : undefined,
        });
      }
    });
  }

  function feed(press: Press, samples16k: Float32Array): void {
    if (samples16k.length === 0) return;
    press.heard += samples16k.length;
    for (const segment of press.segmenter.push(samples16k)) enqueue(press, segment);
  }

  function onChunk(press: Press, samples: Float32Array, rate: number): void {
    if (press.closed) return;
    press.handlers.onLevel?.(levelOf(samples));
    if (!press.resampler || press.rate !== rate) {
      if (press.resampler) feed(press, press.resampler.flush());
      press.resampler = createResampler(rate, STT_SAMPLE_RATE);
      press.rate = rate;
    }
    feed(press, press.resampler.push(samples));
  }

  /** Ends a press without waiting for anything: used by a new press, and by dispose. */
  function drop(press: Press): void {
    press.stopped = true;
    press.closed = true;
    press.disposed = true;
    press.abort.abort();
    void press.capture?.stop().catch(() => {});
  }

  const adapter: VoiceAdapter = {
    id: "server",
    supportsPartials: true,

    async prepare() {
      // Everything that must happen inside the gesture happens before the first await.
      const unlocked = speech.unlock();
      try {
        unlockCapture();
      } catch {
        // never fatal
      }
      if (!captureSupported()) {
        throw new VoiceError("unsupported", "This browser cannot capture audio");
      }
      await unlocked;
    },

    async startListening(handlers: ListenHandlers) {
      // Still inside the press: the capture context was suspended when the last press ended, and
      // a phone only lets it start again from a gesture.
      try {
        unlockCapture();
      } catch {
        // never fatal
      }
      if (current) drop(current);
      adapter.cancelSpeech();
      const press: Press = {
        handlers,
        capture: null,
        stopped: false,
        closed: false,
        disposed: false,
        abort: new AbortController(),
        resampler: null,
        rate: 0,
        segmenter: createSegmenter({ sampleRate: STT_SAMPLE_RATE }),
        heard: 0,
        sent: false,
        texts: [],
        chain: Promise.resolve(),
        failure: null,
        captureError: null,
      };
      current = press;
      let capture: MicCapture;
      try {
        capture = await startCapture({
          onChunk: (samples, rate) => onChunk(press, samples, rate),
          onError: (error) => {
            if (press.closed) return;
            press.captureError = toVoiceError(error);
            // The press is over: the controller goes to its error state and will not call
            // stopListening. Release the microphone, stop sending, forget what was heard.
            drop(press);
            press.texts = [];
            if (current === press) current = null;
            handlers.onError(press.captureError);
          },
        });
      } catch (e) {
        if (current === press) current = null;
        throw toVoiceError(e);
      }
      if (press.stopped) {
        // Released (or replaced, or disposed) while the microphone was opening.
        press.closed = true;
        await capture.stop().catch(() => {});
        return;
      }
      press.capture = capture;
    },

    async stopListening() {
      const press = current;
      if (!press || press.stopped) return "";
      press.stopped = true;
      try {
        return await finish(press);
      } finally {
        // Kept until here so that dispose() can still abort a press that is waiting for answers.
        if (current === press) current = null;
      }
    },

    speak: (text, opts) => speech.speak(text, opts),
    cancelSpeech: () => speech.cancel(),
    getOutputLevel: () => speech.getOutputLevel(),

    dispose() {
      if (current) drop(current);
      current = null;
      speech.dispose();
    },
  };

  async function finish(press: Press): Promise<string> {
    {
      const capture = press.capture;
      if (!capture) {
        press.closed = true;
        return "";
      }
      const deadline = clock() + STOP_LIMIT_MS;
      try {
        await sleep(releaseTailMs, press.abort.signal);
        await capture.stop().catch(() => {});
      } catch {
        // aborted by dispose
      }
      press.closed = true;
      if (!press.disposed) {
        if (press.resampler) feed(press, press.resampler.flush());
        const rest = press.segmenter.flush();
        if (press.sent || press.heard >= MIN_PRESS_SAMPLES) enqueue(press, rest);
        const limit = new AbortController();
        const timedOut = await Promise.race([
          press.chain.then(() => false),
          sleep(Math.max(0, deadline - clock()), limit.signal).then(
            () => true,
            () => false,
          ),
        ]);
        limit.abort();
        if (timedOut) {
          press.abort.abort();
          throw new VoiceError("unavailable", "Speech recognition took too long");
        }
      }
      if (press.disposed) return "";
      if (press.failure) throw press.failure;
      if (press.captureError?.code === "mic-denied") throw press.captureError;
      return joined(press);
    }
  }
  return adapter;
}
