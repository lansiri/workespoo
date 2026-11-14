/**
 * Speech to text on our own server (docs/research/voice-stt.md): the client side of the `stt`
 * container, which runs sherpa-onnx's websocket server with one multilingual model.
 *
 * The audio is never written to disk and never logged, and neither is the text: it is returned
 * to the caller and forgotten here. Error messages never hold either.
 */

import { STT_MAX_SECONDS, STT_MIN_SECONDS, STT_SAMPLE_RATE } from "@/contracts/voice";

/** Thrown when too many recordings are already waiting for the recogniser. */
export class SttBusyError extends Error {
  constructor() {
    super("speech recognition busy");
    this.name = "SttBusyError";
  }
}

/** Thrown when the recogniser cannot be reached, stops mid-request or takes too long. */
export class SttFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SttFailedError";
  }
}

const MAX_CONCURRENT = 2;
const SLOT_WAIT_MS = 4000;
const RECORDING_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 1500;
const PROBE_TIMEOUT_MS = 1500;
const AVAILABLE_TTL_MS = 15_000;
const UNAVAILABLE_TTL_MS = 3000;
/** After `Done` the server closes by itself; if it does not, we close within this time. */
const CLOSE_AFTER_DONE_MS = 2000;
/** A socket that has been told to close but never says so is treated as closed after this. */
const CLOSE_GIVE_UP_MS = 5000;
const FRAME_BYTES = 64 * 1024;

/** The parts of a WebSocket the client uses, so tests can hand in a fake. */
export interface SttSocket {
  binaryType: string;
  send(data: string | Uint8Array): void;
  close(): void;
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void;
}
export type SttSocketCtor = new (url: string) => SttSocket;

export interface SttClientOptions {
  /** Read at the point of use. Blank or undefined means unset. */
  url?: string | (() => string | undefined);
  /** The WebSocket class. Pass `null` for a runtime without one. Default: `globalThis.WebSocket`. */
  WebSocket?: SttSocketCtor | null;
  now?: () => number;
  timers?: {
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
  };
  maxConcurrent?: number;
  slotWaitMs?: number;
  recordingTimeoutMs?: number;
  retryDelayMs?: number;
  probeTimeoutMs?: number;
}

function abortError(): Error {
  const e = new Error("aborted");
  e.name = "AbortError";
  return e;
}

/** A failure that a second try would not change. */
class FatalSttError extends SttFailedError {}

/** The text without `<unk>` marks and stray whitespace. */
export function cleanText(text: string): string {
  return text.replace(/<unk>/g, " ").replace(/\s+/g, " ").trim();
}

interface RunState {
  error: Error | null;
  listeners: Set<() => void>;
}

interface Attempt {
  answer: Promise<string>;
  closed: Promise<void>;
}

export class SttClient {
  private readonly opts: SttClientOptions;
  private active = 0;
  private readonly waiting: Array<() => void> = [];
  private memo: { value: boolean; until: number } | null = null;
  private probing: Promise<boolean> | null = null;

  constructor(options: SttClientOptions = {}) {
    this.opts = options;
  }

  url(): string | undefined {
    const u = this.opts.url;
    const raw = typeof u === "function" ? u() : u;
    return raw && raw.trim() ? raw.trim() : undefined;
  }

  private ws(): SttSocketCtor | undefined {
    if ("WebSocket" in this.opts) return this.opts.WebSocket ?? undefined;
    return (globalThis as { WebSocket?: unknown }).WebSocket as SttSocketCtor | undefined;
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  private after(fn: () => void, ms: number): () => void {
    const t = this.opts.timers;
    const handle = t ? t.setTimeout(fn, ms) : setTimeout(fn, ms);
    return () => (t ? t.clearTimeout(handle) : clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  get inFlight(): number {
    return this.active;
  }

  // ---- availability ----

  available(): Promise<boolean> {
    if (!this.url() || !this.ws()) return Promise.resolve(false);
    if (this.memo && this.now() < this.memo.until) return Promise.resolve(this.memo.value);
    if (!this.probing) {
      this.probing = this.probe().then((value) => {
        this.remember(value);
        this.probing = null;
        return value;
      });
    }
    return this.probing;
  }

  private remember(value: boolean): void {
    this.memo = { value, until: this.now() + (value ? AVAILABLE_TTL_MS : UNAVAILABLE_TTL_MS) };
  }

  private probe(): Promise<boolean> {
    const url = this.url();
    const Ctor = this.ws();
    if (!url || !Ctor) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let ws: SttSocket;
      try {
        ws = new Ctor(url);
      } catch {
        resolve(false);
        return;
      }
      let done = false;
      let cancelTimer = () => {};
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        cancelTimer();
        if (!ok) {
          try {
            ws.close();
          } catch {
            // already gone
          }
        }
        resolve(ok);
      };
      cancelTimer = this.after(() => finish(false), this.opts.probeTimeoutMs ?? PROBE_TIMEOUT_MS);
      ws.addEventListener("open", () => {
        try {
          ws.send("Done");
        } catch {
          // the open is what counts
        }
        finish(true);
      });
      ws.addEventListener("error", () => finish(false));
      ws.addEventListener("close", () => finish(false));
    });
  }

  // ---- recording ----

  async transcribe(pcm: Int16Array, options: { signal?: AbortSignal } = {}): Promise<string> {
    const { signal } = options;
    if (signal?.aborted) throw abortError();
    // An empty recording kills the recogniser: never open a connection for one.
    if (pcm.length < STT_MIN_SECONDS * STT_SAMPLE_RATE) return "";
    if (pcm.length > STT_MAX_SECONDS * STT_SAMPLE_RATE) {
      throw new SttFailedError("recording too long");
    }
    const url = this.url();
    const Ctor = this.ws();
    if (!url || !Ctor) throw new SttFailedError("speech recognition not configured");

    const release = await this.acquire(signal);
    let lastClosed: Promise<void> = Promise.resolve();
    try {
      const text = await this.run(url, Ctor, pcm, signal, (c) => (lastClosed = c));
      return text;
    } finally {
      // The slot is held until the socket has really closed, not until the caller has its answer.
      void lastClosed.then(release, release);
    }
  }

  private async run(
    url: string,
    Ctor: SttSocketCtor,
    pcm: Int16Array,
    signal: AbortSignal | undefined,
    track: (closed: Promise<void>) => void,
  ): Promise<string> {
    const state: RunState = { error: null, listeners: new Set() };
    const cancel = (e: Error) => {
      if (state.error) return;
      state.error = e;
      for (const l of [...state.listeners]) l();
    };
    const onAbort = () => cancel(abortError());
    signal?.addEventListener("abort", onAbort, { once: true });
    const stopTimer = this.after(
      () => cancel(new SttFailedError("speech recognition timed out")),
      this.opts.recordingTimeoutMs ?? RECORDING_TIMEOUT_MS,
    );
    try {
      for (let attempt = 0; ; attempt++) {
        const a = this.attempt(url, Ctor, pcm, state);
        track(a.closed);
        try {
          const text = await a.answer;
          this.remember(true);
          return text;
        } catch (e) {
          if (state.error) throw state.error;
          if (e instanceof FatalSttError) throw new SttFailedError(e.message);
          if (attempt >= 1) {
            this.remember(false);
            throw new SttFailedError("speech recognition connection failed");
          }
        }
        await a.closed;
        await this.sleep(state, this.opts.retryDelayMs ?? RETRY_DELAY_MS);
        if (state.error) throw state.error;
      }
    } finally {
      stopTimer();
      signal?.removeEventListener("abort", onAbort);
    }
  }

  private sleep(state: RunState, ms: number): Promise<void> {
    return new Promise((resolve) => {
      let cancelTimer = () => {};
      const wake = () => {
        state.listeners.delete(wake);
        cancelTimer();
        resolve();
      };
      state.listeners.add(wake);
      cancelTimer = this.after(wake, ms);
    });
  }

  private attempt(url: string, Ctor: SttSocketCtor, pcm: Int16Array, state: RunState): Attempt {
    let ws: SttSocket;
    try {
      ws = new Ctor(url);
    } catch {
      return {
        answer: Promise.reject(new SttFailedError("speech recognition connection failed")),
        closed: Promise.resolve(),
      };
    }
    let resolveClosed!: () => void;
    const closed = new Promise<void>((r) => (resolveClosed = r));
    let isClosed = false;
    let cancelGiveUp = () => {};
    let cancelDone = () => {};
    const markClosed = () => {
      if (isClosed) return;
      isClosed = true;
      cancelGiveUp();
      cancelDone();
      resolveClosed();
    };
    const closeSocket = () => {
      if (isClosed) return;
      try {
        ws.close();
      } catch {
        markClosed();
        return;
      }
      cancelGiveUp();
      cancelGiveUp = this.after(markClosed, CLOSE_GIVE_UP_MS);
    };

    const answer = new Promise<string>((resolve, reject) => {
      let answered = false;
      const onCancel = () => {
        reject(state.error ?? abortError());
        closeSocket();
      };
      state.listeners.add(onCancel);
      const fail = () => {
        reject(new SttFailedError("speech recognition connection failed"));
        closeSocket();
      };
      ws.binaryType = "arraybuffer";
      ws.addEventListener("open", () => {
        if (state.error) return;
        try {
          for (const frame of frames(pcm)) ws.send(frame);
        } catch {
          fail();
        }
      });
      ws.addEventListener("message", (event) => {
        if (typeof event.data !== "string" || answered) return;
        answered = true;
        let text: unknown;
        try {
          text = (JSON.parse(event.data) as { text?: unknown }).text;
        } catch {
          text = undefined;
        }
        if (typeof text !== "string") {
          reject(new FatalSttError("speech recognition gave an unreadable answer"));
          closeSocket();
          return;
        }
        resolve(cleanText(text));
        try {
          ws.send("Done");
        } catch {
          closeSocket();
          return;
        }
        cancelDone = this.after(closeSocket, CLOSE_AFTER_DONE_MS);
      });
      ws.addEventListener("error", fail);
      ws.addEventListener("close", () => {
        reject(new SttFailedError("speech recognition connection closed"));
        markClosed();
      });
    });
    // Rejections are handled by the caller; never leave one unobserved.
    answer.catch(() => {});
    return { answer, closed };
  }

  private acquire(signal?: AbortSignal): Promise<() => void> {
    const max = this.opts.maxConcurrent ?? MAX_CONCURRENT;
    const make = () => {
      let done = false;
      return () => {
        if (done) return;
        done = true;
        const wake = this.waiting.shift();
        if (wake) wake();
        else this.active -= 1;
      };
    };
    if (this.active < max) {
      this.active += 1;
      return Promise.resolve(make());
    }
    return new Promise((resolve, reject) => {
      let cancelTimer = () => {};
      const wake = () => {
        cancelTimer();
        signal?.removeEventListener("abort", onAbort);
        resolve(make());
      };
      const drop = (error: Error) => {
        const i = this.waiting.indexOf(wake);
        if (i >= 0) this.waiting.splice(i, 1);
        cancelTimer();
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      };
      const onAbort = () => drop(abortError());
      cancelTimer = this.after(() => drop(new SttBusyError()), this.opts.slotWaitMs ?? SLOT_WAIT_MS);
      signal?.addEventListener("abort", onAbort, { once: true });
      this.waiting.push(wake);
    });
  }
}

/** The websocket frames for one recording: header and float samples, at most 64 KiB each. */
function* frames(pcm: Int16Array): Generator<Uint8Array> {
  const dataBytes = pcm.length * 4;
  const buf = new Uint8Array(8 + dataBytes);
  const view = new DataView(buf.buffer);
  view.setInt32(0, STT_SAMPLE_RATE, true);
  view.setInt32(4, dataBytes, true);
  for (let i = 0; i < pcm.length; i++) view.setFloat32(8 + i * 4, pcm[i] / 32768, true);
  for (let off = 0; off < buf.length; off += FRAME_BYTES) {
    yield buf.subarray(off, Math.min(off + FRAME_BYTES, buf.length));
  }
}

const shared = new SttClient({ url: () => process.env.STT_URL });

/** Where the recogniser listens (`STT_URL`, for example `ws://stt:6006`), or undefined when unset. */
export function sttUrl(): string | undefined {
  return shared.url();
}

/**
 * True when this server can turn speech into text right now: `STT_URL` is set, this runtime has
 * a WebSocket client, and the recogniser answered a connection a moment ago. The answer is
 * remembered for a few seconds, so calling this on every page load costs nothing.
 */
export function sttAvailable(): Promise<boolean> {
  return shared.available();
}

/**
 * Turns one stretch of speech (mono, 16 kHz, 16-bit PCM) into text. Resolves with "" when
 * nothing was said or the stretch is shorter than `STT_MIN_SECONDS`. Rejects with
 * `SttBusyError`, `SttFailedError` or an `AbortError`.
 */
export function transcribe(pcm: Int16Array, options?: { signal?: AbortSignal }): Promise<string> {
  return shared.transcribe(pcm, options);
}
