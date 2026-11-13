import { cx } from "./cx";

export type InterviewerLineProps = {
  text: string;
  /** Number of words already spoken. Leave out to show the whole line in ink. */
  spokenWords?: number;
  /** Label above the line, "INTERVIEWER · AI". */
  label: string;
  /** Force the smaller size. Switches on by itself above 160 characters. */
  long?: boolean;
  className?: string;
};

/**
 * The current question in large Fredoka, centred and balanced. Spoken words are ink, the rest is muted (7:1).
 * It is never dimmed while the person is listening. Screen readers get the whole line once (aria-live on the
 * hidden full text), not word by word.
 */
export function InterviewerLine({ text, spokenWords, label, long, className }: InterviewerLineProps) {
  const isLong = long ?? text.length > 160;
  const words = text.split(" ");
  const speaking = typeof spokenWords === "number" && spokenWords < words.length;
  const cut = Math.max(0, Math.min(words.length, spokenWords ?? words.length));
  return (
    <div className={cx("we-iv-line", isLong && "we-long", className)} data-testid="interviewer-text" data-speaking={speaking ? "true" : undefined}>
      <span className="we-who">{label}</span>
      <span className="we-sr-only" aria-live="polite">
        {text}
      </span>
      <span aria-hidden="true">
        {speaking ? (
          <>
            {words.slice(0, cut).join(" ")} <span className="we-unspoken">{words.slice(cut).join(" ")}</span>
          </>
        ) : (
          text
        )}
      </span>
    </div>
  );
}
