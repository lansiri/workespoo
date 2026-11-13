import { z } from "zod";

/** Opaque string id. Ids carry a readable prefix, for example `tal_x1y2`, `int_ab12`. */
export const Id = z.string().min(1).max(64);
export type Id = z.infer<typeof Id>;

/** ISO 8601 timestamp as a string. Kept loose on purpose so the same schema parses DB and API values. */
export const IsoDateTime = z.string().min(10);
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/** Language category of a posting. `other` covers anything we do not localise. */
export const Lang = z.enum(["en", "fi", "sv", "other"]);
export type Lang = z.infer<typeof Lang>;

/** Languages the interface and the scripted interviewer lines exist in. */
export const UiLang = z.enum(["en", "fi"]);
export type UiLang = z.infer<typeof UiLang>;

export const InputMode = z.enum(["voice", "text"]);
export type InputMode = z.infer<typeof InputMode>;

/**
 * A label the model uses to cite the transcript: `T<turnIndex>.S<sentenceNumber>`, or a
 * range such as `T3.S2-S4` (also accepted: `T3.S2-4`).
 *
 * Numbering rules, fixed for the whole system:
 * - Turn indexes are 0-based and count every turn: T0 is the interviewer's opening,
 *   T1 the first answer. Only participant turns are labelled for models.
 * - Sentence numbers are 1-based: `T3.S2` is `turns[index = 3].sentences[1]`.
 * - Posting sentences are different: they are plain 0-based array indexes (see `Job.sentences`).
 */
export const SentenceLabel = z.string().regex(/^T\d+\.S\d+(-S?\d+)?$/);
export type SentenceLabel = z.infer<typeof SentenceLabel>;

/**
 * A resolved pointer into the stored transcript, holding the label numbers as written:
 * `T3.S2` is `{ turnIndex: 3, sentenceFrom: 2, sentenceTo: 2 }`. Evidence is always rendered
 * from the transcript through one of these, never from text a model wrote.
 */
export const EvidenceRef = z.object({
  turnIndex: z.number().int().min(0),
  sentenceFrom: z.number().int().min(1),
  sentenceTo: z.number().int().min(1),
});
export type EvidenceRef = z.infer<typeof EvidenceRef>;

/** A reference may span at most this many sentences; longer ranges are clamped to the first ones. */
export const MAX_EVIDENCE_SENTENCES = 3;

export function formatSentenceLabel(turnIndex: number, sentenceNumber: number): string {
  return `T${turnIndex}.S${sentenceNumber}`;
}

/** Parse one label into a reference, clamping long ranges. Returns null when it does not parse. */
export function parseEvidenceLabel(label: string): EvidenceRef | null {
  const m = /^T(\d+)\.S(\d+)(?:-S?(\d+))?$/.exec(label.trim());
  if (!m) return null;
  const turnIndex = Number(m[1]);
  const sentenceFrom = Number(m[2]);
  const rawTo = m[3] === undefined ? sentenceFrom : Number(m[3]);
  if (sentenceFrom < 1 || rawTo < sentenceFrom) return null;
  const sentenceTo = Math.min(rawTo, sentenceFrom + MAX_EVIDENCE_SENTENCES - 1);
  return { turnIndex, sentenceFrom, sentenceTo };
}

/** Parse a list of labels, dropping the ones that do not parse and exact duplicates. */
export function labelsToEvidenceRefs(labels: readonly string[]): EvidenceRef[] {
  const refs: EvidenceRef[] = [];
  const seen = new Set<string>();
  for (const label of labels) {
    const ref = parseEvidenceLabel(label);
    if (!ref) continue;
    const key = `${ref.turnIndex}:${ref.sentenceFrom}:${ref.sentenceTo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  return refs;
}
