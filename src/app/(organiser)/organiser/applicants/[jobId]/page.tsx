import { RankedListView } from "@/features/application/ui/RankedListView";
import { SignInCard } from "@/features/picks/SignInCard";
import { organiserMessages } from "@/features/picks/messages";
import { pick } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function OrganiserRankedListPage(props: PageProps<"/organiser/applicants/[jobId]">) {
  const { jobId } = await props.params;
  const lang = await getUiLang();
  const o = pick(organiserMessages, lang);
  const session = await getSession();
  if (!session.organiser) return <SignInCard title={o.signInTitle} badge={o.signInBadge} />;
  return <RankedListView jobId={jobId} />;
}
