"use client";

import { useId, useState } from "react";
import { cx } from "./cx";
import { NoteChip, type NoteChipProps, type NoteGroup } from "./NoteChip";
import { newIds } from "./newIds";
import { useIsPhone } from "./useIsPhone";

export type NoteItem = {
  /** Stable id of the note (the signal id). */
  id: string;
  label: string;
  group: NoteGroup;
  refLabel?: string;
  fresh?: boolean;
  pending?: boolean;
};

export type NotesListProps = {
  notes: NoteItem[];
  /**
   * Ids that should play the entrance animation. Leave out and the list works it out itself: only ids that
   * were not in the previous render enter. The first render never animates.
   */
  enteringIds?: string[];
  /** conversation order, newest first, or newest first on phones only (default). */
  order?: "conversation" | "newest" | "newest-on-phone";
  text: {
    title: string;
    help: string;
    /** Shown when empty, under the ghost chips. */
    empty: string;
    newLabel: string;
    /** Screen-reader template, for example "Noted: {phrase}". */
    noted: string;
  };
  onHover?: (note: NoteItem, on: boolean) => void;
  /** Gets each chip element so flyNote can fly to it. */
  chipRef?: (id: string, el: HTMLElement | null) => void;
  className?: string;
};

const GHOST_WIDTHS = [150, 110, 180, 90];

/** "Notes so far": count pill and a wrapping chip flow. Empty shows four dashed ghost chips. */
export function NotesList({ notes, enteringIds, order = "newest-on-phone", text, onHover, chipRef, className }: NotesListProps) {
  const uid = useId();
  const phone = useIsPhone();
  const ids = notes.map((n) => n.id);
  const key = ids.join("|");
  const [known, setKnown] = useState<string[]>(ids);
  const [lastKey, setLastKey] = useState(key);
  const [auto, setAuto] = useState<string[]>([]);
  if (key !== lastKey) {
    setLastKey(key);
    setAuto(newIds(known, ids));
    setKnown(ids);
  }
  const entering = new Set(enteringIds ?? auto);
  const newestFirst = order === "newest" || (order === "newest-on-phone" && phone);
  const shown = newestFirst ? [...notes].reverse() : notes;
  const latest = notes.filter((n) => entering.has(n.id)).map((n) => n.label);
  return (
    <section className={cx("we-notes", className)} aria-labelledby={`${uid}-t`}>
      <div className="we-panel-head">
        <h2 id={`${uid}-t`}>
          <span>{text.title}</span> <span className="we-n-count">{notes.length > 0 ? notes.length : ""}</span>
        </h2>
        <p data-testid="coverage-hint">{text.help}</p>
      </div>
      {notes.length === 0 ? (
        <div className="we-chips-empty">
          <div className="we-ghosts" aria-hidden="true">
            {GHOST_WIDTHS.map((w) => (
              <span key={w} className="we-chip we-ghost" style={{ width: w }}>
                <i className="we-gm" />
              </span>
            ))}
          </div>
          <p>{text.empty}</p>
        </div>
      ) : (
        <ul className="we-chips" data-testid="notes-list">
          {shown.map((n) => (
            <li key={n.id}>
              <NoteChip
                signalId={n.id}
                phrase={n.label}
                group={n.group}
                refLabel={n.refLabel}
                fresh={n.fresh}
                newLabel={text.newLabel}
                pending={n.pending}
                entering={entering.has(n.id)}
                onHover={onHover ? (on) => onHover(n, on) : undefined}
                chipRef={chipRef ? (el: HTMLElement | null) => chipRef(n.id, el) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
      <p className="we-sr-only" aria-live="polite">
        {latest.map((l) => text.noted.replace("{phrase}", l)).join(". ")}
      </p>
    </section>
  );
}

export type { NoteChipProps };
