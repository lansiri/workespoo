import { ElevenLabsError } from "@elevenlabs/elevenlabs-js";
import { TtsRequest } from "@/contracts/voice";
import { createElevenLabsClient } from "@/features/voice/server/client";
import { FALLBACK_VOICE_ID, getVoiceServerConfig, json } from "@/features/voice/server/config";
import { ttsLimiter } from "@/features/voice/server/limiter";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { apiKey, voiceId, ttsModel } = getVoiceServerConfig();
  if (!apiKey) return json({ error: "voice_unavailable" }, 503);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const parsed = TtsRequest.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_request" }, 400);

  const release = ttsLimiter.tryAcquire();
  if (!release) return json({ error: "voice_busy" }, 429);

  try {
    const audio = await createElevenLabsClient(apiKey).textToSpeech.stream(
      voiceId ?? FALLBACK_VOICE_ID,
      {
        text: parsed.data.text,
        modelId: ttsModel,
        outputFormat: "mp3_44100_64",
      },
      { abortSignal: req.signal },
    );

    // Hold the concurrency slot until the audio has been fully relayed (or the client left).
    const reader = audio.getReader();
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            release();
            controller.close();
          } else {
            controller.enqueue(value);
          }
        } catch (e) {
          release();
          controller.error(e);
        }
      },
      cancel(reason) {
        release();
        return reader.cancel(reason).catch(() => {});
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no", // keep proxies from buffering the clip
      },
    });
  } catch (e) {
    release();
    if (req.signal.aborted) return json({ error: "aborted" }, 499);
    return upstreamError(e);
  }
}

/** Never pass the vendor's message or body through: it can echo request details. */
function upstreamError(e: unknown): Response {
  const status = e instanceof ElevenLabsError ? e.statusCode : undefined;
  if (status === 429) return json({ error: "voice_rate_limited" }, 429);
  if (status === 401 || status === 403) return json({ error: "voice_unavailable" }, 503);
  return json({ error: "voice_upstream_failed" }, 502);
}
