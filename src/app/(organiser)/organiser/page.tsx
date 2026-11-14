import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { company, digest, intro, job, needCard, pick } from "@/db/schema";
import { Button, EmptyState, SeededDemoBanner } from "@/components/we";
import { SignInCard } from "@/features/picks/SignInCard";
import { ResetDemo } from "@/features/picks/ResetDemo";
import { organiserCounts } from "@/features/picks/console";
import { consoleMessages } from "@/features/picks/console-messages";
import { organiserMessages } from "@/features/picks/messages";
import { hasSeededHistory } from "@/features/picks/seeded";
import { helsinkiDate } from "@/features/picks/time";
import { fmt, pick as pickMessages, UI_LANG_LOCALES } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import { maskEmployer } from "@/lib/mask";
import { getSession } from "@/lib/session";
import { NeedCard } from "@/contracts";

export const dynamic = "force-dynamic";

const OPEN_INTRO = new Set(["pending_review", "awaiting_talent", "awaiting_company"]);

export default async function OrganiserPage() {
  const lang = await getUiLang();
  const m = pickMessages(organiserMessages, lang);
  const c = pickMessages(consoleMessages, lang);
  const session = await getSession();
  if (!session.organiser) return <SignInCard title={m.signInTitle} badge={m.signInBadge} />;

  const db = getDb();
  const today = helsinkiDate(new Date());
  const companies = await db
    .select({ id: company.id, name: company.displayName })
    .from(company)
    .where(eq(company.participating, true));
  const companyIds = companies.map((x) => x.id);
  const needRows = companyIds.length
    ? await db.select().from(needCard).where(inArray(needCard.companyId, companyIds))
    : [];
  const jobRows = needRows.length
    ? await db
        .select({ id: job.id, employerName: job.employerName })
        .from(job)
        .where(
          inArray(
            job.id,
            needRows.map((n) => n.jobId),
          ),
        )
    : [];
  const employer = new Map(jobRows.map((j) => [j.id, j.employerName]));
  const digests = companyIds.length
    ? await db
        .select({ id: digest.id, companyId: digest.companyId, status: digest.status })
        .from(digest)
        .where(and(eq(digest.date, today), inArray(digest.companyId, companyIds)))
    : [];
  const picks = digests.length
    ? await db
        .select({ digestId: pick.digestId, status: pick.status })
        .from(pick)
        .where(
          inArray(
            pick.digestId,
            digests.map((d) => d.id),
          ),
        )
    : [];
  const intros = companyIds.length
    ? await db
        .select({ companyId: intro.companyId, status: intro.status })
        .from(intro)
        .where(inArray(intro.companyId, companyIds))
    : [];
  const counts = await organiserCounts(db);
  const seeded = await hasSeededHistory(db);
  const undecided = picks.filter((p) => p.status === "suggested").length;

  const rows = companies
    .map((co) => {
      const needs = needRows
        .filter((n) => n.companyId === co.id)
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      const first = needs[0];
      const parsed = first ? NeedCard.safeParse(first.body) : null;
      const questions = needs.flatMap((n) => {
        const p = NeedCard.safeParse(n.body);
        return p.success ? p.data.requirements.filter((r) => r.question) : [];
      });
      const d = digests.find((x) => x.companyId === co.id);
      const open = d
        ? picks.filter((p) => p.digestId === d.id && p.status === "suggested").length
        : 0;
      const total = d ? picks.filter((p) => p.digestId === d.id).length : 0;
      const mine = intros.filter((i) => i.companyId === co.id);
      const employerName = first ? employer.get(first.jobId) : undefined;
      const mask = (t: string) => (employerName ? maskEmployer(t, employerName) : t);
      return {
        id: co.id,
        name: co.name,
        posting: parsed?.success ? mask(parsed.data.title) : null,
        needStatus: first ? first.status : null,
        questions: { a: questions.filter((r) => r.question?.answer).length, q: questions.length },
        digest: d
          ? d.status === "published"
            ? c.ovDigestPublished
            : total === 0
              ? c.ovDigestNobody
              : open > 0
                ? fmt(c.ovDigestWaiting, { n: open })
                : c.ovDigestDecided
          : c.ovDigestNone,
        digestOk: d?.status === "published",
        intros: {
          open: mine.filter((i) => OPEN_INTRO.has(i.status)).length,
          accepted: mine.filter((i) => i.status === "accepted").length,
        },
      };
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const needLabel = {
    draft: c.ovNeedDraft,
    confirmed: c.ovNeedConfirmed,
    stale: c.ovNeedStale,
  } as const;
  const dateText = new Intl.DateTimeFormat(UI_LANG_LOCALES[lang], {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${today}T12:00:00Z`));

  return (
    <div className="we-con">
      <div className="we-con-head">
        <div>
          <h1>{m.overviewTitle}</h1>
          <p>{fmt(m.today, { date: dateText })}</p>
        </div>
        <div>
          <Button variant="primary" href="/organiser/review" icon="arrow" data-testid="open-review">
            {m.openReview}
          </Button>
          <p className="we-panel-note" style={{ marginTop: 6, textAlign: "right" }}>
            {fmt(c.ovWaitingPicks, { n: undecided })}
          </p>
        </div>
      </div>
      {seeded ? <SeededDemoBanner>{c.seededHistory}</SeededDemoBanner> : null}

      <section className="we-panel" data-testid="overview-companies" aria-labelledby="ov-companies">
        <h2 id="ov-companies">
          {c.ovCompanies} <span className="we-panel-note">({counts.companies})</span>
        </h2>
        {rows.length === 0 ? (
          <EmptyState ghostShape="rows" message={c.ovEmpty} />
        ) : (
          <div className="we-table-wrap">
            <table className="we-table we-stack">
              <thead>
                <tr>
                  <th scope="col">{c.ovColCompany}</th>
                  <th scope="col">{c.ovColPosting}</th>
                  <th scope="col">{c.ovColNeed}</th>
                  <th scope="col">{c.ovColQuestions}</th>
                  <th scope="col">{c.ovColDigest}</th>
                  <th scope="col">{c.ovColIntros}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label={c.ovColCompany}>
                      <b>{r.name}</b>
                    </td>
                    <td data-label={c.ovColPosting}>{r.posting ?? "–"}</td>
                    <td data-label={c.ovColNeed}>
                      <span
                        className={`we-status ${r.needStatus === "confirmed" ? "we-ok" : r.needStatus ? "" : "we-none"}`}
                      >
                        {r.needStatus ? needLabel[r.needStatus] : c.ovNeedNone}
                      </span>
                    </td>
                    <td data-label={c.ovColQuestions}>
                      {r.questions.q === 0
                        ? c.ovQuestionsNone
                        : fmt(c.ovQuestionsOf, { a: r.questions.a, q: r.questions.q })}
                    </td>
                    <td data-label={c.ovColDigest}>
                      <span
                        className={`we-status ${r.digestOk ? "we-ok" : r.digest === c.ovDigestNone || r.digest === c.ovDigestNobody ? "we-none" : ""}`}
                      >
                        {r.digest}
                      </span>
                    </td>
                    <td data-label={c.ovColIntros}>{fmt(c.ovIntros, r.intros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="we-ov-side">
        <section className="we-panel" aria-labelledby="ov-people">
          <h2 id="ov-people">{c.ovPeople}</h2>
          <dl className="we-counts">
            <dt>{c.overviewPool}</dt>
            <dd data-testid="overview-pool">{counts.poolPeople}</dd>
            <dt>{c.overviewWaiting}</dt>
            <dd data-testid="overview-waiting">{counts.digestsWaiting}</dd>
          </dl>
        </section>
        <nav className="we-panel" aria-label={c.overviewLinks}>
          <h2>{c.overviewLinks}</h2>
          <div className="we-table-act">
            <Button variant="ghost" href="/organiser/audit" data-testid="open-audit">
              {c.navAudit}
            </Button>
            <Button variant="ghost" href="/organiser/exposure" data-testid="open-exposure">
              {c.navExposure}
            </Button>
          </div>
        </nav>
        <ResetDemo />
      </div>
    </div>
  );
}
