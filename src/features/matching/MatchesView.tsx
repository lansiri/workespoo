"use client";

import Link from "next/link";
import { useState } from "react";
import type { IntroStatus } from "@/contracts";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/i18n";
import { useMessages, useUiLang } from "@/lib/i18n/client";
import { UI_LANG_LOCALES } from "@/lib/i18n/types";
import { matchesMessages } from "./messages";
import type { IntroNotApprovedCode, MatchItem, TalentIntro } from "./payload";
import { checkAnswer, respondToIntro, useMatches } from "./useMatches";

type M = (typeof matchesMessages)["en"];

const FOUND_KEYS = {
  direct: "foundDirect",
  occupation: "foundOccupation",
  text: "foundText",
  role: "foundRole",
} as const;

const REASON_KEYS: Record<IntroNotApprovedCode, keyof M> = {
  need_unrelated: "reasonNeedUnrelated",
  company_full: "reasonCompanyFull",
  other: "reasonOther",
};

const STATUS_KEYS: Record<IntroStatus, keyof M> = {
  pending_review: "statusPendingReview",
  awaiting_talent: "statusAwaitingTalent",
  awaiting_company: "statusAwaitingCompany",
  accepted: "statusAccepted",
  declined: "statusDeclined",
  withdrawn: "statusWithdrawn",
  not_approved: "statusNotApproved",
  expired: "statusExpired",
  cancelled: "statusCancelled",
};

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale);
}

function Reason({ reason, m }: { reason: MatchItem["reasons"][number]; m: M }) {
  const [open, setOpen] = useState(false);
  return (
    <li data-testid="match-reason" className="mb-3">
      <p>{reason.text}</p>
      {reason.rendering ? (
        <p>
          <strong>{m.fromCard}:</strong> {reason.rendering} <em>({m.renderingTag})</em>
        </p>
      ) : null}
      {reason.quote ? (
        <>
          <button type="button" className="underline" data-testid="see-own-words" onClick={() => setOpen(!open)}>
            {open ? m.hideWords : m.seeWords}
          </button>
          {open ? <blockquote data-testid="own-words" className="border-l-2 pl-3">{reason.quote}</blockquote> : null}
        </>
      ) : null}
      {reason.postingSentence ? (
        <p>
          <strong>{m.fromPosting}:</strong> {reason.postingSentence}
        </p>
      ) : null}
    </li>
  );
}

function JobCard({ item, m, locale }: { item: MatchItem; m: M; locale: string }) {
  return (
    <article data-testid="job-match" data-job-id={item.jobId} className="mb-6 border-b pb-4">
      <h2 className="text-lg font-semibold">{item.title}</h2>
      <p>
        {m.employer}: {item.employerName}
        {item.municipality ? ` · ${m.place}: ${item.municipality}` : ""}
        {item.closesAt ? ` · ${fmt(m.closes, { date: formatDate(item.closesAt, locale) })}` : ""}
      </p>
      <p>
        <a data-testid="job-link" href={item.url} target="_blank" rel="noopener noreferrer" className="underline">
          {m.openPosting}
        </a>
      </p>
      <p data-testid="source-attribution" className="text-sm">
        {item.attribution}
      </p>
      <p className="text-sm">
        {m.foundHeading}: {item.found.map((f) => m[FOUND_KEYS[f]]).join(", ")}
      </p>
      {item.reasons.length > 0 ? (
        <ul className="mt-2">
          {item.reasons.map((r) => (
            <Reason key={r.signalId + r.text} reason={r} m={m} />
          ))}
        </ul>
      ) : null}
      {item.notMentioned === null ? (
        <p data-testid="not-read" className="text-sm">
          {m.notRead}
        </p>
      ) : item.notMentioned.length > 0 ? (
        <p data-testid="not-mentioned">
          {m.notMentioned}:{" "}
          {item.notMentioned.map((n) => (n.statutory ? `${n.text} ${m.statutory}` : n.text)).join(" · ")}
        </p>
      ) : null}
    </article>
  );
}

function IntroRow({ intro, m, locale, onAnswered }: { intro: TalentIntro; m: M; locale: string; onAnswered: () => void }) {
  const [accepting, setAccepting] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(answer: Parameters<typeof respondToIntro>[1]) {
    setBusy(true);
    setError(null);
    const ok = await respondToIntro(intro.id, answer);
    setBusy(false);
    if (ok) onAnswered();
    else setError(m.answerFailed);
  }

  function confirmAccept() {
    const answer = { decision: "accept", displayName: name.trim(), contact: contact.trim() } as const;
    const problem = checkAnswer(answer);
    if (problem === "name") return setError(m.nameRequired);
    if (problem === "nameLong") return setError(m.nameTooLong);
    if (problem === "contact") return setError(contact.trim().length === 0 ? m.nameRequired : m.contactInvalid);
    void send(answer);
  }

  return (
    <li data-testid="intro-request" data-intro-id={intro.id} className="mb-4 border-b pb-3">
      <p>{fmt(m.introFrom, { company: intro.companyName })}</p>
      {intro.needTitle ? <p>{fmt(m.introAbout, { title: intro.needTitle })}</p> : null}
      <p className="text-sm">{fmt(m.introAsked, { date: formatDate(intro.requestedAt, locale) })}</p>
      <p data-testid="intro-status">
        {m.introStatusLabel}: {m[STATUS_KEYS[intro.status]]}
      </p>
      {intro.status === "not_approved" && intro.notApprovedReason ? (
        <p data-testid="intro-reason">{m[REASON_KEYS[intro.notApprovedReason]]}</p>
      ) : null}
      {intro.status === "awaiting_talent" && !accepting ? (
        <div className="mt-2 flex gap-2">
          <Button data-testid="intro-accept" disabled={busy} onClick={() => setAccepting(true)}>
            {m.accept}
          </Button>
          <Button data-testid="intro-decline" variant="outline" disabled={busy} onClick={() => void send({ decision: "decline" })}>
            {m.decline}
          </Button>
        </div>
      ) : null}
      {accepting ? (
        <form
          className="mt-2 grid max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            confirmAccept();
          }}
        >
          <p>{m.acceptHeading}</p>
          <label>
            {m.nameLabel}
            <input data-testid="intro-name" className="block w-full border p-1" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <label>
            {m.contactLabel}
            <input data-testid="intro-contact" className="block w-full border p-1" value={contact} onChange={(e) => setContact(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button type="submit" data-testid="intro-confirm" disabled={busy}>
              {busy ? m.sending : m.confirmAccept}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setAccepting(false)}>
              {m.cancel}
            </Button>
          </div>
        </form>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </li>
  );
}

/** The person's feed and introductions. Data loading is in `useMatches`. */
export function MatchesView() {
  const m = useMessages(matchesMessages);
  const locale = UI_LANG_LOCALES[useUiLang()];
  const { state, reload, gaveUp } = useMatches();

  if (state.status === "loading") return <p>{m.loading}</p>;
  if (state.status === "error") return <p role="alert">{m.loadFailed}</p>;
  if (state.status === "signed_out") {
    return (
      <p>
        {m.signIn} <Link href="/interview" className="underline">{m.signInLink}</Link>
      </p>
    );
  }
  const { matches, intros, refining } = state.data;
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">{m.title}</h1>
      <p className="mb-2">{m.intro}</p>
      {/* Always takes its line, so the postings below do not move when the wording is done. */}
      <p role="status" data-testid="refining" className="mb-4 min-h-5 text-sm">
        {refining && !gaveUp ? m.refining : ""}
      </p>
      {matches.length === 0 ? (
        <section data-testid="matches-empty" className="mb-8">
          <h2 className="font-semibold">{m.emptyTitle}</h2>
          <p>{m.emptyBody}</p>
          <p>
            <Link href="/card" className="underline">{m.editCard}</Link>
          </p>
        </section>
      ) : (
        matches.map((item) => <JobCard key={item.jobId} item={item} m={m} locale={locale} />)
      )}
      <section>
        <h2 className="mb-2 text-xl font-semibold">{m.introsHeading}</h2>
        {intros.length === 0 ? (
          <p>{m.introsEmpty}</p>
        ) : (
          <ul>
            {intros.map((i) => (
              <IntroRow key={i.id} intro={i} m={m} locale={locale} onAnswered={reload} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
