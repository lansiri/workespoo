import { findBannedEvaluative, findProtectedCard, findSpeechCue } from "@/lib/lexicon";

/** Rendering used when a model rendering fails a code check. Still labelled as an AI rendering. */
export const fallbackRendering = (phrase: string): string => `They list ${phrase} as a skill.`;

/** Rendering written by code for a phrase the person wrote or edited themselves. */
export const personDescribes = (phrase: string): string => `The person describes ${phrase}.`;

/** Stored at synthesis and shown above renderings to companies (signal-card.md section 5). */
export const COMPANY_RENDERING_LABEL = "Written by AI from their words and approved by them. Not a quote or fact.";

export const MAX_RENDERING_WORDS = 25;
export const MAX_SUMMARY_WORDS = 40;
export const MAX_HEADLINE_WORDS = 10;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Why a model-written text may not be shown to a company, or null when it may. The card lexicon
 * is checked separately because a hit there has different consequences for signals and summaries.
 */
export function textProblem(text: string, sources: readonly string[], maxWords: number): string | null {
  if (wordCount(text) > maxWords) return "too_long";
  if (findProtectedCard(text).length > 0) return "protected";
  if (findBannedEvaluative(text).length > 0) return "evaluative";
  if (findSpeechCue(text).length > 0) return "speech_cue";
  const t = normalise(text);
  for (const source of sources) {
    const s = normalise(source);
    if (wordCount(s) >= 4 && (t.includes(s) || s.includes(t))) return "quote";
  }
  return null;
}

/** Lower-case the first letter unless the word is an acronym or a proper-looking token (SAP, iPad). */
function lowerFirst(phrase: string): string {
  const first = phrase.split(/\s+/)[0] ?? "";
  if (/[A-Z].*[A-Z]/.test(first)) return phrase;
  return phrase.charAt(0).toLowerCase() + phrase.slice(1);
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Headline written by code: the first three phrases. */
export function codeHeadline(phrases: readonly string[]): string {
  const text = phrases.slice(0, 3).join(", ");
  return text.length > 90 ? text.slice(0, 87).trimEnd() + "..." : text;
}

/** Summary written by code: `They talked about ...` over the first three phrases. */
export function codeSummary(phrases: readonly string[]): string {
  if (phrases.length === 0) return "";
  const text = `They talked about ${joinList(phrases.slice(0, 3).map(lowerFirst))}.`;
  return text.length > 300 ? text.slice(0, 297).trimEnd() + "..." : text;
}
