import type { Metadata } from "next";
import { pick } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import { FrontPage } from "@/components/coming-soon/FrontPage";
import { frontMessages } from "@/components/coming-soon/front-messages";

export async function generateMetadata(): Promise<Metadata> {
  const m = pick(frontMessages, await getUiLang());
  return { title: m.metaTitle, description: m.metaDescription };
}

export default async function Home() {
  return <FrontPage lang={await getUiLang()} />;
}
