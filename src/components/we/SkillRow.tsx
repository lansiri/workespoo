"use client";

import type { ReactNode } from "react";
import { cx } from "./cx";
import { AiTag } from "./Tag";
import { Button } from "./Button";
import { NoteChip, type NoteGroup } from "./NoteChip";
import { Input } from "./FormFields";

export type OwnQuote = { /** "Answer 2". Leave out when the contract gives no turn label. */ refLabel?: string; /** Rendered by code from the stored transcript. */ text: string };

export type SkillRowData = {
  id: string;
  phrase: string;
  group: NoteGroup;
  /** ESCO labels in English and Finnish. null: no match. */
  esco: { en: string; fi: string } | null;
  addedBy: "ai" | "person";
  /** The AI wording companies see. null while it is being prepared. */
  rendering: string | null;
  removed?: boolean;
  /** One quote per answer, never joined. Empty for notes added by the person. */
  quotes: OwnQuote[];
};

export type SkillRowText = {
  edit: string;
  remove: string;
  undo: string;
  /** "Removed." */
  removedNote: string;
  /** "ESCO" box label */
  escoLabel: string;
  /** "No ESCO match. That's fine; it stays on your card." */
  noEsco: string;
  /** "Your words" */
  yourWords: string;
  /** "Shown to companies as" */
  shownAs: string;
  aiTag: string;
  /** "Added by you" */
  addedByYou: string;
  /** "Preparing company view…" */
  stale: string;
  /** Accessible names for the quiet buttons, for example "Edit Reading a pallet label". Use {phrase}. */
  editAria: string;
  removeAria: string;
  /** Editing state */
  inputLabel: string;
  save: string;
  cancel: string;
};

export type SkillRowEditing = { draft: string; onDraftChange: (v: string) => void; onSave: () => void; onCancel: () => void; sensitiveWarning?: string };

export type SkillRowProps = {
  signal: SkillRowData;
  view?: "person" | "company";
  text: SkillRowText;
  editing?: SkillRowEditing;
  onEdit?: (id: string) => void;
  onRemove?: (id: string) => void;
  onUndo?: (id: string) => void;
  className?: string;
};

/** The person's own words, sun-soft with a sun left border. Each answer is its own <q>; they are never joined. */
export function OwnWordsQuote({ quotes, label }: { quotes: OwnQuote[]; label: string }) {
  return (
    <blockquote className="we-quote" data-testid="signal-quote">
      <span className="we-label">{label}</span>
      {quotes.map((q, i) => (
        <div key={i}>
          <q>{q.text}</q>
          <span className="we-ref">{q.refLabel}</span>
        </div>
      ))}
    </blockquote>
  );
}

/** The AI wording companies see: dashed box, labelled AI, never in quotation marks. */
export function AiRendering({ children, label, aiTag, solid }: { children: ReactNode; label: string; aiTag: string; solid?: boolean }) {
  return (
    <div className={cx("we-rendering", solid && "we-solid")} data-testid="signal-rendering">
      <span className="we-label">
        <span aria-hidden="true">✦</span> {label} <AiTag mini>{aiTag}</AiTag>
      </span>
      <p>{children}</p>
    </div>
  );
}

/** One note: phrase chip, ESCO labels, the person's words and the AI wording side by side. */
export function SkillRow({ signal, view = "person", text, editing, onEdit, onRemove, onUndo, className }: SkillRowProps) {
  const company = view === "company";
  const t = (s: string) => s.replace("{phrase}", signal.phrase);
  if (signal.removed) {
    if (company) return null;
    return (
      <div className={cx("we-signal we-removed", className)} data-testid="removed-signal" data-signal-id={signal.id}>
        <div className="we-sig-top">
          <NoteChip signalId={signal.id} phrase={signal.phrase} group={signal.group} plain removed />
          <span className="we-removed-note">{text.removedNote}</span>
          <Button variant="quiet" onClick={() => onUndo?.(signal.id)} data-testid="signal-undo">
            {text.undo}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <article className={cx("we-signal", className)} data-testid="card-signal" data-signal-id={signal.id}>
      <div className="we-sig-top">
        {editing ? (
          <div className="we-sig-edit">
            <label className="we-sr-only" htmlFor={`we-edit-${signal.id}`}>
              {text.inputLabel}
            </label>
            <Input id={`we-edit-${signal.id}`} value={editing.draft} maxLength={60} onChange={(e) => editing.onDraftChange(e.target.value)} data-testid="signal-phrase-input" />
            <Button variant="primary" onClick={editing.onSave} disabled={editing.draft.trim().length < 2} data-testid="signal-phrase-save">
              {text.save}
            </Button>
            <Button variant="ghost" onClick={editing.onCancel}>
              {text.cancel}
            </Button>
            {editing.sensitiveWarning ? (
              <p className="we-calm-info" data-testid="signal-sensitive-warning">
                {editing.sensitiveWarning}
              </p>
            ) : null}
          </div>
        ) : (
          <NoteChip signalId={signal.id} phrase={signal.phrase} group={signal.group} plain />
        )}
        {company || editing ? null : (
          <div className="we-sig-actions">
            <Button variant="quiet" icon="edit" onClick={() => onEdit?.(signal.id)} aria-label={t(text.editAria)} data-testid="signal-edit">
              {text.edit}
            </Button>
            <Button variant="quiet" icon="x" onClick={() => onRemove?.(signal.id)} aria-label={t(text.removeAria)} data-testid="signal-remove">
              {text.remove}
            </Button>
          </div>
        )}
      </div>
      <p className="we-esco" data-testid="signal-esco">
        <span className="we-lbl">{text.escoLabel}</span>
        {signal.esco ? (
          <>
            <b lang="en">{signal.esco.en}</b> · <span lang="fi">{signal.esco.fi}</span>
          </>
        ) : (
          <span>{text.noEsco}</span>
        )}
      </p>
      {company ? null : signal.addedBy === "person" ? <span className="we-added-tag">{text.addedByYou}</span> : null}
      <div className="we-evidence">
        {company || signal.quotes.length === 0 ? null : <OwnWordsQuote quotes={signal.quotes} label={text.yourWords} />}
        {signal.rendering === null ? (
          <div className="we-rendering">
            <p>{text.stale}</p>
          </div>
        ) : (
          <AiRendering label={text.shownAs} aiTag={text.aiTag} solid={company}>
            {signal.rendering}
          </AiRendering>
        )}
      </div>
    </article>
  );
}
