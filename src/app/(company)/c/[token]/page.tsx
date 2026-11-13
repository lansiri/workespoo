import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { CompanyDigestView, ExpiredLink } from "@/features/picks/CompanyDigestView";
import { buildCompanyPage } from "@/features/picks/company-view";
import { companyMessages } from "@/features/picks/messages";
import { fmt, pick } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import { companyFromToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/c/[token]">): Promise<Metadata> {
  const { token } = await props.params;
  const m = pick(companyMessages, await getUiLang());
  const company = await companyFromToken(getDb(), token);
  return {
    title: company ? fmt(m.pageTitle, { company: company.displayName }) : m.expiredTitle,
    robots: { index: false, follow: false },
  };
}

export default async function CompanyPage(props: PageProps<"/c/[token]">) {
  const { token } = await props.params;
  const lang = await getUiLang();
  const data = await buildCompanyPage(getDb(), token);
  if (!data) return <ExpiredLink lang={lang} />;
  return <CompanyDigestView data={data} token={token} lang={lang} />;
}
