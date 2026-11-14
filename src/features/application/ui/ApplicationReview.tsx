"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/we";
import { fmt } from "@/lib/i18n";
import { useMessages } from "@/lib/i18n/client";
import type { ApplicationTurn } from "@/contracts";
import type { OwnApplication } from "../engine";
import { applyMessages } from "../messages-talent";
import { ApplicationResult, WithdrawApplication } from "./ApplicationResult";
import "./apply.css";

/** The answers of the person that still stand: not removed and not empty. */
export function standingAnswers(turns: readonly ApplicationTurn[]): ApplicationTurn[] {
  return turns.filter((t) => t.role === "participant" && t.removedAt === null && t.text.trim() !== "");
}

export type ReviewEntry = { kind: "question"; text: string } | { kind: "answer"; turn: ApplicationTurn };

/**
 * What one requirement shows in the review: the planned question, then in order any follow-up
 * question and the person's answers to this requirement. Text comes from the plan and the stored turns.
 */
export function reviewEntries(application: Pick<OwnApplication, "plan" | "turns">, requirementId: string): ReviewEntry[] {
  const req = application.plan.requirements.find((r) => r.requirementId === requirementId);
  const entries: ReviewEntry[] = req ? [{ kind: "question", text: req.question }] : [];
  for (const t of application.turns) {
    if (t.requirementId !== requirementId) continue;
    if (t.role === "interviewer" && t.kind === "follow_up" && t.text.trim() !== "") entries.push({ kind: "question", text: t.text });
    if (t.role === "participant" && t.removedAt === null && t.text.trim() !== "") entries.push({ kind: "answer", turn: t });
  }
  return entries;
}

/**
 * The review: per requirement the question or questions and the person's own answers, with
 * "Remove this answer", and "Send my application" once there is at least one answer. Nothing
 * has been sent, and no level exists yet.
 */
export function ApplicationReview({ application }: { application: OwnApplication }) {
  const m = useMessages(applyMessages);
  const router = useRouter();
  const [turns, setTurns] = useState<ApplicationTurn[]>(application.turns);
  const [removing, setRemoving] = useState<number | null>(null);
  const [removeFailed, setRemoveFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const view = { plan: application.plan, turns };
  const answerCount = standingAnswers(turns).length;

  async function remove(turnIndex: number) {
    setRemoving(turnIndex);
    setRemoveFailed(false);
    try {
      const res = await fetch(`/api/application/${application.id}/remove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turnIndex }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setTurns((all) => all.map((t) => (t.index === turnIndex ? { ...t, text: "", sentences: [], removedAt: new Date().toISOString() } : t)));
    } catch {
      setRemoveFailed(true);
    }
    setRemoving(null);
  }

  async function send() {
    if (answerCount === 0) return;
    setSending(true);
    setSendFailed(false);
    try {
      const res = await fetch(`/api/application/${application.id}/submit`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setSendFailed(true);
      setSending(false);
    }
  }

  return (
    <div className="we-ap-page" data-testid="apply-review">
      <div className="we-ap-page-head">
        <h1>{m.reviewTitle}</h1>
        <p>{fmt(m.reviewJob, { title: application.title, company: application.companyName })}</p>
        <p>{m.reviewIntro}</p>
      </div>

      <ol className="we-ap-list">
        {application.plan.requirements.map((req) => {
          const entries = reviewEntries(view, req.requirementId);
          const hasAnswer = entries.some((e) => e.kind === "answer");
          return (
            <li key={req.requirementId} className="we-ap-item" data-requirement-id={req.requirementId}>
              <h2>{req.text}</h2>
              {entries.map((e, i) =>
                e.kind === "question" ? (
                  <div key={`q${i}`}>
                    <span className="we-ap-label">{m.reviewQuestion}</span>
                    <p className="we-ap-question">{e.text}</p>
                  </div>
                ) : (
                  <div key={`a${e.turn.index}`} className="we-ap-answer" data-testid="apply-answer" data-turn-index={e.turn.index}>
                    <span className="we-ap-label">{m.reviewAnswer}</span>
                    <p>{e.turn.text}</p>
                    <Button
                      variant="quiet"
                      data-testid="apply-remove-answer"
                      disabled={removing === e.turn.index}
                      onClick={() => void remove(e.turn.index)}
                    >
                      {removing === e.turn.index ? m.reviewRemoving : m.reviewRemove}
                    </Button>
                  </div>
                ),
              )}
              {!hasAnswer ? <p className="we-ap-none">{application.state.progress[req.requirementId] === "skipped" ? m.reviewSkipped : m.reviewNoAnswer}</p> : null}
            </li>
          );
        })}
      </ol>

      {removeFailed ? (
        <p className="we-inline-error" role="alert" data-testid="apply-remove-failed">
          {m.reviewRemoveFailed}
        </p>
      ) : null}

      <div className="we-ap-actions">
        <Button variant="primary" size="lg" data-testid="apply-send" disabled={answerCount === 0 || sending} onClick={() => void send()}>
          {sending ? m.reviewSending : m.reviewSend}
        </Button>
        {answerCount === 0 ? <p className="we-start-reason">{m.reviewNeedAnswer}</p> : null}
        {sendFailed ? (
          <p className="we-inline-error" role="alert" data-testid="apply-send-failed">
            {m.reviewSendFailed}
          </p>
        ) : null}
        <p className="we-ap-fine">{m.reviewAfter}</p>
      </div>
    </div>
  );
}

/** How often the page asks whether the rating is ready. */
export const POLL_MS = 2000;
/** A rating takes about 20 seconds. After this long the page says that it is slow, and that nothing is lost. */
export const SLOW_AFTER_MS = 60_000;

/** The person's own application as the API gives it, or null when it could not be read. */
export async function fetchOwnApplication(id: string, signal?: AbortSignal): Promise<OwnApplication | null> {
  try {
    const res = await fetch(`/api/application/${id}`, { cache: "no-store", signal });
    if (!res.ok) return null;
    const body = (await res.json()) as OwnApplication | { application: OwnApplication };
    return "application" in body ? body.application : body;
  } catch {
    return null;
  }
}

/**
 * After sending: says it was sent and that the rating is on its way, and asks every two seconds
 * until the rating is there, then shows the result.
 */
export function ApplicationSent({ application }: { application: OwnApplication }) {
  const m = useMessages(applyMessages);
  const [current, setCurrent] = useState<OwnApplication>(application);
  const assessed = current.status === "assessed" && current.assessment !== null;
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (assessed) return;
    const id = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [assessed]);

  useEffect(() => {
    if (assessed) return;
    const abort = new AbortController();
    const id = window.setInterval(() => {
      void fetchOwnApplication(application.id, abort.signal).then((next) => {
        if (next && !abort.signal.aborted) setCurrent(next);
      });
    }, POLL_MS);
    return () => {
      abort.abort();
      window.clearInterval(id);
    };
  }, [application.id, assessed]);

  if (assessed) return <ApplicationResult application={current} />;
  return (
    <div className="we-ap-page" data-testid="apply-sent">
      <div className="we-ap-page-head">
        <h1>{m.sentTitle}</h1>
        <p>{fmt(m.reviewJob, { title: application.title, company: application.companyName })}</p>
        <p>{m.sentBody}</p>
      </div>
      <p className="we-ap-working" role="status">
        {m.sentWorking}
      </p>
      {slow ? (
        <p className="we-ap-fine" style={{ marginTop: 10 }} data-testid="apply-sent-slow">
          {m.sentSlow}
        </p>
      ) : null}
      <p className="we-ap-fine" style={{ marginTop: 16 }}>
        {m.resultOrganiser}
      </p>
      <WithdrawApplication applicationId={application.id} />
    </div>
  );
}
