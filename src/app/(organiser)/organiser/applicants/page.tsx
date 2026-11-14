import { getDb } from "@/db/client";
import { ApplicantsOverview } from "@/features/application/ui/ApplicantsOverview";
import { listJobsWithApplicants } from "@/features/application";
import { SignInCard } from "@/features/picks/SignInCard";
import { organiserMessages } from "@/features/picks/messages";
import { pick } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function OrganiserApplicantsPage() {
  const lang = await getUiLang();
  const o = pick(organiserMessages, lang);
  const session = await getSession();
  if (!session.organiser) return <SignInCard title={o.signInTitle} badge={o.signInBadge} />;
  const jobs = await listJobsWithApplicants(getDb());
  return <ApplicantsOverview jobs={jobs} lang={lang} />;
}
