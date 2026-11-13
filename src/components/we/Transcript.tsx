"use client";

import { Fragment, useEffect, useId, useRef } from "react";
import { cx } from "./cx";
import { Icon } from "./icons";
import { OwnWordsMark } from "./OwnWordsMark";

export type TranscriptTurn = {
  speaker: "ai" | "person";
  /** One string per sentence, so marks can wrap whole sentences. */
  sentences: string[];
  /** For person turns: "You · answer 2". For AI turns: "Interviewer · AI". */
  label: string;
};

export type TranscriptProps = {
  turns: TranscriptTurn[];
  /** Cited sentence indexes per turn index. */
  cited?: Record<number, number[]>;
  onRemoveTurn?: (turnIndex: number) => void;
  /** Index of the turn whose sentences should be highlighted (chip hovered or focused). */
  highlightTurn?: number | null;
  highlightSentences?: number[];
  text: {
    title: string;
    onlyYou: string;
    empty: string;
    remove: string;
    legendMarked: string;
    legendRest: string;
  };
  className?: string;
};

/**
 * The full conversation, for the person only. AI turns are plain; the person's turns sit in a mint-soft bubble
 * with the cited sentences marked permanently. Auto-scrolls to the newest turn.
 */
export function Transcript({ turns, cited = {}, onRemoveTurn, highlightTurn, highlightSentences = [], text, className }: TranscriptProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = listRef.current;
    // Scroll only this column, and only when it is the scroll container (not the phone single column).
    if (el && el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY !== "visible") el.scrollTop = el.scrollHeight;
  }, [turns.length]);
  return (
    <section className={cx("we-convo", className)} aria-labelledby={titleId}>
      <div className="we-panel-head">
        <h2 id={titleId}>{text.title}</h2>
        <p className="we-only-you">
          <Icon name="lock" />
          <span>{text.onlyYou}</span>
        </p>
      </div>
      <div className="we-convo-list" data-testid="transcript" ref={listRef}>
        {turns.length === 0 ? (
          <p className="we-convo-empty">{text.empty}</p>
        ) : (
          <ol className="we-turns" aria-live="polite">
            {turns.map((t, ti) => {
              const marks = new Set(cited[ti] ?? []);
              return (
                <li key={ti} className={cx("we-turn", t.speaker === "ai" ? "we-ai" : "we-me")}>
                  <span className="we-who">{t.label}</span>
                  {t.sentences.map((s, si) => (
                    <Fragment key={si}>
                      {si > 0 ? " " : null}
                      {t.speaker === "person" && marks.has(si) ? (
                        <OwnWordsMark turn={ti} sentence={si} highlighted={highlightTurn === ti && highlightSentences.includes(si)}>
                          {s}
                        </OwnWordsMark>
                      ) : (
                        s
                      )}
                    </Fragment>
                  ))}
                  {t.speaker === "person" && onRemoveTurn ? (
                    <button type="button" className="we-rm" data-testid="turn-remove" onClick={() => onRemoveTurn(ti)}>
                      {text.remove}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <p className="we-convo-legend">
        <span className="we-mk">{text.legendMarked}</span>
        <span>{text.legendRest}</span>
      </p>
    </section>
  );
}
