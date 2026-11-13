"use client";

import type { ReactNode } from "react";
import { cx } from "./cx";

export type NoteGroup = "skill" | "tool" | "knowledge" | "domain";

const GROUP_CLASS: Record<NoteGroup, string> = { skill: "", tool: "we-tool", knowledge: "we-know", domain: "we-domain" };

export type NoteChipProps = {
  signalId: string;
  phrase: string;
  group: NoteGroup;
  /** "answer 2". Shown small on the first line. Leave out inside a Signal Card row. */
  refLabel?: string;
  /** Accessible name. Defaults to "{phrase}, {refLabel}". */
  ariaLabel?: string;
  fresh?: boolean;
  /** Word for the NEW tag. Required when `fresh` is true. */
  newLabel?: string;
  /** Hidden while its clone flies (flyNote reveals it). */
  pending?: boolean;
  /** True while a notes-list entrance animation plays. */
  entering?: boolean;
  /** Removed in the card: dashed, struck, 60 %. */
  removed?: boolean;
  /** Render as a plain span (inside a card row) rather than a button. */
  plain?: boolean;
  onHover?: (on: boolean) => void;
  chipRef?: (el: HTMLElement | null) => void;
  /** Extra inline content after the phrase. */
  children?: ReactNode;
  className?: string;
};

/**
 * One noted skill. Same size, border and fill for every group: only the small marker differs (sun dot,
 * ink square, mint dot, pine ring), so no group reads as a higher tier. Labels wrap, never truncate.
 */
export function NoteChip({ signalId, phrase, group, refLabel, ariaLabel, fresh, newLabel, pending, entering, removed, plain, onHover, chipRef, children, className }: NoteChipProps) {
  const cls = cx("we-chip", GROUP_CLASS[group], fresh && "we-fresh", pending && "we-pending", entering && "we-entering", removed && "we-removed-chip", className);
  const body = (
    <>
      <i className="we-gm" aria-hidden="true" />
      <span className="we-t">{phrase}</span>
      {children}
      {refLabel ? <span className="we-ref">{refLabel}</span> : null}
      {fresh && newLabel ? <span className="we-new">{newLabel}</span> : null}
    </>
  );
  const common = {
    className: cls,
    "data-signal-id": signalId,
    "data-group": group,
    "data-entering": entering ? "true" : undefined,
    "data-pending": pending ? "true" : undefined,
    ref: chipRef,
  };
  if (plain) {
    return (
      <span {...common} data-testid="signal-phrase">
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      {...common}
      data-testid="signal-chip"
      aria-label={ariaLabel ?? (refLabel ? `${phrase}, ${refLabel}` : phrase)}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={() => onHover?.(false)}
    >
      {body}
    </button>
  );
}
