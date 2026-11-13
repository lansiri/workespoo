import type { Metadata } from "next";
import { getEnv } from "@/lib/env";
import { getUiLang } from "@/lib/i18n/server";
import { HowItWorksView } from "./HowItWorksView";
import { howTexts, pageContent, type VoiceProcessor } from "./messages";
import { getCachedStats } from "./stats";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getUiLang();
  return { title: pageContent(lang, "none").title, description: howTexts[lang].metaDescription };
}

/** Mirrors the decision as `/api/voice/config`: which service turns speech into text. */
function voiceProcessor(): VoiceProcessor {
  try {
    const env = getEnv();
    if (env.VOICE_ADAPTER === "none") return "none";
    if (env.ELEVENLABS_API_KEY && env.VOICE_ADAPTER !== "browser") return "elevenlabs";
    return "browser";
  } catch {
    return "browser";
  }
}

export default async function HowItWorksPage() {
  const lang = await getUiLang();
  const stats = await getCachedStats();
  return <HowItWorksView lang={lang} voice={voiceProcessor()} stats={stats} />;
}
