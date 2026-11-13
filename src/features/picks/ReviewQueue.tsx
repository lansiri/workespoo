"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/i18n";
import { useMessages } from "@/lib/i18n/client";
import { REMOVE_REASON_CODES, type RemoveReasonCode } from "./constants";
import { organiserMessages } from "./messages";
import type { QueueDigest, QueuePick } from "./queue-view";
import { useReviewQueue } from "./useReviewQueue";

type M = (typeof organiserMessages)["en"];

const REASON_LABEL_KEY = {
  evidence_thin: "reasonEvidenceThin",
  already_in_contact: "reasonAlreadyInContact",
  duplicate: "reasonDuplicate",
  person_asked: "reasonPersonAsked",
  other: "reasonOther",
} as const satisfies Record<RemoveReasonCode, keyof M>;

export function ReviewQueue() {
  const m = useMessages(organiserMessages);
  const q = useReviewQueue(m);

  const reasonLabel = (code: string | null) =>
    code && code in REASON_LABEL_KEY ? m[REASON_LABEL_KEY[code as RemoveReasonCode]] : "";
  const origin = (p: QueuePick) =>
    p.origin === "agent" ? m.originAgent : p.origin === "organiser" ? m.originOrganiser : m.originTalent;

  if (q.loadError && !q.queue) return <p role="alert">{m.loadFailed}</p>;
  if (!q.queue) return <p>{m.loading}</p>;

  const allDigests = q.queue.digests;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{m.reviewTitle}</h1>
        <Button type="button" onClick={() => void q.runDaily()} disabled={q.busy} data-testid="run-daily">
          {q.busy ? m.running : m.runDaily}
        </Button>
        <Button type="button" variant="outline" onClick={() => q.setHelpOpen(!q.helpOpen)}>
          ?
        </Button>
      </header>
      <p>{m.prototype}</p>
      <p data-testid="order-note">{m.orderNote}</p>
      {q.helpOpen ? (
        <section aria-label={m.keysTitle}>
          <h2 className="font-medium">{m.keysTitle}</h2>
          <p>{m.keysHelp}</p>
        </section>
      ) : null}
      {q.notice ? (
        <p role="status" data-testid="review-notice">
          {q.notice}
        </p>
      ) : null}

      {allDigests.length === 0 ? <p data-testid="review-empty">{m.nothingYet}</p> : null}
      {allDigests.length > 0 && allDigests.every((d) => d.status === "published") ? <p>{m.allPublished}</p> : null}

      {allDigests.map((digest) => (
        <DigestSection key={digest.id} digest={digest} q={q} m={m} reasonLabel={reasonLabel} origin={origin} />
      ))}
    </div>
  );
}

type Q = ReturnType<typeof useReviewQueue>;

function DigestSection(props: {
  digest: QueueDigest;
  q: Q;
  m: M;
  reasonLabel: (code: string | null) => string;
  origin: (p: QueuePick) => string;
}) {
  const { digest, q, m } = props;
  return (
    <section data-testid="review-digest" data-digest-id={digest.id} className="flex flex-col gap-3 border-t pt-3">
      <h2 className="text-xl font-medium">{digest.company.displayName}</h2>
      <p>{fmt(m.digestCounts, { approved: digest.approved, removed: digest.removed, undecided: digest.undecided })}</p>
      {digest.needs.map((need) => (
        <div key={need.needCardId} className="flex flex-col gap-2">
          <h3 className="font-medium">{need.title}</h3>
          {need.nobodyRelates ? <p>{fmt(m.nobodyRelates, { need: need.title })}</p> : null}
          {!need.nobodyRelates && need.picks.length === 0 ? <p>{fmt(m.noPicksForNeed, { need: need.title })}</p> : null}
          <ul className="flex list-none flex-col gap-3 p-0">
            {need.picks.map((p) => (
              <PickItem key={p.id} pick={p} digest={digest} q={q} m={m} reasonLabel={props.reasonLabel} origin={props.origin} />
            ))}
          </ul>
        </div>
      ))}
      {digest.status === "draft" ? (
        <Button type="button" onClick={() => void q.publish(digest.id)} disabled={q.busy} data-testid="publish-digest">
          {m.publish}
        </Button>
      ) : (
        <p>
          {m.publishedLabel}.{" "}
          {digest.companyPath ? (
            <a href={digest.companyPath} data-testid="digest-link">
              {m.companyLink}: {digest.companyPath}
            </a>
          ) : null}
        </p>
      )}
    </section>
  );
}

function PickItem(props: {
  pick: QueuePick;
  digest: QueueDigest;
  q: Q;
  m: M;
  reasonLabel: (code: string | null) => string;
  origin: (p: QueuePick) => string;
}) {
  const { pick, digest, q, m } = props;
  const ref = useRef<HTMLLIElement>(null);
  const selected = q.selectedId === pick.id;
  const editable = digest.status === "draft";
  const removing = q.removing?.pickId === pick.id ? q.removing : null;

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  return (
    <li
      ref={ref}
      data-testid="review-pick"
      data-pick-id={pick.id}
      data-status={pick.status}
      aria-current={selected ? "true" : undefined}
      tabIndex={-1}
      onClick={() => q.setSelectedId(pick.id)}
      className={`flex flex-col gap-2 rounded border p-3 ${selected ? "border-2" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <strong>{pick.card?.handle ?? pick.id}</strong>
        {pick.card?.synthetic ? <span>{m.synthetic}</span> : null}
        <span>{props.origin(pick)}</span>
      </div>
      {pick.card ? <p>{pick.card.headline}</p> : <p>{m.cardMissing}</p>}

      {pick.outOfDate ? (
        <p role="alert" data-testid="pick-out-of-date">
          {m.outOfDate}
        </p>
      ) : (
        <>
          <div>
            <span>{m.chipsTitle} </span>
            <ul className="inline-flex list-none flex-wrap gap-2 p-0">
              {pick.requirements.map((r) => (
                <li key={r.id} data-touched={r.touched ? "true" : "false"}>
                  {r.touched ? `[${r.text}]` : r.text}
                  <span className="sr-only"> ({r.touched ? m.chipMentioned : m.chipNotMentioned})</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-medium">{m.reasonsTitle}</h4>
            <ul className="flex list-none flex-col gap-2 p-0">
              {pick.reasons.map((r) => (
                <li key={`${r.requirementId}-${r.signalId}`} data-testid="pick-reason">
                  <p>{r.text}</p>
                  <p>
                    {m.fromCard} {r.rendering ?? r.signalPhrase}
                  </p>
                  {r.postingSentence ? (
                    <p>
                      {m.fromPosting} {r.postingSentence}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
          {pick.notMentioned.length > 0 ? (
            <p data-testid="pick-not-mentioned">
              {m.notMentioned}{" "}
              {pick.notMentioned.map((n) => (n.statutory ? `${n.text} ${m.statutory}` : n.text)).join(" · ")}. {m.notMentionedNote}
            </p>
          ) : null}
        </>
      )}

      <p>
        {pick.basis.seedPrefix
          ? `${pick.basis.lastDrafted ? fmt(m.basisLast, { date: pick.basis.lastDrafted }) : m.basisNever}. ${fmt(m.basisSeed, { seed: pick.basis.seedPrefix })}`
          : null}
      </p>

      {pick.status === "approved" ? <p data-testid="pick-status">{m.approved}</p> : null}
      {pick.status === "removed" ? (
        <p data-testid="pick-status">
          {fmt(m.removed, { reason: props.reasonLabel(pick.decision?.reasonCode ?? null) })}
          {pick.decision?.note ? ` ${pick.decision.note}` : ""}
        </p>
      ) : null}

      {editable && !removing ? (
        <div className="flex gap-2">
          {pick.status === "suggested" ? (
            <>
              <Button type="button" onClick={() => void q.approve(pick.id)} disabled={q.busy || Boolean(pick.outOfDate)} data-testid="pick-approve">
                {m.approve}
              </Button>
              <Button type="button" variant="outline" onClick={() => q.startRemove(pick.id)} disabled={q.busy} data-testid="pick-remove">
                {m.remove}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={() => void q.undo(pick.id)} disabled={q.busy} data-testid="pick-undo">
              {m.undo}
            </Button>
          )}
        </div>
      ) : null}

      {removing ? (
        <fieldset className="flex flex-col gap-2" data-testid="pick-remove-panel">
          <legend>{m.removeTitle}</legend>
          {REMOVE_REASON_CODES.map((code, i) => (
            <label key={code} className="flex items-center gap-2">
              <input
                type="radio"
                name={`remove-${pick.id}`}
                value={code}
                checked={removing.code === code}
                onChange={() => q.chooseCode(code)}
                data-testid="pick-remove-reason"
                data-code={code}
              />
              <span>
                {i + 1}. {props.reasonLabel(code)}
              </span>
            </label>
          ))}
          <label className="flex flex-col gap-1">
            <span>{m.noteLabel}</span>
            <input
              type="text"
              maxLength={300}
              value={removing.note}
              onChange={(e) => q.setNote(e.target.value)}
              data-testid="pick-remove-note"
            />
          </label>
          <div className="flex gap-2">
            <Button type="button" onClick={q.confirmRemove} disabled={!removing.code || q.busy} data-testid="pick-remove-confirm">
              {m.confirm}
            </Button>
            <Button type="button" variant="outline" onClick={q.cancelRemove}>
              {m.cancel}
            </Button>
          </div>
        </fieldset>
      ) : null}
    </li>
  );
}
