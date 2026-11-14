"use client";

import { useId, useState, type ReactNode } from "react";
import { cx } from "./cx";

export type ReasonVariant = "feed" | "organiser" | "company" | "intro";

export type ReasonText = {
  /** Left label: "From your card" (feed), "From the card · AI wording" (organiser, company). */
  cardLabel: string;
  /** Right label: "From the posting", "From your posting", "From their need". */
  postingLabel: string;
  /** Template used when there is no posting sentence: "Mentions {label}". */
  mentions: string;
  /** Feed only. */
  seeOwnWords?: string;
  hideOwnWords?: string;
  /** "Your words" */
  yourWords?: string;
  /** Company after consent: "In their own words" and "Shown to you after you both agreed". */
  revealedLabel?: string;
  revealedNote?: string;
};

export type ReasonLineProps = {
  variant: ReasonVariant;
  /** What the card says: the person's phrase (feed) or the AI wording (organiser, company). Never put in quote marks. */
  cardText: string;
  cardKind: "phrase" | "rendering";
  /** Sentence from the posting or need, shown in quotes. null: show "Mentions {escoLabel}". */
  postingSentence?: string | null;
  escoLabel?: string;
  /** Feed only: the person's sentence, rendered by code from the transcript. */
  ownWords?: { refLabel: string; text: string };
  /** Company only, after both sides agreed. */
  revealedQuote?: string | string[];
  text: ReasonText;
  className?: string;
};

function testIdFor(v: ReasonVariant): string {
  return v === "feed" || v === "intro" ? "match-reason" : "pick-reason";
}

/**
 * One reason a person relates to a job or need. The card side and the posting side sit in separate labelled
 * cells, so nobody mistakes the system's wording for the person's own or for the employer's. The card side is
 * never in quote marks; only posting sentences and the person's own words are.
 */
export function ReasonLine(p: ReasonLineProps) {
  const [open, setOpen] = useState(false);
  const ownId = useId();
  const posting = p.postingSentence ? <q>{p.postingSentence}</q> : <span>{p.text.mentions.replace("{label}", p.escoLabel ?? p.cardText)}</span>;
  if (p.variant === "organiser") {
    return (
      <li className={cx("we-qreason", p.className)} data-testid="pick-reason">
        <div className="we-row">
          <span className="we-src-l">{p.text.cardLabel}</span>
          <span>{p.cardText}</span>
        </div>
        <div className="we-row we-post">
          <span className="we-src-l">{p.text.postingLabel}</span>
          <span>{posting}</span>
        </div>
      </li>
    );
  }
  const side: ReactNode = (
    <>
      <span className="we-label">{p.text.cardLabel}</span>
      {p.cardKind === "phrase" ? <b>{p.cardText}</b> : <span>{p.cardText}</span>}
      {p.variant === "feed" && p.ownWords && p.text.seeOwnWords ? (
        <span className="we-own">
          <button type="button" aria-expanded={open} aria-controls={ownId} onClick={() => setOpen((v) => !v)} data-testid="see-own-words">
            {open ? p.text.hideOwnWords : p.text.seeOwnWords}
          </button>
          {open ? (
            <span id={ownId} data-testid="own-words">
              <q>{p.ownWords.text}</q>
              <small>
                {p.text.yourWords} · {p.ownWords.refLabel}
              </small>
            </span>
          ) : null}
        </span>
      ) : null}
      {p.variant === "company"
        ? (Array.isArray(p.revealedQuote) ? p.revealedQuote : p.revealedQuote ? [p.revealedQuote] : []).map((quote, i) => (
            <span className="we-revealed-q" key={i} data-testid="revealed-quote">
              <span className="we-label">{p.text.revealedLabel}</span>
              <q>{quote}</q>
              <small>{p.text.revealedNote}</small>
            </span>
          ))
        : null}
    </>
  );
  return (
    <li className={cx("we-reason", p.className)} data-testid={testIdFor(p.variant)} data-variant={p.variant}>
      <div className="we-r-card">{side}</div>
      <div className="we-r-post">
        <span className="we-label">{p.text.postingLabel}</span>
        {posting}
      </div>
    </li>
  );
}

/** List wrapper that picks the right spacing for the variant. */
export function ReasonList({ variant, children, className }: { variant: ReasonVariant; children: ReactNode; className?: string }) {
  return <ul className={cx(variant === "organiser" ? "we-qreasons" : "we-reasons", className)}>{children}</ul>;
}
