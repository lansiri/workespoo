"use client";

import { useState, type ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./icons";
import { AiTag } from "./Tag";
import { Button } from "./Button";
import { PersonHandle } from "./PersonHandle";
import { InterviewerMascot } from "./InterviewerMascot";
import { SkillRow, type SkillRowData, type SkillRowEditing, type SkillRowText } from "./SkillRow";

export type SignalCardGroup = { key: string; title: string; rows: SkillRowData[] };

export type SignalCardProps = {
  /** waiting: notes are being prepared; error: synthesis failed; empty: nothing kept; ready: the card. */
  state?: "ready" | "waiting" | "error" | "empty";
  view?: "person" | "company";
  approved?: boolean;
  handle: string;
  handleAria: string;
  /** Header words. `aiLabel` sits directly above the headline. */
  header: { kicker: string; aiTag: string; aiLabel: string; headline: string; summary: string; readSummary: string; hideSummary: string };
  /** "Notes are in the order you talked about them. Nothing here is scored." (company view: the fixed AI label) */
  orderNote: string;
  groups: SignalCardGroup[];
  /** Id of the row being edited, with its draft state. */
  editing?: SkillRowEditing & { id: string };
  rowText: SkillRowText;
  /** "+ Add your own". Hidden in the company view. */
  addOwn?: { label: string; onAdd: () => void };
  /** The "What you're looking for" section, composed by the page. */
  lookingFor?: ReactNode;
  /** Footer fragments, for example "Synthetic demo profile", "Draft · nobody sees this until you approve it", "Skill labels: ESCO, European Commission". */
  footer: string[];
  /** "APPROVED BY YOU" */
  stampLabel: string;
  /** States */
  waitingText: string;
  waitingBadge: string;
  emptyText: string;
  errorText: string;
  onEditSignal?: (id: string) => void;
  onRemoveSignal?: (id: string) => void;
  onUndo?: (id: string) => void;
  className?: string;
};

/**
 * The person's own account of what they can do; the object they approve. Ink border, 7 px ink shadow, sun tape,
 * pine header with the handle sticker, the AI label directly above the headline, groups of SkillRows in
 * conversation order. Nothing on it is scored. The company view does not render quotes, actions, removed rows
 * or the stamp at all (they are not merely hidden).
 */
export function SignalCard(p: SignalCardProps) {
  const [open, setOpen] = useState(false);
  const company = p.view === "company";
  const state = p.state ?? "ready";
  const kept = p.groups.flatMap((g) => g.rows);
  return (
    <div className={cx("we-sig-card", p.className)} data-view={company ? "company" : "person"}>
      <span className="we-tape" aria-hidden="true" />
      <div className={cx("we-sig-head", open && "we-open")}>
        <div className="we-row1">
          <Icon name="mark" className="we-mark-mint" />
          <span className="we-kicker">{p.header.kicker}</span>
          <PersonHandle handle={p.handle} ariaLabel={p.handleAria} />
        </div>
        {state === "waiting" ? null : (
          <>
            <p className="we-ai-label-dark">
              <AiTag>{p.header.aiTag}</AiTag>
              <span>{p.header.aiLabel}</span>
            </p>
            <h2 data-testid="card-headline">{p.header.headline}</h2>
            <p className="we-summary">{p.header.summary}</p>
            <button type="button" className="we-summary-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              {open ? p.header.hideSummary : p.header.readSummary}
            </button>
          </>
        )}
        {p.approved && !company ? (
          <span className="we-stamp" data-testid="card-approved-stamp">
            <Icon name="check" />
            {p.stampLabel}
          </span>
        ) : null}
      </div>
      <div className="we-sig-body">
        {state === "waiting" ? (
          <div className="we-card-state" data-testid="card-waiting">
            <InterviewerMascot state="thinking" size={96} badgeLabel={p.waitingBadge} />
            <p>{p.waitingText}</p>
          </div>
        ) : state === "error" ? (
          <p className="we-card-state-text" role="alert" data-testid="card-error">
            {p.errorText}
          </p>
        ) : state === "empty" || kept.length === 0 ? (
          <p className="we-card-state-text" data-testid="card-empty">
            {p.emptyText}
          </p>
        ) : (
          <>
            <p className={cx("we-order-note", company && "we-fixed-ai")}>{p.orderNote}</p>
            {p.groups
              .filter((g) => g.rows.some((r) => !company || !r.removed))
              .map((g) => (
                <section key={g.key} className="we-group" aria-labelledby={`we-g-${g.key}`}>
                  <h3 className="we-group-title" id={`we-g-${g.key}`}>
                    {g.title}
                  </h3>
                  {g.rows.map((r) => (
                    <SkillRow
                      key={r.id}
                      signal={r}
                      view={p.view}
                      text={p.rowText}
                      editing={p.editing && p.editing.id === r.id ? p.editing : undefined}
                      onEdit={p.onEditSignal}
                      onRemove={p.onRemoveSignal}
                      onUndo={p.onUndo}
                    />
                  ))}
                </section>
              ))}
            {company || !p.addOwn ? null : (
              <div className="we-add-own">
                <Button variant="quiet" icon="plus" onClick={p.addOwn.onAdd} data-testid="add-own-signal">
                  {p.addOwn.label}
                </Button>
              </div>
            )}
          </>
        )}
        {state === "ready" && p.lookingFor ? <div className="we-looking">{p.lookingFor}</div> : null}
      </div>
      <div className="we-sig-foot">
        {p.footer.map((f, i) => (
          <span key={i}>{f}</span>
        ))}
      </div>
    </div>
  );
}
