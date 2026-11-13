import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { company, digest, needCard, pick } from "@/db/schema";
import { PasscodeForm } from "@/features/picks/PasscodeForm";
import { ResetDemo } from "@/features/picks/ResetDemo";
import { organiserCounts } from "@/features/picks/console";
import { consoleMessages } from "@/features/picks/console-messages";
import { organiserMessages } from "@/features/picks/messages";
import { helsinkiDate } from "@/features/picks/time";
import { fmt, pick as pickMessages } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function OrganiserPage() {
  const lang = await getUiLang();
  const m = pickMessages(organiserMessages, lang);
  const c = pickMessages(consoleMessages, lang);
  const session = await getSession();
  if (!session.organiser) {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold">{m.signInTitle}</h1>
        <PasscodeForm />
      </main>
    );
  }

  const db = getDb();
  const today = helsinkiDate(new Date());
  const companies = await db.select({ id: company.id }).from(company).where(eq(company.participating, true));
  const needs = companies.length
    ? await db.select({ id: needCard.id }).from(needCard).where(inArray(needCard.companyId, companies.map((x) => x.id)))
    : [];
  const digests = await db.select({ id: digest.id, status: digest.status }).from(digest).where(eq(digest.date, today));
  const counts = await organiserCounts(db);
  const picks = digests.length
    ? await db.select({ status: pick.status }).from(pick).where(inArray(pick.digestId, digests.map((d) => d.id)))
    : [];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{m.overviewTitle}</h1>
      <p>{m.prototype}</p>
      <p>{fmt(m.today, { date: today })}</p>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <dt>{m.overviewCompanies}</dt>
        <dd data-testid="overview-companies">{counts.companies}</dd>
        <dt>{c.overviewPool}</dt>
        <dd data-testid="overview-pool">{counts.poolPeople}</dd>
        <dt>{c.overviewWaiting}</dt>
        <dd data-testid="overview-waiting">{counts.digestsWaiting}</dd>
        <dt>{m.overviewNeeds}</dt>
        <dd>{needs.length}</dd>
        <dt>{m.overviewDigests}</dt>
        <dd>
          {m.overviewDraft}: {digests.filter((d) => d.status === "draft").length}, {m.overviewPublished}:{" "}
          {digests.filter((d) => d.status === "published").length}
        </dd>
        <dt>{m.overviewUndecided}</dt>
        <dd>{picks.filter((p) => p.status === "suggested").length}</dd>
      </dl>
      <nav className="flex flex-wrap gap-4" aria-label={c.overviewLinks}>
        <Link href="/organiser/review" data-testid="open-review">
          {m.openReview}
        </Link>
        <Link href="/organiser/audit" data-testid="open-audit">
          {c.navAudit}
        </Link>
        <Link href="/organiser/exposure" data-testid="open-exposure">
          {c.navExposure}
        </Link>
      </nav>
      <ResetDemo />
    </main>
  );
}
