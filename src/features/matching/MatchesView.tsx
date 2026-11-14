"use client";

import { useState } from "react";
import type { IntroStatus } from "@/contracts";
import {
  Button,
  EmptyState,
  ErrorState,
  JobPostingCard,
  LoadingState,
  NotMentionedList,
  ReasonLine,
  ReasonList,
  type IntroRequestProps,
  IntroRequest,
} from "@/components/we";
import { coreCopy } from "@/lib/i18n/content";
import { fmt } from "@/lib/i18n";
import { useMessages, useUiLang } from "@/lib/i18n/client";
import { UI_LANG_LOCALES } from "@/lib/i18n/types";
import { matchesFixedMessages, matchesMessages } from "./messages";
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

const KIT_STATUS: Record<IntroStatus, IntroRequestProps["status"]> = {
  awaiting_talent: "pending",
  accepted: "accepted",
  declined: "declined",
  expired: "expired",
  pending_review: "waiting",
  awaiting_company: "waiting",
  withdrawn: "closed",
  cancelled: "closed",
  not_approved: "closed",
};

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

function JobCard({ item, m, locale }: { item: MatchItem; m: M; locale: string }) {
  const fixed = useMessages(matchesFixedMessages);
  const found = item.found.map((f) => m[FOUND_KEYS[f]]).join(", ");
  const reasonText = {
    cardLabel: m.fromCard,
    postingLabel: m.fromPosting,
    mentions: "{label}",
    seeOwnWords: m.seeWords,
    hideOwnWords: m.hideWords,
    yourWords: m.yourWords,
  };
  return (
    <JobPostingCard
      jobId={item.jobId}
      title={item.title}
      employer={item.employerName}
      place={item.municipality}
      closes={item.closesAt ? fmt(m.closes, { date: formatDate(item.closesAt, locale) }) : undefined}
      url={item.url}
      source={item.attribution}
      openLabel={m.openPosting}
      reasons={
        item.reasons.length > 0 ? (
          <ReasonList variant="feed">
            {item.reasons.map((r, i) => (
              <ReasonLine
                // Index, not text: the wording may be refined in place without remounting the row.
                key={`${r.signalId}-${i}`}
                variant="feed"
                // The note as it stands on the person's own card. Model-written sentences (English
                // only) stay out of the feed; the person's own words are the evidence.
                cardText={r.phrase ?? ""}
                cardKind="phrase"
                postingSentence={r.postingSentence}
                postingFallback={`${m.foundHeading}: ${found}`}
                ownWords={r.quote ? { text: r.quote } : undefined}
                text={reasonText}
              />
            ))}
          </ReasonList>
        ) : undefined
      }
      notMentioned={
        <NotMentionedList
          audience="person"
          items={item.notMentioned}
          text={{
            label: m.notMentioned,
            statutory: m.statutory,
            fine: fixed.notMentionedFine,
            suffix: m.notMentionedSuffix,
            notRead: m.notRead,
          }}
        />
      }
    />
  );
}

function IntroItem({ intro, m, locale, onAnswered }: { intro: TalentIntro; m: M; locale: string; onAnswered: () => void }) {
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

  function accept(v: { displayName: string; contact: string }) {
    const answer = { decision: "accept", displayName: v.displayName.trim(), contact: v.contact.trim() } as const;
    const problem = checkAnswer(answer);
    if (problem === "name") return setError(m.nameRequired);
    if (problem === "nameLong") return setError(m.nameTooLong);
    if (problem === "contact") return setError(answer.contact.length === 0 ? m.nameRequired : m.contactInvalid);
    void send(answer);
  }

  const status = KIT_STATUS[intro.status];
  const waitsForPerson = status === "pending" || status === "waiting";
  const expires = intro.expiresAt ? formatDate(intro.expiresAt, locale) : null;
  const waitingLabel = intro.status === "pending_review" ? m.statusPendingReview : intro.status === "awaiting_company" ? m.statusAwaitingCompany : m.statusAwaitingTalent;
  return (
    <li>
      <IntroRequest
        introId={intro.id}
        status={status}
        heading={intro.needTitle ? fmt(m.introHeading, { company: intro.companyName, title: intro.needTitle }) : fmt(m.introFrom, { company: intro.companyName })}
        lead={waitsForPerson ? m.nameHidden : ""}
        acceptedNote={fmt(m.acceptedNote, { company: intro.companyName })}
        busy={busy}
        error={error ?? undefined}
        statusNote={
          intro.status === "not_approved" && intro.notApprovedReason
            ? { text: m[REASON_KEYS[intro.notApprovedReason]], testId: "intro-reason" }
            : undefined
        }
        onAccept={accept}
        onDecline={() => void send({ decision: "decline" })}
        text={{
          sticker: m.introSticker,
          whyTitle: "",
          waiting: expires ? fmt(m.waitingBy, { date: expires }) : m.waitingFor,
          accept: m.accept,
          decline: m.decline,
          nameLabel: m.nameLabel,
          nameHelp: fmt(m.nameHelp, { company: intro.companyName }),
          contactLabel: m.contactLabel,
          contactHelp: m.contactHelp,
          share: m.confirmAccept,
          sending: m.sending,
          cancel: m.cancel,
          accepted: m.statusAccepted,
          openAgenda: "",
          declined: m.declinedNote,
          expired: expires ? fmt(m.expiredNote, { date: expires }) : m.expiredNoDate,
          waitingOrganiser: waitingLabel,
          closed: m[STATUS_KEYS[intro.status]],
        }}
      />
    </li>
  );
}

/** The person's feed and introductions. Data loading is in `useMatches`. */
export function MatchesView() {
  const m = useMessages(matchesMessages);
  const core = useMessages(coreCopy);
  const locale = UI_LANG_LOCALES[useUiLang()];
  const { state, reload, gaveUp } = useMatches();

  const head = (
    <div className="we-page-head">
      <h1>{m.title}</h1>
      <p>{m.intro}</p>
    </div>
  );

  if (state.status === "loading") {
    return (
      <div className="we-page">
        {head}
        <LoadingState message={m.loading} badgeLabel={m.loadingBadge} />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="we-page">
        {head}
        <ErrorState message={m.loadFailed} action={{ label: core.tryAgain, onClick: reload }} />
      </div>
    );
  }
  if (state.status === "signed_out") {
    return (
      <div className="we-page">
        {head}
        <EmptyState message={m.signIn} />
        <p style={{ marginTop: 16 }}>
          <Button variant="primary" href="/interview">
            {m.signInLink}
          </Button>
        </p>
      </div>
    );
  }
  const { matches, intros, refining } = state.data;
  return (
    <div className="we-page">
      {head}
      <div className="we-two-col">
        <div>
          {intros.length > 0 ? (
            <ul className="we-feed we-intro-list" aria-label={m.introSticker}>
              {intros.map((i) => (
                <IntroItem key={i.id} intro={i} m={m} locale={locale} onAnswered={reload} />
              ))}
            </ul>
          ) : null}
          <div className="we-section-head">
            <h2>{m.feedHeading}</h2>
            {matches.length > 0 ? <p>{fmt(m.feedCount, { n: matches.length })}</p> : null}
          </div>
          {/* Always takes its line, so the postings below do not move when the wording is done. */}
          <p role="status" data-testid="refining" className="we-refining">
            {refining && !gaveUp ? m.refining : ""}
          </p>
          {matches.length === 0 ? (
            <div data-testid="matches-empty">
              <EmptyState message={m.emptyBody} ghostShape="rows" />
              <p style={{ marginTop: 16 }}>
                <Button variant="ghost" href="/card">
                  {m.editCard}
                </Button>
              </p>
            </div>
          ) : (
            <ul className="we-feed">
              {matches.map((item) => (
                <li key={item.jobId}>
                  <JobCard item={item} m={m} locale={locale} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <aside className="we-rail">
          <section className="we-box">
            <h3>{m.railCardTitle}</h3>
            <p>{m.railCardBody}</p>
            <Button variant="ghost" href="/card">
              {m.editCard}
            </Button>
          </section>
          <section className="we-box">
            <h3>{m.railHowTitle}</h3>
            <p>{m.railHowBody}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
