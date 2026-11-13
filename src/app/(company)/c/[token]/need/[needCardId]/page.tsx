import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { HttpError } from "@/lib/http";
import { pick } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import { NeedCardPageView } from "@/features/needs/NeedCardPageView";
import { companyNeedView } from "@/features/needs/actions";
import { needMessages } from "@/features/needs/messages";

export const dynamic = "force-dynamic";

// A company page names nothing about the employer, and is not for search engines.
export const metadata: Metadata = { title: "WorkEspoo", robots: { index: false, follow: false } };

export default async function CompanyNeedPage({ params }: PageProps<"/c/[token]/need/[needCardId]">) {
  const { token, needCardId } = await params;
  const lang = await getUiLang();
  let view;
  try {
    view = await companyNeedView(getDb(), needCardId, token);
  } catch (error) {
    if (error instanceof HttpError) notFound();
    throw error;
  }
  return <NeedCardPageView view={view} m={pick(needMessages, lang)} lang={lang} token={token} />;
}
