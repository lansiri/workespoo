/**
 * Microphone capture for the `server` voice adapter: one microphone stream per press of the talk
 * button, delivered as raw samples. The same samples feed the level meter and the upload, so the
 * microphone is opened once. (Phones give the microphone to one user at a time: opening it twice,
 * or next to the browser's own speech recognition, is what cut answers off after the first word.)
 *
 * Nothing is analysed, recorded or stored here. Samples go to the handler and are forgotten.
 */

import { VoiceError, toVoiceError } from "./errors";

export interface MicCapture {
  /**
   * Stops capturing and releases the microphone (the tracks are stopped, so the browser's
   * recording indicator goes out and a phone gives its speaker back). Resolves once the last
   * chunk has been delivered to `onChunk`. Safe to call more than once.
   */
  stop(): Promise<void>;
}

export interface MicCaptureHandlers {
  /**
   * Raw samples of the first channel in [-1, 1] at `sampleRate`, the audio context's own rate
   * (44 100 or 48 000 on most devices). Chunks arrive in order with nothing dropped between
   * them. The array is the handler's to keep.
   */
  onChunk(samples: Float32Array, sampleRate: number): void;
  /** The microphone stopped by itself, or the audio graph failed, after capture had started. */
  onError(error: Error): void;
}

/**
 * Browser pieces the capture uses, replaceable so tests can hand in fakes. Every field defaults
 * to the real thing.
 */
export interface CaptureDeps {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  AudioContextCtor?: typeof AudioContext;
  AudioWorkletNodeCtor?: typeof AudioWorkletNode;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
}

const WORKLET_NAME = "workespoo-capture";
const WORKLET_FRAMES = 2048;
const STOP_WAIT_MS = 200;

/** Runs in the worklet's own global scope: plain JavaScript, no imports. Copies channel 0 only. */
const WORKLET_SOURCE = `
class WorkEspooCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(${WORKLET_FRAMES});
    this.n = 0;
    this.finished = false;
    this.port.onmessage = (e) => {
      if (e.data && e.data.type === "stop") {
        if (this.n > 0) {
          const rest = this.buf.slice(0, this.n);
          this.port.postMessage(rest, [rest.buffer]);
          this.n = 0;
        }
        this.finished = true;
        this.port.postMessage({ done: true });
      }
    };
  }
  process(inputs) {
    if (this.finished) return false;
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    let i = 0;
    while (i < ch.length) {
      const k = Math.min(ch.length - i, ${WORKLET_FRAMES} - this.n);
      this.buf.set(ch.subarray(i, i + k), this.n);
      this.n += k;
      i += k;
      if (this.n === ${WORKLET_FRAMES}) {
        const full = this.buf;
        this.port.postMessage(full, [full.buffer]);
        this.buf = new Float32Array(${WORKLET_FRAMES});
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor("${WORKLET_NAME}", WorkEspooCapture);
`;

type CtxCtor = typeof AudioContext;

function contextCtor(deps: CaptureDeps): CtxCtor | undefined {
  if (deps.AudioContextCtor) return deps.AudioContextCtor;
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: CtxCtor }).webkitAudioContext
  );
}

function userMediaFn(deps: CaptureDeps): CaptureDeps["getUserMedia"] {
  if (deps.getUserMedia) return deps.getUserMedia;
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return undefined;
  const md = navigator.mediaDevices;
  return (c) => md.getUserMedia(c);
}

// The page's one capture context, and which contexts already have the worklet module loaded.
let shared: { ctor: CtxCtor; ctx: AudioContext } | null = null;
const workletLoaded = new WeakMap<object, Promise<void>>();

function getContext(deps: CaptureDeps): AudioContext | undefined {
  const ctor = contextCtor(deps);
  if (!ctor) return undefined;
  if (shared && shared.ctor === ctor && shared.ctx.state !== "closed") return shared.ctx;
  // No sampleRate: iOS is unreliable at anything but the device's own rate.
  const ctx = new ctor();
  shared = { ctor, ctx };
  return ctx;
}

function resumeContext(ctx: AudioContext): void {
  try {
    if (ctx.state === "running") return;
    Promise.resolve(ctx.resume()).catch(() => {});
  } catch {
    /* ignore */
  }
}

/** True when this browser can capture at all: `getUserMedia` and an `AudioContext` exist. */
export function captureSupported(deps: CaptureDeps = {}): boolean {
  return Boolean(userMediaFn(deps) && contextCtor(deps));
}

/**
 * Call synchronously inside a user gesture (the press itself): creates the page's capture
 * AudioContext if there is none and resumes it. iOS only lets audio start from a gesture.
 * Never throws.
 */
export function unlockCapture(deps: CaptureDeps = {}): void {
  try {
    const ctx = getContext(deps);
    if (ctx) resumeContext(ctx);
  } catch {
    /* ignore */
  }
}

function loadWorklet(ctx: AudioContext, deps: CaptureDeps): Promise<void> {
  const known = workletLoaded.get(ctx);
  if (known) return known;
  const p = (async () => {
    if (!ctx.audioWorklet) throw new Error("no audioWorklet");
    const create = deps.createObjectURL ?? ((b: Blob) => URL.createObjectURL(b));
    const revoke = deps.revokeObjectURL ?? ((u: string) => URL.revokeObjectURL(u));
    const url = create(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      try {
        revoke(url);
      } catch {
        /* ignore */
      }
    }
  })();
  workletLoaded.set(ctx, p);
  // A failed load is not remembered: the next press may try again.
  p.catch(() => workletLoaded.delete(ctx));
  return p;
}

/**
 * Opens the microphone and starts delivering chunks. Rejects with a `VoiceError`:
 * `mic-denied` (permission refused), `unsupported` (no microphone or no audio API) or `failed`.
 */
export async function startMicCapture(
  handlers: MicCaptureHandlers,
  deps: CaptureDeps = {},
): Promise<MicCapture> {
  const gum = userMediaFn(deps);
  if (!gum || !contextCtor(deps)) throw new VoiceError("unsupported");

  let ctx: AudioContext | undefined;
  try {
    ctx = getContext(deps);
  } catch (e) {
    throw toVoiceError(e);
  }
  if (!ctx) throw new VoiceError("unsupported");
  const audio = ctx;
  resumeContext(audio);

  let stream: MediaStream;
  try {
    stream = await gum({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (e) {
    throw toVoiceError(e);
  }

  let closed = false; // after this no chunk is delivered
  let stopping: Promise<void> | null = null;
  let errored = false;
  let source: MediaStreamAudioSourceNode | undefined;
  let node: AudioNode | undefined;
  let silent: GainNode | undefined;
  let post: ((msg: unknown) => void) | null = null;
  let onDone: (() => void) | null = null;
  const tracks = stream.getTracks();

  const deliver = (samples: Float32Array) => {
    if (closed) return;
    handlers.onChunk(samples, audio.sampleRate);
  };

  const fail = (cause: unknown) => {
    if (errored || closed) return;
    errored = true;
    handlers.onError(new VoiceError("failed", "microphone capture failed", { cause }));
    void stop();
  };

  const onEnded = () => fail(new Error("microphone track ended"));

  const stop = (): Promise<void> => {
    if (stopping) return stopping;
    stopping = (async () => {
      if (post) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, STOP_WAIT_MS);
          onDone = () => {
            clearTimeout(timer);
            resolve();
          };
          try {
            post?.({ type: "stop" });
          } catch {
            onDone();
          }
        });
      }
      closed = true;
      for (const t of tracks) t.removeEventListener?.("ended", onEnded);
      try {
        source?.disconnect();
        node?.disconnect();
        silent?.disconnect();
      } catch {
        /* ignore */
      }
      if (node && "onaudioprocess" in node) (node as ScriptProcessorNode).onaudioprocess = null;
      for (const t of tracks) {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      }
      try {
        await audio.suspend();
      } catch {
        /* ignore */
      }
    })();
    return stopping;
  };

  try {
    source = audio.createMediaStreamSource(stream);
    silent = audio.createGain();
    silent.gain.value = 0;

    let viaWorklet = false;
    const NodeCtor =
      deps.AudioWorkletNodeCtor ??
      (typeof AudioWorkletNode !== "undefined" ? AudioWorkletNode : undefined);
    if (NodeCtor && audio.audioWorklet) {
      try {
        await loadWorklet(audio, deps);
        const wn = new NodeCtor(audio, WORKLET_NAME, {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: 1,
          channelCountMode: "explicit",
        });
        wn.port.onmessage = (e: MessageEvent) => {
          const d = e.data as unknown;
          if (d instanceof Float32Array) deliver(d);
          else if (d && typeof d === "object" && (d as { done?: boolean }).done) onDone?.();
        };
        wn.onprocessorerror = () => fail(new Error("audio worklet error"));
        post = (m) => wn.port.postMessage(m);
        node = wn;
        viaWorklet = true;
      } catch {
        post = null;
      }
    }
    if (!viaWorklet) {
      const sp = audio.createScriptProcessor(4096, 1, 1);
      sp.onaudioprocess = (e: AudioProcessingEvent) => {
        deliver(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      node = sp;
    }

    source.connect(node!);
    node!.connect(silent);
    silent.connect(audio.destination);
    resumeContext(audio);
    for (const t of tracks) t.addEventListener("ended", onEnded);
  } catch (e) {
    closed = true;
    try {
      source?.disconnect();
      node?.disconnect();
    } catch {
      /* ignore */
    }
    for (const t of tracks) t.stop();
    throw toVoiceError(e);
  }

  return { stop };
}
