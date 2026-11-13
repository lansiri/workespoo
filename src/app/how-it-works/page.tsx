import type { Metadata } from "next";
import { getEnv } from "@/lib/env";
import { getUiLang } from "@/lib/i18n/server";
import { getVoiceServerConfig } from "@/features/voice/server/config";
import { HowItWorksView } from "./HowItWorksView";
import { howTexts, pageContent, type VoiceProcessor } from "./messages";
import { getCachedStats } from "./stats";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getUiLang();
  return { title: pageContent(lang, "none").title, description: howTexts[lang].metaDescription };
}

/** Same decision as `/api/voice/config`: which service turns speech into text. */
function voiceProcessor(): VoiceProcessor {
  try {
    getEnv();
    const { apiKey, adapterSetting } = getVoiceServerConfig();
    if (adapterSetting === "none") return "none";
    if (apiKey && adapterSetting !== "browser") return "elevenlabs";
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
