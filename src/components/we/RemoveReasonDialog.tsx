"use client";

import { useState, type KeyboardEvent } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

export type RemoveReason = { code: string; label: string };

export type RemoveReasonDialogProps = {
  /** "Why remove Harbour-90 from today's list?" */
  title: string;
  /** "The reason goes to the audit log. It is never shown to the person as a judgement." */
  help: string;
  /** Five reasons. The one with code `otherCode` needs a note. Number keys 1 to 5 choose. */
  reasons: RemoveReason[];
  otherCode?: string;
  noteLabel: string;
  /** "Remove Harbour-90" */
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: (v: { reasonCode: string; note: string }) => void;
  onCancel: () => void;
  /** Draw in the page flow instead of over a scrim (gallery, tests). */
  inline?: boolean;
  /** Start with this reason chosen (gallery only). The real flow never preselects. */
  demoChosen?: string;
};

/**
 * Modal asking why a pick is removed. No reason is preselected and confirm stays disabled until one is chosen
 * (and a note written for Other). The reason goes to the audit log and is never shown to the person.
 */
export function RemoveReasonDialog(p: RemoveReasonDialogProps) {
  const other = p.otherCode ?? "other";
  const [reason, setReason] = useState<string | null>(p.demoChosen ?? null);
  const [note, setNote] = useState("");
  const valid = reason !== null && (reason !== other || note.trim().length > 0);
  function confirm() {
    if (valid && reason) p.onConfirm({ reasonCode: reason, note: note.trim() });
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "TEXTAREA") return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= p.reasons.length) {
      setReason(p.reasons[n - 1].code);
      e.preventDefault();
    } else if (e.key === "Enter" && tag !== "BUTTON") {
      e.preventDefault();
      confirm();
    }
  }
  return (
    <Dialog
      title={p.title}
      inline={p.inline}
      onClose={p.onCancel}
      testId="pick-remove-panel"
      initialFocus='input[type="radio"]'
      actions={
        <>
          <Button variant="ghost" kbd="Esc" onClick={p.onCancel}>
            {p.cancelLabel}
          </Button>
          <Button variant="primary" kbd="Enter" disabled={!valid} onClick={confirm} data-testid="pick-remove-confirm">
            {p.confirmLabel}
          </Button>
        </>
      }
    >
      <div onKeyDown={onKeyDown}>
        <p>{p.help}</p>
        <ol>
          {p.reasons.map((r, i) => (
            <li key={r.code}>
              <label className="we-opt">
                <input type="radio" name="we-remove-reason" checked={reason === r.code} onChange={() => setReason(r.code)} data-testid="pick-remove-reason" value={r.code} />
                <span>
                  <kbd className="we-kbd">{i + 1}</kbd> {r.label}
                </span>
              </label>
            </li>
          ))}
        </ol>
        <label className="we-sr-only" htmlFor="we-remove-note">
          {p.noteLabel}
        </label>
        <textarea id="we-remove-note" className="we-textarea" placeholder={p.noteLabel} value={note} onChange={(e) => setNote(e.target.value)} data-testid="pick-remove-note" />
      </div>
    </Dialog>
  );
}
