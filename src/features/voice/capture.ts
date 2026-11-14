/**
 * Microphone capture for the `server` voice adapter: one microphone stream per press of the talk
 * button, delivered as raw samples. The same samples feed the level meter and the upload, so the
 * microphone is opened once. (Phones give the microphone to one user at a time: opening it twice,
 * or next to the browser's own speech recognition, is what cut answers off after the first word.)
 *
 * Nothing is analysed, recorded or stored here. Samples go to the handler and are forgotten.
 */

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

/** True when this browser can capture at all: `getUserMedia` and an `AudioContext` exist. */
export function captureSupported(): boolean {
  throw new Error("not built yet");
}

/**
 * Call synchronously inside a user gesture (the press itself): creates the page's capture
 * AudioContext if there is none and resumes it. iOS only lets audio start from a gesture.
 * Never throws.
 */
export function unlockCapture(): void {
  throw new Error("not built yet");
}

/**
 * Opens the microphone and starts delivering chunks. Rejects with a `VoiceError`:
 * `mic-denied` (permission refused), `unsupported` (no microphone or no audio API) or `failed`.
 */
export function startMicCapture(handlers: MicCaptureHandlers): Promise<MicCapture> {
  void handlers;
  throw new Error("not built yet");
}
