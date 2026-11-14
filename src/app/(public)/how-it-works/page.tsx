import type { Metadata } from "next";
import { getUiLang } from "@/lib/i18n/server";
import { HowItWorksView } from "./HowItWorksView";
import { howTexts, pageContent } from "./messages";
import { getCachedStats } from "./stats";
import { voiceProcessor } from "./voice-processor";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getUiLang();
  return { title: pageContent(lang, "none").title, description: howTexts[lang].metaDescription };
}

export default async function HowItWorksPage() {
  const lang = await getUiLang();
  const stats = await getCachedStats();
  return <HowItWorksView lang={lang} voice={await voiceProcessor()} stats={stats} />;
}
