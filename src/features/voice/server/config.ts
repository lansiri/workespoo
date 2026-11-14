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

const CONSENT_MEMORY_MS = 60_000;
const MEMORY_LIMIT = 1000;

/**
 * Remembers a yes to "has this person agreed to voice" for a minute, so every spoken piece does
 * not ask the database. A no is never remembered. Bounded.
 */
export class ConsentMemory {
  private readonly yes = new Map<string, number>();
  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = CONSENT_MEMORY_MS,
    private readonly limit = MEMORY_LIMIT,
  ) {}

  has(id: string): boolean {
    const until = this.yes.get(id);
    if (until === undefined) return false;
    if (this.now() >= until) {
      this.yes.delete(id);
      return false;
    }
    return true;
  }

  remember(id: string): void {
    this.yes.delete(id);
    this.yes.set(id, this.now() + this.ttlMs);
    while (this.yes.size > this.limit) {
      const oldest = this.yes.keys().next();
      if (oldest.done) break;
      this.yes.delete(oldest.value);
    }
  }

  clear(): void {
    this.yes.clear();
  }
}

/** At most `maxSeconds` of audio per caller in any `windowMs`, in memory only. Bounded. */
export class AudioBudget {
  private readonly callers = new Map<string, Array<{ at: number; seconds: number }>>();
  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxSeconds = 90,
    private readonly windowMs = 60_000,
    private readonly limit = MEMORY_LIMIT,
  ) {}

  /** Charges `seconds` and returns 0, or charges nothing and returns the seconds to wait. */
  take(caller: string, seconds: number): number {
    const now = this.now();
    const entries = (this.callers.get(caller) ?? []).filter((e) => now - e.at < this.windowMs);
    let used = entries.reduce((sum, e) => sum + e.seconds, 0);
    if (used + seconds > this.maxSeconds) {
      let wait = this.windowMs;
      for (const e of entries) {
        used -= e.seconds;
        if (used + seconds <= this.maxSeconds) {
          wait = e.at + this.windowMs - now;
          break;
        }
      }
      this.callers.delete(caller);
      if (entries.length) this.callers.set(caller, entries);
      return Math.max(1, Math.ceil(wait / 1000));
    }
    entries.push({ at: now, seconds });
    this.callers.delete(caller);
    this.callers.set(caller, entries);
    while (this.callers.size > this.limit) {
      const oldest = this.callers.keys().next();
      if (oldest.done) break;
      this.callers.delete(oldest.value);
    }
    return 0;
  }

  /** Gives back a charge that bought nothing (the recogniser was busy or failed). */
  refund(caller: string, seconds: number): void {
    const entries = this.callers.get(caller);
    if (!entries) return;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].seconds === seconds) {
        entries.splice(i, 1);
        break;
      }
    }
    if (entries.length === 0) this.callers.delete(caller);
  }

  clear(): void {
    this.callers.clear();
  }
}

export const sttConsentMemory = new ConsentMemory();
export const sttAudioBudget = new AudioBudget();
