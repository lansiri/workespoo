import { getEnv } from "@/lib/env";

/**
 * Server-side voice settings. `src/lib/env.ts` is lead-owned and lacks three variables, so
 * they are read here, at the point of use and never at import.
 */
export interface VoiceServerConfig {
  apiKey: string | undefined;
  /** What VOICE_ADAPTER asks for, or undefined for "choose for me". */
  adapterSetting: "elevenlabs" | "browser" | "none" | undefined;
  voiceId: string | undefined;
  ttsModel: string;
  sttModel: string;
}

const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export function getVoiceServerConfig(): VoiceServerConfig {
  const env = getEnv();
  return {
    apiKey: env.ELEVENLABS_API_KEY,
    adapterSetting: env.VOICE_ADAPTER,
    voiceId: blank(process.env.ELEVENLABS_VOICE_ID),
    ttsModel: blank(process.env.ELEVENLABS_TTS_MODEL) ?? "eleven_flash_v2_5",
    sttModel: blank(process.env.ELEVENLABS_STT_MODEL) ?? "scribe_v3_live",
  };
}

/** Voice used when ELEVENLABS_VOICE_ID is unset: a stock ElevenLabs voice ("Rachel"). Unverified. */
export const FALLBACK_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

export function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
