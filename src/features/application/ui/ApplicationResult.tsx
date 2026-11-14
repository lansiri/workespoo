"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AiTag, Button, Dialog, OwnWordsMark, Tag } from "@/components/we";
import { fmt } from "@/lib/i18n";
import { useMessages, useUiLang } from "@/lib/i18n/client";
import { renderEvidence } from "@/lib/sentences";
import type { ApplicationTurn, EvidenceRef, RatingLevel, UiLang } from "@/contracts";
import type { OwnApplication } from "../engine";
import { LEVEL_ANCHORS_OWN, LEVEL_NAMES } from "../levels";
import { applyMessages } from "../messages-talent";
import "./apply.css";

/**
 * The person's own sentences a level rests on, rendered from the stored turns by reference. A
 * reference that does not resolve (the answer was removed, or the sentence is not there) is
 * dropped: nothing a model wrote is ever shown as the person's words.
 */
export function ownSentences(turns: readonly ApplicationTurn[], evidence: readonly EvidenceRef[]): Array<{ turnIndex: number; sentence: number; text: string }> {
  const out: Array<{ turnIndex: number; sentence: number; text: string }> = [];
  for (const ref of evidence) {
    const turn = turns.find((t) => t.index === ref.turnIndex);
    if (!turn || turn.role !== "participant" || turn.removedAt !== null) continue;
    const text = renderEvidence(turn.sentences, ref.sentenceFrom, ref.sentenceTo);
    if (text === null) continue;
    out.push({ turnIndex: ref.turnIndex, sentence: ref.sentenceFrom - 1, text });
  }
  return out;
}

/** The level's name and anchor, in the page's language, as said to the person whose result it is. */
export function levelText(level: RatingLevel, lang: UiLang): { name: string; anchor: string } {
  const at = Math.max(0, Math.min(3, level));
  return { name: LEVEL_NAMES[lang][at], anchor: LEVEL_ANCHORS_OWN[lang][at] };
}

/**
 * The cited sentences of one answer, put together again: a long sentence is stored in pieces,
 * and pieces that follow each other read as the one sentence the person said.
 */
export function ownPassages(own: ReadonlyArray<{ turnIndex: number; sentence: number; text: string }>): Array<Array<{ turnIndex: number; sentence: number; text: string }>> {
  const passages: Array<Array<{ turnIndex: number; sentence: number; text: string }>> = [];
  for (const s of own) {
    const last = passages[passages.length - 1];
    if (last && last[0]!.turnIndex === s.turnIndex) last.push(s);
    else passages.push([s]);
  }
  return passages;
}

/** "Withdraw my application", with a question first. Deletes the application and goes back to the jobs. */
export function WithdrawApplication({ applicationId }: { applicationId: string }) {
  const m = useMessages(applyMessages);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function withdraw() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/application/${applicationId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      router.push("/apply");
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div className="we-ap-withdraw">
      <Button variant="danger" data-testid="apply-withdraw" onClick={() => setOpen(true)}>
        {m.withdraw}
      </Button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <Dialog
              title={m.withdrawTitle}
              testId="apply-withdraw-dialog"
              onClose={() => setOpen(false)}
              initialFocus="[data-keep]"
              actions={
                <>
                  <Button data-keep="" onClick={() => setOpen(false)}>
                    {m.withdrawKeep}
                  </Button>
                  <Button variant="danger" data-testid="apply-withdraw-confirm" disabled={busy} onClick={() => void withdraw()}>
                    {m.withdrawConfirm}
                  </Button>
                </>
              }
            >
              <p>{m.withdrawBody}</p>
              {failed ? (
                <p className="we-inline-error" role="alert">
                  {m.withdrawFailed}
                </p>
              ) : null}
            </Dialog>,
            document.body,
          )
        : null}
    </div>
  );
}

/**
 * The person's own result: per requirement the level, the reason (marked as written by AI) and
 * their own sentences it rests on; their points; and where they stand once an organiser has
 * approved a list. This is the only screen that shows a level.
 */
export function ApplicationResult({ application }: { application: OwnApplication }) {
  const m = useMessages(applyMessages);
  const lang = useUiLang();
  const assessment = application.assessment;
  return (
    <div className="we-ap-page" data-testid="apply-result">
      <div className="we-ap-page-head">
        <h1>{fmt(m.resultTitle, { title: application.title })}</h1>
        <p>{fmt(m.reviewJob, { title: application.title, company: application.companyName })}</p>
      </div>

      {assessment ? (
        <section className="we-ap-summary" aria-label={m.resultSummary}>
          <span className="we-ap-label">
            {m.resultSummary} <AiTag mini>{m.resultAi}</AiTag>
          </span>
          <p>{assessment.summary[lang]}</p>
        </section>
      ) : null}

      <div className="we-ap-facts">
        {application.points ? (
          <span data-testid="apply-points">{fmt(m.resultPoints, { n: application.points.points, m: application.points.maxPoints })}</span>
        ) : null}
        <span data-testid="apply-organiser-note">{m.resultOrganiser}</span>
        {application.position ? (
          <span data-testid="apply-position">{fmt(m.resultPosition, { n: application.position.position, m: application.position.of })}</span>
        ) : null}
        {application.position?.levelWith ? (
          <span className="we-ap-fine" data-testid="apply-level-with">
            {application.position.levelWith === "both" ? m.resultLevelBoth : application.position.levelWith === "above" ? m.resultLevelAbove : m.resultLevelBelow}
          </span>
        ) : null}
      </div>

      <p className="we-ap-fine" style={{ marginTop: 20 }}>
        {m.resultLegend}
      </p>

      <ul className="we-ap-list" aria-label={m.resultRatingsTitle}>
        {application.plan.requirements.map((req) => {
          const rating = assessment?.ratings.find((r) => r.requirementId === req.requirementId);
          if (!rating) return null;
          const { name, anchor } = levelText(rating.level, lang);
          const own = ownSentences(application.turns, rating.evidence);
          return (
            <li key={req.requirementId} className="we-ap-rating" data-testid="apply-rating" data-requirement-id={req.requirementId} data-level={rating.level}>
              <h3>{req.text}</h3>
              <div className="we-ap-item-meta">
                <Tag>{req.kind === "must" ? m.resultTagMust : m.resultTagNice}</Tag>
              </div>
              <div className="we-ap-level" data-level={rating.level}>
                <b>
                  {m.resultLevel}: {name}
                </b>
                <span>{anchor}</span>
              </div>
              <div className="we-ap-reason">
                <div className="we-ap-reason-head">
                  <span className="we-ap-label">{m.resultWhy}</span>
                  <AiTag mini>{m.resultAi}</AiTag>
                  <span className="we-ap-fine">{m.resultWrittenByAi}</span>
                </div>
                <p>{rating.reason[lang]}</p>
              </div>
              {rating.level > 0 ? (
                <div className="we-ap-own">
                  <span className="we-ap-label">{m.resultOwnWords}</span>
                  {own.length > 0 ? (
                    ownPassages(own).map((passage, p) => (
                      <blockquote key={`${passage[0]!.turnIndex}-${p}`}>
                        {passage.map((s, i) => (
                          <span key={`${s.sentence}-${i}`}>
                            <OwnWordsMark turn={s.turnIndex} sentence={s.sentence}>
                              {s.text}
                            </OwnWordsMark>{" "}
                          </span>
                        ))}
                      </blockquote>
                    ))
                  ) : (
                    <p className="we-ap-none">{m.resultNoOwnWords}</p>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <WithdrawApplication applicationId={application.id} />
    </div>
  );
}
