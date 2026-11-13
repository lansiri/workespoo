import { z } from "zod";

/** Opaque string id. Ids carry a readable prefix, for example `tal_x1y2`, `int_ab12`. */
export const Id = z.string().min(1).max(64);
export type Id = z.infer<typeof Id>;

/** ISO 8601 timestamp as a string. Kept loose on purpose so the same schema parses DB and API values. */
export const IsoDateTime = z.string().min(10);
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/** Language of a conversation or posting. `other` covers anything we do not localise. */
export const Lang = z.enum(["en", "fi", "sv", "other"]);
export type Lang = z.infer<typeof Lang>;

/**
 * A label the model uses to cite one sentence of the transcript: `T<turnIndex>.S<sentenceIndex>`.
 * Both indexes are zero-based. Example: `T3.S1` is the second sentence of turn 3.
 */
export const SentenceLabel = z.string().regex(/^T\d{1,3}\.S\d{1,3}$/);
export type SentenceLabel = z.infer<typeof SentenceLabel>;

/**
 * A resolved pointer into the stored transcript. Evidence is always rendered from the
 * transcript through one of these, never from text a model wrote.
 */
export const EvidenceRef = z.object({
  turnIndex: z.number().int().min(0),
  sentenceFrom: z.number().int().min(0),
  sentenceTo: z.number().int().min(0),
});
export type EvidenceRef = z.infer<typeof EvidenceRef>;

export function formatSentenceLabel(turnIndex: number, sentenceIndex: number): string {
  return `T${turnIndex}.S${sentenceIndex}`;
}

export function parseSentenceLabel(label: string): { turnIndex: number; sentenceIndex: number } | null {
  const m = /^T(\d{1,3})\.S(\d{1,3})$/.exec(label.trim());
  if (!m) return null;
  return { turnIndex: Number(m[1]), sentenceIndex: Number(m[2]) };
}

/**
 * Turn a list of sentence labels into merged evidence ranges.
 * Labels that do not parse are ignored; adjacent sentences of the same turn are merged.
 */
export function labelsToEvidenceRefs(labels: readonly string[]): EvidenceRef[] {
  const byTurn = new Map<number, Set<number>>();
  for (const label of labels) {
    const parsed = parseSentenceLabel(label);
    if (!parsed) continue;
    const set = byTurn.get(parsed.turnIndex) ?? new Set<number>();
    set.add(parsed.sentenceIndex);
    byTurn.set(parsed.turnIndex, set);
  }
  const refs: EvidenceRef[] = [];
  for (const turnIndex of [...byTurn.keys()].sort((a, b) => a - b)) {
    const sentences = [...(byTurn.get(turnIndex) ?? [])].sort((a, b) => a - b);
    let from = sentences[0];
    let prev = sentences[0];
    if (from === undefined || prev === undefined) continue;
    for (const s of sentences.slice(1)) {
      if (s === prev + 1) {
        prev = s;
        continue;
      }
      refs.push({ turnIndex, sentenceFrom: from, sentenceTo: prev });
      from = s;
      prev = s;
    }
    refs.push({ turnIndex, sentenceFrom: from, sentenceTo: prev });
  }
  return refs;
}
