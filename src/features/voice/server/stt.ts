/**
 * Speech to text on our own server (docs/research/voice-stt.md): the client side of the `stt`
 * container, which runs sherpa-onnx's websocket server with one multilingual model.
 *
 * The audio is never written to disk and never logged, and neither is the text: it is returned
 * to the caller and forgotten here. Error messages never hold either.
 */

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

/** Where the recogniser listens (`STT_URL`, for example `ws://stt:6006`), or undefined when unset. */
export function sttUrl(): string | undefined {
  throw new Error("not built yet");
}

/**
 * True when this server can turn speech into text right now: `STT_URL` is set, this runtime has
 * a WebSocket client, and the recogniser answered a connection a moment ago. The answer is
 * remembered for a few seconds, so calling this on every page load costs nothing.
 */
export function sttAvailable(): Promise<boolean> {
  throw new Error("not built yet");
}

/**
 * Turns one stretch of speech (mono, 16 kHz, 16-bit PCM) into text. Resolves with "" when
 * nothing was said or the stretch is shorter than `STT_MIN_SECONDS`. Rejects with
 * `SttBusyError`, `SttFailedError` or an `AbortError`.
 */
export function transcribe(pcm: Int16Array, options?: { signal?: AbortSignal }): Promise<string> {
  void pcm;
  void options;
  throw new Error("not built yet");
}
