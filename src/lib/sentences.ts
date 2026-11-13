/**
 * Sentence splitting for evidence references.
 *
 * Evidence points at sentences by index, so this function must be deterministic and its
 * behaviour must not change once transcripts are stored. Turns are split once, when they
 * are saved, and the result is stored next to the text.
 *
 * It is deliberately conservative: when in doubt it keeps text together. Speech-to-text
 * output with no punctuation is cut into chunks at clause boundaries so that a reference
 * never has to cover a whole rambling turn.
 */

const ABBREVIATIONS = new Set([
  // English
  "e.g.",
  "i.e.",
  "etc.",
  "mr.",
  "mrs.",
  "ms.",
  "dr.",
  "prof.",
  "vs.",
  "approx.",
  "no.",
  "inc.",
  "ltd.",
  // Finnish
  "esim.",
  "mm.",
  "ym.",
  "jne.",
  "ns.",
  "ts.",
  "vrt.",
  "n.",
  "v.",
  "klo.",
  "oy.",
  "puh.",
  "tel.",
  "s.",
]);

/** Longest run of words kept as one sentence when the text has no usable punctuation. */
export const MAX_WORDS_PER_SENTENCE = 30;
export const MAX_WORDS_PER_CHUNK = 25;
const TARGET_WORDS_PER_CHUNK = 18;

const BOUNDARY = /([.!?…]+)(["'”’)\]]*)\s+(?=[\p{Lu}\p{N}"'“‘(\[])/gu;

export function splitSentences(text: string): string[] {
  const normalised = text.replace(/\s+/g, " ").trim();
  if (!normalised) return [];

  const pieces: string[] = [];
  let start = 0;
  for (const match of normalised.matchAll(BOUNDARY)) {
    const index = match.index;
    if (index === undefined) continue;
    const end = index + (match[1]?.length ?? 0) + (match[2]?.length ?? 0);
    const candidate = normalised.slice(start, end);
    if (endsWithAbbreviation(candidate) || endsWithOrdinal(candidate)) continue;
    pieces.push(candidate.trim());
    start = end;
  }
  const rest = normalised.slice(start).trim();
  if (rest) pieces.push(rest);

  return pieces.flatMap(chunkLongSentence).filter((s) => s.length > 0);
}

function endsWithAbbreviation(candidate: string): boolean {
  const lastToken = candidate.split(" ").pop()?.toLowerCase() ?? "";
  return ABBREVIATIONS.has(lastToken);
}

/** "1." or "12." at the end is usually a list number or a Finnish ordinal, not a sentence end. */
function endsWithOrdinal(candidate: string): boolean {
  return /(^|\s)\d{1,2}\.$/.test(candidate);
}

function chunkLongSentence(sentence: string): string[] {
  const words = sentence.split(" ");
  if (words.length <= MAX_WORDS_PER_SENTENCE) return [sentence];

  const chunks: string[] = [];
  let current: string[] = [];
  for (const word of words) {
    current.push(word);
    const atClauseEnd = /[,;:]$/.test(word);
    if (
      (current.length >= TARGET_WORDS_PER_CHUNK && atClauseEnd) ||
      current.length >= MAX_WORDS_PER_CHUNK
    ) {
      chunks.push(current.join(" "));
      current = [];
    }
  }
  if (current.length > 0) {
    // Avoid a tiny trailing fragment: attach it to the previous chunk.
    const last = chunks.pop();
    if (last !== undefined && current.length < 6) {
      chunks.push(`${last} ${current.join(" ")}`);
    } else {
      if (last !== undefined) chunks.push(last);
      chunks.push(current.join(" "));
    }
  }
  return chunks;
}

/**
 * Render the text an evidence reference points at. Sentence numbers are 1-based, as in
 * the labels models cite (`T3.S2` is the second sentence of turn 3). Returns null when the
 * reference does not resolve, in which case the caller drops it.
 */
export function renderEvidence(
  sentences: readonly string[],
  sentenceFrom: number,
  sentenceTo: number,
): string | null {
  if (
    !Number.isInteger(sentenceFrom) ||
    !Number.isInteger(sentenceTo) ||
    sentenceFrom < 1 ||
    sentenceTo < sentenceFrom ||
    sentenceTo > sentences.length
  ) {
    return null;
  }
  return sentences.slice(sentenceFrom - 1, sentenceTo).join(" ");
}

/** Label participant sentences the way prompts show them: `[T3.S1] text`, numbered from 1. */
export function labelSentences(turnIndex: number, sentences: readonly string[]): string[] {
  return sentences.map((sentence, i) => `[T${turnIndex}.S${i + 1}] ${sentence}`);
}
