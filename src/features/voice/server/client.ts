import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export function createElevenLabsClient(apiKey: string): ElevenLabsClient {
  return new ElevenLabsClient({ apiKey, maxRetries: 0, timeoutInSeconds: 20 });
}
