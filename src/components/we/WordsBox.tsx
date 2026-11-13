import { Fragment } from "react";
import { cx } from "./cx";
import { OwnWordsMark } from "./OwnWordsMark";

export type WordsBoxProps =
  | { mode: "empty"; emptyText: string; className?: string }
  | { mode: "live"; label: string; text: string; className?: string }
  | {
      mode: "said";
      /** "You said · answer 2" */
      label: string;
      /** "marked words became notes" (hidden on phones) */
      hint: string;
      /** Number of the answer, used for the data attribute on the marks. */
      answerNumber: number;
      sentences: string[];
      /** Sentence indexes that became notes. */
      cited: number[];
      sweep?: boolean;
      className?: string;
    };

/**
 * Puts the person's own words on the main stage under the question: a live caption while they speak, then the
 * last answer with the sentences that became notes marked. Live mode is aria-live off (the transcript announces).
 */
export function WordsBox(props: WordsBoxProps) {
  if (props.mode === "empty") {
    return (
      <div className={cx("we-words we-empty", props.className)} data-mode="empty">
        <p>{props.emptyText}</p>
      </div>
    );
  }
  if (props.mode === "live") {
    return (
      <div className={cx("we-words we-live", props.className)} data-mode="live" aria-live="off">
        <span className="we-who">{props.label}</span>
        <p>
          <span data-testid="voice-partial">{props.text}</span>
          <span className="we-caret" aria-hidden="true" />
        </p>
      </div>
    );
  }
  const cited = new Set(props.cited);
  return (
    <div className={cx("we-words we-said", props.className)} data-mode="said">
      <span className="we-who">
        {props.label}
        <em>· {props.hint}</em>
      </span>
      <p>
        {props.sentences.map((s, i) => (
          <Fragment key={i}>
            {i > 0 ? " " : null}
            {cited.has(i) ? (
              <OwnWordsMark turn={props.answerNumber} sentence={i} sweep={props.sweep}>
                {s}
              </OwnWordsMark>
            ) : (
              s
            )}
          </Fragment>
        ))}
      </p>
    </div>
  );
}
