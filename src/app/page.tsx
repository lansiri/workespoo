import type { Metadata } from "next";
import { pick } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import { ComingSoon } from "@/components/coming-soon/ComingSoon";
import { comingSoonMessages } from "@/components/coming-soon/messages";

export async function generateMetadata(): Promise<Metadata> {
  const m = pick(comingSoonMessages, await getUiLang());
  return { title: m.metaTitle, description: m.metaDescription };
}

export default async function Home() {
  return <ComingSoon lang={await getUiLang()} />;
}
