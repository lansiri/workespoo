/** Why a voice operation failed. The UI maps each code to a line in docs/specs/copy.md. */
export type VoiceErrorCode =
  /** The browser has no speech recognition (copy: error.mic.unsupported). */
  | "unsupported"
  /** Microphone permission was refused (copy: error.mic.denied). */
  | "mic-denied"
  /** The voice service could not be reached or refused us (copy: error.network or error.voice.failed). */
  | "unavailable"
  /** Anything else (copy: error.voice.failed). */
  | "failed";

export class VoiceError extends Error {
  readonly code: VoiceErrorCode;

  constructor(code: VoiceErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? code, options);
    this.name = "VoiceError";
    this.code = code;
  }
}

export function toVoiceError(error: unknown, fallback: VoiceErrorCode = "failed"): VoiceError {
  if (error instanceof VoiceError) return error;
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
    return new VoiceError("mic-denied", error.message, { cause: error });
  }
  if (error instanceof DOMException && (error.name === "NotFoundError" || error.name === "NotSupportedError")) {
    return new VoiceError("unsupported", error.message, { cause: error });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new VoiceError(fallback, message, { cause: error });
}

/** Copy ids (docs/specs/copy.md) for an error code, so the UI never shows raw messages. */
export function copyIdForError(code: VoiceErrorCode): string {
  switch (code) {
    case "unsupported":
      return "error.mic.unsupported";
    case "mic-denied":
      return "error.mic.denied";
    case "unavailable":
      return "error.network";
    default:
      return "error.voice.failed";
  }
}
