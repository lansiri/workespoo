import { SignInCard } from "@/features/picks/SignInCard";
import { ReviewQueue } from "@/features/picks/ReviewQueue";
import { organiserMessages } from "@/features/picks/messages";
import { pick } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const m = pick(organiserMessages, await getUiLang());
  const session = await getSession();
  if (!session.organiser) return <SignInCard title={m.signInTitle} badge={m.signInBadge} />;
  return <ReviewQueue />;
}
