import type { VoiceConfig } from "@/contracts/voice";
import { getVoiceServerConfig, json } from "@/features/voice/server/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const { apiKey, adapterSetting } = getVoiceServerConfig();
  let config: VoiceConfig;
  if (adapterSetting === "none") {
    config = { adapter: "none", processor: "none" };
  } else if (apiKey && adapterSetting !== "browser") {
    config = { adapter: "elevenlabs", processor: "ElevenLabs" };
  } else {
    config = { adapter: "browser", processor: "your browser's speech service" };
  }
  return json(config, 200);
}
