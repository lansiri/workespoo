import { STT_MAX_SECONDS, STT_SAMPLE_RATE, type SttResponse } from "@/contracts/voice";
import { getDb } from "@/db/client";
import {
  getVoiceServerConfig,
  json,
  sttAudioBudget,
  sttConsentMemory,
} from "@/features/voice/server/config";
import { SttBusyError, sttUrl, transcribe } from "@/features/voice/server/stt";
import { hasConsent } from "@/lib/consent";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_BYTES = STT_MAX_SECONDS * STT_SAMPLE_RATE * 2;

/**
 * One stretch of speech in, text out. Neither the audio nor the text is stored, logged or
 * audited: they live in this request and are dropped with it.
 */
export async function POST(req: Request) {
  const session = await getSession();
  let caller: string;
  if (session.organiser) caller = "organiser";
  else if (session.talentId) caller = session.talentId;
  else return json({ error: "unauthenticated" }, 401);

  if (getVoiceServerConfig().adapterSetting === "none" || !sttUrl()) {
    return json({ error: "voice_unavailable" }, 503);
  }

  if (!session.organiser && session.talentId) {
    const talentId = session.talentId;
    if (!sttConsentMemory.has(talentId)) {
      const ok = await hasConsent(getDb(), {
        subjectType: "talent",
        subjectId: talentId,
        kind: "voice_vendor",
      });
      if (!ok) return json({ error: "voice_consent_missing" }, 403);
      sttConsentMemory.remember(talentId);
    }
  }

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) return json({ error: "too_large" }, 413);

  const bytes = await readCapped(req);
  if (bytes === "too_large") return json({ error: "too_large" }, 413);
  if (bytes.length === 0 || bytes.length % 2 !== 0) return json({ error: "invalid_request" }, 400);

  // A Buffer slice can sit at an odd offset: copy into an aligned Int16Array, little-endian.
  const samples = new Int16Array(bytes.length / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true);

  const wait = sttAudioBudget.take(caller, samples.length / STT_SAMPLE_RATE);
  if (wait > 0) {
    const res = json({ error: "voice_rate_limited" }, 429);
    res.headers.set("Retry-After", String(wait));
    return res;
  }

  try {
    const text = await transcribe(samples, { signal: req.signal });
    const body: SttResponse = { text };
    return json(body, 200);
  } catch (e) {
    if (e instanceof SttBusyError) {
      const res = json({ error: "voice_busy" }, 429);
      res.headers.set("Retry-After", "1");
      return res;
    }
    if (req.signal.aborted || (e instanceof Error && e.name === "AbortError")) {
      return json({ error: "aborted" }, 499);
    }
    return json({ error: "voice_upstream_failed" }, 502);
  }
}

/** Reads the body up to the cap, whatever Content-Length said. */
async function readCapped(req: Request): Promise<Uint8Array | "too_large"> {
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      return "too_large";
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}
