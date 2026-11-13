"use client";

import { useState, type ReactNode } from "react";
import { cx } from "./cx";
import { Button } from "./Button";
import { Input } from "./FormFields";

export type RequirementItem = {
  id: string;
  text: string;
  kind: "must" | "nice";
  category?: string;
  /** From the posting: the sentence it came from. null or undefined with `addedByYou`: the company added it. */
  postingSentence?: string | null;
  addedByYou?: boolean;
  statutory?: boolean;
  /** PoolEvidenceLine and RequirementQuestion for this row (full mode). */
  extra?: ReactNode;
};

export type RequirementListProps = {
  requirements: RequirementItem[];
  mode: "compact" | "full";
  editable?: boolean;
  onEdit?: (id: string, text: string) => void;
  onToggleKind?: (id: string, kind: "must" | "nice") => void;
  text: {
    must: string;
    nice: string;
    /** "From your posting" / "Added by you" */
    fromPosting: string;
    addedByYou: string;
    showSentence: string;
    hideSentence: string;
    edit: string;
    save: string;
    cancel: string;
    /** "Set by law or regulation. Not questioned here; the employer checks it at hiring." */
    statutory: string;
    kindGroup: string;
  };
  className?: string;
};

/** Requirements of a Need Card with kind, category and source. Compact for the rail, full on the Need Card page. */
export function RequirementList({ requirements, mode, editable, onEdit, onToggleKind, text, className }: RequirementListProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  if (mode === "compact") {
    return (
      <ul className={cx("we-req-list", className)}>
        {requirements.map((r) => (
          <li key={r.id} data-testid="requirement" data-requirement-id={r.id}>
            <span data-testid="requirement-text">{r.text}</span>
            <span className="we-kind" data-testid="requirement-kind">
              {r.kind === "must" ? text.must : text.nice}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className={cx("we-req-full", className)}>
      {requirements.map((r) => (
        <li key={r.id} className="we-req-panel" data-testid="requirement" data-requirement-id={r.id}>
          <div className="we-req-top">
            {editing === r.id ? (
              <div className="we-sig-edit">
                <Input aria-label={text.edit} value={draft} onChange={(e) => setDraft(e.target.value)} />
                <Button
                  variant="primary"
                  disabled={draft.trim().length < 2}
                  onClick={() => {
                    onEdit?.(r.id, draft.trim());
                    setEditing(null);
                  }}
                >
                  {text.save}
                </Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  {text.cancel}
                </Button>
              </div>
            ) : (
              <>
                <h3 data-testid="requirement-text">{r.text}</h3>
                {editable ? (
                  <Button
                    variant="quiet"
                    icon="edit"
                    onClick={() => {
                      setEditing(r.id);
                      setDraft(r.text);
                    }}
                  >
                    {text.edit}
                  </Button>
                ) : null}
              </>
            )}
          </div>
          <div className="we-req-meta">
            {editable ? (
              <div className="we-seg we-seg-sm" role="group" aria-label={text.kindGroup}>
                <button type="button" aria-pressed={r.kind === "must"} onClick={() => onToggleKind?.(r.id, "must")}>
                  {text.must}
                </button>
                <button type="button" aria-pressed={r.kind === "nice"} onClick={() => onToggleKind?.(r.id, "nice")}>
                  {text.nice}
                </button>
              </div>
            ) : (
              <span className="we-kind" data-testid="requirement-kind">
                {r.kind === "must" ? text.must : text.nice}
              </span>
            )}
            {r.category ? (
              <span className="we-tag" data-testid="requirement-category">
                {r.category}
              </span>
            ) : null}
            <span className="we-src">{r.addedByYou ? text.addedByYou : text.fromPosting}</span>
            {r.postingSentence ? (
              <button type="button" className="we-linkbtn" aria-expanded={shown === r.id} onClick={() => setShown(shown === r.id ? null : r.id)}>
                {shown === r.id ? text.hideSentence : text.showSentence}
              </button>
            ) : null}
          </div>
          {r.postingSentence && shown === r.id ? (
            <p className="we-posting-sentence" data-testid="posting-sentence">
              <q>{r.postingSentence}</q>
            </p>
          ) : null}
          {r.statutory ? (
            <p className="we-statutory" data-testid="statutory-note">
              {text.statutory}
            </p>
          ) : null}
          {r.extra}
        </li>
      ))}
    </ul>
  );
}
