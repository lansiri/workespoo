import { z } from "zod";

export const VoiceAdapterId = z.enum(["elevenlabs", "http", "browser"]);
export type VoiceAdapterId = z.infer<typeof VoiceAdapterId>;

export interface ListenHandlers {
  /** Live partial transcript while the person is still speaking, when the adapter supports it. */
  onPartial?(text: string): void;
  /** Microphone level from 0 to 1, for visualisation only. It is never analysed or stored. */
  onLevel?(level: number): void;
  onError(error: Error): void;
}

/**
 * The one interface the interview UI talks to. Push-to-talk maps to
 * `startListening` on button down and `stopListening` on button up.
 *
 * Adapters must not analyse voice, tone or emotion, and must not store audio.
 */
export interface VoiceAdapter {
  readonly id: VoiceAdapterId;
  readonly supportsPartials: boolean;
  /**
   * Call from inside a user gesture. Asks for microphone permission and unlocks audio
   * output (needed on iOS). Safe to call more than once.
   */
  prepare(): Promise<void>;
  startListening(handlers: ListenHandlers): Promise<void>;
  /** Resolves with the final transcript, or an empty string if nothing was heard. */
  stopListening(): Promise<string>;
  /** Queue one sentence for speech. Resolves when it has finished playing or was cancelled. */
  speak(text: string, options: { lang: string }): Promise<void>;
  /** Stop playback now and clear the queue. */
  cancelSpeech(): void;
  /** Output level from 0 to 1 for visualisation, or null when unavailable. */
  getOutputLevel(): number | null;
  dispose(): void;
}

/** What the server tells the browser about the voice setup for this deployment. */
export const VoiceConfig = z.object({
  adapter: VoiceAdapterId.or(z.literal("none")),
  /** Shown in the consent text: who processes the audio. */
  processor: z.string(),
  /**
   * Who speaks the interviewer's replies when the adapter is `browser`: the browser's own
   * speechSynthesis, or our server (`POST /api/voice/tts`). Absent means `browser`.
   */
  tts: z.enum(["browser", "server"]).optional(),
});
export type VoiceConfig = z.infer<typeof VoiceConfig>;

export const VoiceTokenResponse = z.object({
  token: z.string().min(1),
  expiresInSeconds: z.number().int().min(1),
  /** The speech-to-text model the browser should connect with, when the server pins one. */
  modelId: z.string().optional(),
});
export type VoiceTokenResponse = z.infer<typeof VoiceTokenResponse>;

export const TtsRequest = z.object({
  text: z.string().min(1).max(600),
  lang: z.string().min(2).max(8),
});
export type TtsRequest = z.infer<typeof TtsRequest>;
