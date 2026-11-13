import Link from "next/link";
import type { UiLang } from "@/contracts";
import { introMessages } from "@/features/intros/messages";
import { fmt, pick as pickText } from "@/lib/i18n";
import { AskToMeetButton } from "./AskToMeetButton";
import type { CompanyPageData, CompanyPick } from "./company-view";
import { companyMessages } from "./messages";

const day = (iso: string | null): string => (iso ? iso.slice(0, 10) : "");

function IntroStatusLine({ pick, lang }: { pick: CompanyPick; lang: UiLang }) {
  const t = pickText(introMessages, lang);
  const i = pick.intro;
  if (!i) return null;
  const line: Record<string, string> = {
    awaiting_talent: fmt(t.awaitingTalent, { date: day(i.expiresAt) }),
    awaiting_company: fmt(t.awaitingCompany, { date: day(i.expiresAt) }),
    pending_review: t.pendingReview,
    accepted: t.accepted,
    declined: t.declined,
    withdrawn: t.withdrawn,
    expired: fmt(t.expired, { date: day(i.expiresAt) }),
    not_approved: t.notApproved,
    cancelled: t.cancelled,
  };
  return (
    <p data-testid="intro-status" data-status={i.status}>
      {line[i.status]}
    </p>
  );
}

function PickCard({ pick, token, needTitle, lang }: { pick: CompanyPick; token: string; needTitle: string; lang: UiLang }) {
  const m = pickText(companyMessages, lang);
  const quotesBySignal = new Map((pick.revealed?.signals ?? []).map((s) => [s.id, s.quotes]));
  return (
    <li data-testid="pick-card" data-pick-id={pick.id} className="flex flex-col gap-2 rounded border p-3">
      {pick.revealed ? (
        <div data-testid="revealed-block" className="flex flex-col gap-1">
          <h4 className="font-medium">{m.revealedTitle}</h4>
          <p>{m.revealedLabel}</p>
          <p>
            {m.revealedName}: <strong data-testid="revealed-name">{pick.revealed.name}</strong>
          </p>
          {pick.revealed.contact ? (
            <p>
              {m.revealedContact}: <span data-testid="revealed-contact">{pick.revealed.contact}</span>
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <strong>{pick.card.handle}</strong>
        {pick.card.synthetic ? <span>{m.synthetic}</span> : null}
      </div>
      <p>{pick.card.headline}</p>
      {pick.askedByPerson ? <p>{m.originTalent}</p> : null}

      <h4 className="font-medium">{m.reasonsTitle}</h4>
      <ul className="flex list-none flex-col gap-2 p-0">
        {pick.reasons.map((r) => (
          <li key={`${r.requirementText}-${r.signalId}`} data-testid="pick-reason">
            <p>{r.text}</p>
            {r.rendering ? (
              <p>
                {m.fromCard} {r.rendering}
              </p>
            ) : null}
            {r.postingSentence ? (
              <p>
                {m.fromPosting} {r.postingSentence}
              </p>
            ) : null}
            {(quotesBySignal.get(r.signalId) ?? []).map((q, i) => (
              <p key={i}>
                {m.inTheirWords} <q data-testid="revealed-quote">{q}</q> <small>({m.revealedLabel})</small>
              </p>
            ))}
          </li>
        ))}
      </ul>

      {pick.requirements.length > 0 ? (
        <ul className="flex list-none flex-wrap gap-2 p-0">
          {pick.requirements.map((r) => (
            <li key={r.id} data-mentioned={r.mentioned ? "true" : "false"}>
              {r.mentioned ? `[${m.chipMentioned}] ` : `${m.chipNotMentioned}: `}
              {r.text}
            </li>
          ))}
        </ul>
      ) : null}
      {pick.notMentioned.length > 0 ? (
        <p data-testid="pick-not-mentioned">
          {m.notMentioned} {pick.notMentioned.map((n) => (n.statutory ? `${n.text} ${m.statutory}` : n.text)).join(" · ")}.{" "}
          {m.notMentionedNote}
        </p>
      ) : null}

      <IntroStatusLine pick={pick} lang={lang} />
      {pick.canAsk ? <AskToMeetButton token={token} pickId={pick.id} needTitle={needTitle} /> : null}
    </li>
  );
}

/** The company's page, drawn from a payload built field by field in `company-view.ts`. */
export function CompanyDigestView(props: { data: CompanyPageData; token: string; lang: UiLang }) {
  const { data, token, lang } = props;
  const m = pickText(companyMessages, lang);
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div role="note" data-testid="masked-banner" className="rounded border p-3">
        <p>
          <strong>{fmt(m.bannerTitle, { company: data.company.displayName })}</strong> {m.bannerBody}
        </p>
        <p>{m.bannerPrototype}</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{m.yourNeeds}</h2>
        <p>{m.needExplain}</p>
        <ul className="flex list-none flex-col gap-3 p-0">
          {data.needs.map((n) => (
            <li key={n.id} className="flex flex-col gap-1">
              <h3 className="font-medium">{n.title}</h3>
              <p>{n.summary}</p>
              <p>
                {m.needDraftedNote} {n.status === "confirmed" ? m.needStatusConfirmed : m.needStatusDraft}
              </p>
              <Link href={`/c/${token}/need/${n.id}`} data-testid="need-link">
                {m.needOpen}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        {data.digest ? (
          <>
            <h2 className="text-xl font-semibold">{fmt(m.picksTitle, { date: data.digest.date })}</h2>
            <p>{m.picksIntro}</p>
            {data.digest.groups.map((g) => (
              <div key={g.needCardId} className="flex flex-col gap-2">
                <h3 className="font-medium">{g.title}</h3>
                {g.nobodyRelates ? <p>{fmt(m.nobodyRelates, { need: g.title })}</p> : null}
                {!g.nobodyRelates && g.picks.length === 0 ? <p>{fmt(m.noApproved, { need: g.title })}</p> : null}
                <ul className="flex list-none flex-col gap-3 p-0">
                  {g.picks.map((p) => (
                    <PickCard key={p.id} pick={p} token={token} needTitle={g.title} lang={lang} />
                  ))}
                </ul>
              </div>
            ))}
          </>
        ) : (
          <p data-testid="not-published">{m.notPublished}</p>
        )}
      </section>
    </main>
  );
}

export function ExpiredLink({ lang }: { lang: UiLang }) {
  const m = pickText(companyMessages, lang);
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-2 p-6" data-testid="link-expired">
      <h1 className="text-xl font-semibold">{m.expiredTitle}</h1>
      <p>{m.expiredBody}</p>
    </main>
  );
}
