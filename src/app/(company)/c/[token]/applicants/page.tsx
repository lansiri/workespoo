import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { applicantsForCompany } from "@/features/application";
import { CompanyApplicantsView } from "@/features/application/ui/CompanyApplicantsView";
import { rankedMessages } from "@/features/application/messages-organiser";
import { ExpiredLink } from "@/features/picks/CompanyDigestView";
import { pick } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const m = pick(rankedMessages, await getUiLang());
  return { title: m.companyTitle, robots: { index: false, follow: false } };
}

export default async function CompanyApplicantsPage(props: PageProps<"/c/[token]/applicants">) {
  const { token } = await props.params;
  const lang = await getUiLang();
  const data = await applicantsForCompany(getDb(), token);
  if (!data) return <ExpiredLink lang={lang} />;
  return <CompanyApplicantsView data={data} token={token} />;
}
