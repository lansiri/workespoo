"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AiTag, Button, Dialog, EmptyState, PersonHandle } from "@/components/we";
import { fmt } from "@/lib/i18n";
import { useMessages, useUiLang } from "@/lib/i18n/client";
import { formatWhen, meetErrorLine, rankedMessages } from "../messages-organiser";
import type { CompanyApplicant, CompanyApplicants } from "../rank";
import { CloseNote, EvidenceList, LevelStrip, LevelsBox, RatingsList } from "./RankedListView";
import "./ranked.css";

type M = (typeof rankedMessages)["en"];
type Job = CompanyApplicants["jobs"][number];

function AskToMeet({ token, applicant, jobTitle, m }: { token: string; applicant: CompanyApplicant; jobTitle: string; m: M }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/applicants/meet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, applicationId: applicant.applicationId }),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
        setError(meetErrorLine(m, body?.error?.code ?? null));
        setOpen(false);
      }
    } catch {
      setError(m.errGeneric);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button variant="primary" data-testid="ask-to-meet" onClick={() => setOpen(true)} disabled={busy}>
        {m.ask}
      </Button>
      <p className="we-rk-note" style={{ marginTop: 6 }}>
        {m.askNote}
      </p>
      {error ? (
        <p className="we-rk-problem" role="alert">
          {error}
        </p>
      ) : null}
      {open ? (
        <Dialog
          title={m.askConfirmTitle}
          onClose={() => setOpen(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {m.askCancel}
              </Button>
              <Button variant="primary" data-testid="ask-to-meet-send" onClick={() => void send()} disabled={busy}>
                {m.askSend}
              </Button>
            </>
          }
        >
          <p>{fmt(m.askConfirm, { job: jobTitle })}</p>
        </Dialog>
      ) : null}
    </div>
  );
}

function introLine(m: M, status: string): string | null {
  switch (status) {
    case "awaiting_talent":
    case "awaiting_company":
    case "pending_review":
      return m.waiting;
    case "accepted":
      return m.agreed;
    case "declined":
      return m.declined;
    case "expired":
      return m.expired;
    default:
      return m.closedNote;
  }
}

function ApplicantCard({ a, job, token, m, lang }: { a: CompanyApplicant; job: Job; token: string; m: M; lang: "en" | "fi" | "sv" }) {
  const line = a.intro ? introLine(m, a.intro.status) : null;
  return (
    <li className="we-rk-card" data-testid="company-applicant" data-position={a.position}>
      <div className="we-rk-head">
        <span className="we-rk-pos">{a.position}</span>
        <PersonHandle handle={a.handle} ariaLabel={fmt(m.handleAria, { handle: a.handle })} />
        <span className="we-rk-score">
          <LevelStrip ratings={a.ratings} requirements={job.requirements} lang={lang} label={m.stripLabel} />
          <span className="we-rk-points">{fmt(m.pointsOf, { n: a.points, m: a.maxPoints })}</span>
        </span>
      </div>
      {a.moved ? <p className="we-rk-note" style={{ marginTop: 8 }}>{m.movedByOrganiser}</p> : null}
      <CloseNote apart={a.closeToAbove} m={m} />
      <RatingsList ratings={a.ratings} requirements={job.requirements} m={m} lang={lang} testId="company-rating" aiNote={m.notAQuote} />
      <div className="we-rk-summary">
        <span className="we-rk-ai">
          <AiTag mini>{m.aiTag}</AiTag> {m.summaryLabel}
        </span>
        <p>{a.summary[lang]}</p>
      </div>
      {a.revealed ? (
        <section className="we-rk-reveal" aria-label={m.revealedTitle}>
          <h3>{m.revealedTitle}</h3>
          <p data-testid="revealed-name">
            {m.revealedName}: {a.revealed.displayName}
          </p>
          {a.revealed.contact ? (
            <p>
              {m.revealedContact}: {a.revealed.contact}
            </p>
          ) : null}
          <h3 style={{ marginTop: 10 }}>{m.revealedAnswers}</h3>
          <EvidenceList evidence={a.revealed.evidence} m={m} />
        </section>
      ) : (
        <div className="we-rk-actions" style={{ flexDirection: "column" }}>
          {line ? (
            <p className="we-rk-note" data-testid="intro-status" data-status={a.intro?.status}>
              {line}
            </p>
          ) : null}
          {a.canAsk ? <AskToMeet token={token} applicant={a} jobTitle={job.title} m={m} /> : null}
        </div>
      )}
    </li>
  );
}

/** The company's list of applicants: only what the organiser approved. Nothing before the first approval. */
export function CompanyApplicantsView({ data, token }: { data: CompanyApplicants; token: string }) {
  const m = useMessages(rankedMessages);
  const lang = useUiLang();
  const approved = data.jobs.filter((j) => j.approvedAt !== null);
  return (
    <div className="we-rk">
      <Button variant="ghost" href={`/c/${token}`} className="we-rk-back">
        {m.companyBack}
      </Button>
      <h1>{m.companyTitle}</h1>
      <p className="we-rk-lead">{m.companyIntro}</p>
      {approved.length === 0 ? (
        <EmptyState message={m.notApprovedYet} ghostShape="rows" testId="company-not-approved" />
      ) : (
        approved.map((j) => (
          <section key={j.jobId} aria-label={j.title} style={{ marginTop: 24 }}>
            <h2>{j.title}</h2>
            {j.approvedAt ? <p className="we-rk-sub">{fmt(m.approvedAt, { time: formatWhen(j.approvedAt, lang) })}</p> : null}
            <ul className="we-rk-reqs">
              {j.requirements.map((r) => (
                <li key={r.requirementId}>
                  <span className="we-rk-kind">{r.kind === "must" ? m.kindMust : m.kindNice}</span> {r.text}
                </li>
              ))}
            </ul>
            {j.applicants.length === 0 ? (
              <p className="we-rk-note" style={{ marginTop: 12 }}>
                {m.companyNoApplicants}
              </p>
            ) : (
              <ol className="we-rk-list" style={{ marginTop: 16 }}>
                {j.applicants.map((a) => (
                  <ApplicantCard key={a.applicationId} a={a} job={j} token={token} m={m} lang={lang} />
                ))}
              </ol>
            )}
          </section>
        ))
      )}
      <LevelsBox m={m} lang={lang} />
    </div>
  );
}
