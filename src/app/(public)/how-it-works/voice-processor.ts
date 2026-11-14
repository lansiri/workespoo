import { sttAvailable } from "@/features/voice/server/stt";
import { getEnv } from "@/lib/env";
import type { VoiceProcessor } from "./messages";

/** Mirrors the decision as `/api/voice/config`: which service turns speech into text. */
export async function voiceProcessor(): Promise<VoiceProcessor> {
  try {
    const env = getEnv();
    if (env.VOICE_ADAPTER === "none") return "none";
    if (env.ELEVENLABS_API_KEY && env.VOICE_ADAPTER !== "browser") return "elevenlabs";
    if (env.VOICE_ADAPTER !== "browser" && (await sttAvailable())) return "server";
    return "browser";
  } catch {
    return "browser";
  }
}
