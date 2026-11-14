import { cx } from "./cx";

export type InterviewerLineProps = {
  text: string;
  /** Number of words already spoken. Leave out to show the whole line in ink. */
  spokenWords?: number;
  /** Label above the line, "INTERVIEWER · AI". */
  label: string;
  /** Force the smaller size. Switches on by itself above 160 characters of the question. */
  long?: boolean;
  className?: string;
};

/** Below this length a line stays one block: there is nothing to separate. */
const LEAD_MIN_LENGTH = 120;

/**
 * Splits a long turn that ends in a question into its lead-in ("Hi, I'm … Let's start:") and the question
 * itself, so the question can stand out. Display only: the stored text and its sentences are untouched.
 */
export function splitLead(text: string): { lead: string; question: string } {
  const trimmed = text.trim();
  if (trimmed.length < LEAD_MIN_LENGTH || !trimmed.endsWith("?")) return { lead: "", question: trimmed };
  let cut = -1;
  for (const m of trimmed.matchAll(/[.!?]\s+/g)) {
    const end = (m.index ?? 0) + m[0].length;
    if (end < trimmed.length) cut = end;
  }
  if (cut <= 0) return { lead: "", question: trimmed };
  return { lead: trimmed.slice(0, cut).trim(), question: trimmed.slice(cut).trim() };
}

/** One part of the line, with the words not yet spoken muted. */
function Words({ words, spoken }: { words: string[]; spoken: number | null }) {
  if (spoken === null || spoken >= words.length) return <>{words.join(" ")}</>;
  const cut = Math.max(0, spoken);
  return (
    <>
      {words.slice(0, cut).join(" ")} <span className="we-unspoken">{words.slice(cut).join(" ")}</span>
    </>
  );
}

/**
 * The current question in large Fredoka, centred and balanced. A long turn's lead-in sits above it in smaller,
 * quieter type. Spoken words are ink, the rest is muted (7:1). It is never dimmed while the person is listening.
 * Screen readers get the whole line once (aria-live on the hidden full text), not word by word.
 */
export function InterviewerLine({ text, spokenWords, label, long, className }: InterviewerLineProps) {
  const { lead, question } = splitLead(text);
  const isLong = long ?? question.length > 160;
  const leadWords = lead ? lead.split(" ") : [];
  const questionWords = question.split(" ");
  const total = leadWords.length + questionWords.length;
  const speaking = typeof spokenWords === "number" && spokenWords < total;
  const spoken = speaking ? spokenWords : null;
  return (
    <div className={cx("we-iv-line", isLong && "we-long", className)} data-testid="interviewer-text" data-speaking={speaking ? "true" : undefined}>
      <span className="we-who">{label}</span>
      <span className="we-sr-only" aria-live="polite">
        {text}
      </span>
      {lead ? (
        <span className="we-iv-lead" aria-hidden="true">
          <Words words={leadWords} spoken={spoken} />
        </span>
      ) : null}
      <span className="we-iv-question" aria-hidden="true">
        <Words words={questionWords} spoken={spoken === null ? null : spoken - leadWords.length} />
      </span>
    </div>
  );
}
