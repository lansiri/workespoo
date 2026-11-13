import { createElevenLabsClient } from "@/features/voice/server/client";
import { getVoiceServerConfig, json } from "@/features/voice/server/config";

export const dynamic = "force-dynamic";

/** Seconds a single-use speech-to-text token stays valid (documented as 15 minutes). */
const TOKEN_TTL_SECONDS = 900;

export async function POST() {
  const { apiKey, sttModel } = getVoiceServerConfig();
  if (!apiKey) return json({ error: "voice_unavailable" }, 503);
  try {
    const { token } = await createElevenLabsClient(apiKey).tokens.singleUse.create("realtime_scribe");
    // `modelId` is an extra field beyond VoiceTokenResponse so the browser uses the configured model.
    return json({ token, expiresInSeconds: TOKEN_TTL_SECONDS, modelId: sttModel }, 200);
  } catch {
    return json({ error: "voice_upstream_failed" }, 502);
  }
}
