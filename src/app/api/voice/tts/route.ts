import { ElevenLabsError } from "@elevenlabs/elevenlabs-js";
import { TtsRequest } from "@/contracts/voice";
import { createElevenLabsClient } from "@/features/voice/server/client";
import { FALLBACK_VOICE_ID, getVoiceServerConfig, json } from "@/features/voice/server/config";
import { ttsLimiter } from "@/features/voice/server/limiter";
import { PiperBusyError, piperAvailable, synthesise } from "@/features/voice/server/piper";

export const dynamic = "force-dynamic";

/**
 * One sentence of speech. ElevenLabs when its key is set, otherwise Piper on this server when
 * its binary and voices are present, otherwise 503 (the browser then speaks for itself).
 */
export async function POST(req: Request) {
  const { apiKey, adapterSetting } = getVoiceServerConfig();
  const usePiper = !apiKey && adapterSetting !== "none" && piperAvailable();
  if (!apiKey && !usePiper) return json({ error: "voice_unavailable" }, 503);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const parsed = TtsRequest.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_request" }, 400);

  if (apiKey) return elevenlabs(apiKey, parsed.data.text, req.signal);
  return piper(parsed.data.text, parsed.data.lang, req.signal);
}

/** The text is never logged here; the audio goes to the browser and is not kept. */
async function piper(text: string, lang: string, signal: AbortSignal): Promise<Response> {
  try {
    const wav = await synthesise(text, lang, signal);
    return new Response(new Uint8Array(wav), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(wav.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof PiperBusyError) return json({ error: "voice_busy" }, 429);
    if (signal.aborted) return json({ error: "aborted" }, 499);
    return json({ error: "voice_upstream_failed" }, 502);
  }
}

async function elevenlabs(apiKey: string, text: string, signal: AbortSignal): Promise<Response> {
  const { voiceId, ttsModel } = getVoiceServerConfig();

  const release = ttsLimiter.tryAcquire();
  if (!release) return json({ error: "voice_busy" }, 429);

  try {
    const audio = await createElevenLabsClient(apiKey).textToSpeech.stream(
      voiceId ?? FALLBACK_VOICE_ID,
      {
        text,
        modelId: ttsModel,
        outputFormat: "mp3_44100_64",
      },
      { abortSignal: signal },
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
    if (signal.aborted) return json({ error: "aborted" }, 499);
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
