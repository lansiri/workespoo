import type { VoiceConfig } from "@/contracts/voice";
import { getVoiceServerConfig, json } from "@/features/voice/server/config";
import { piperAvailable } from "@/features/voice/server/piper";

export const dynamic = "force-dynamic";

export async function GET() {
  const { apiKey, adapterSetting } = getVoiceServerConfig();
  let config: VoiceConfig;
  if (adapterSetting === "none") {
    config = { adapter: "none", processor: "none" };
  } else if (apiKey && adapterSetting !== "browser") {
    config = { adapter: "elevenlabs", processor: "ElevenLabs" };
  } else {
    // `processor` names only the speech-recognition service: the person's audio goes there.
    // Speech from our own server (Piper) sends nothing anywhere else.
    config = {
      adapter: "browser",
      processor: "your browser's speech service",
      tts: !apiKey && piperAvailable() ? "server" : "browser",
    };
  }
  return json(config, 200);
}
