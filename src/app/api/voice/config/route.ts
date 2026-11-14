import type { VoiceConfig } from "@/contracts/voice";
import { getVoiceServerConfig, json } from "@/features/voice/server/config";
import { piperAvailable } from "@/features/voice/server/piper";
import { sttAvailable } from "@/features/voice/server/stt";

export const dynamic = "force-dynamic";

export async function GET() {
  const { apiKey, adapterSetting } = getVoiceServerConfig();
  let config: VoiceConfig;
  if (adapterSetting === "none") {
    config = { adapter: "none", processor: "none" };
  } else if (apiKey && adapterSetting !== "browser") {
    config = { adapter: "elevenlabs", processor: "ElevenLabs" };
  } else if (adapterSetting !== "browser" && (await sttAvailable())) {
    // Our own recogniser: the audio goes to our server only, and nothing else hears it.
    config = {
      adapter: "server",
      processor: "WorkEspoo's own server",
      tts: piperAvailable() ? "server" : "browser",
    };
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
