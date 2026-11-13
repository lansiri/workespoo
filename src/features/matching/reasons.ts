import type { ChatMessage } from "@/lib/llm";
import type { EvidenceRef, JobMatchReason, MatchReasonsOutput } from "@/contracts";
import { findBannedEvaluative } from "@/lib/lexicon";
import { NOT_MENTIONED_MAX, REASON_BANNED_PATTERN, REASON_MAX_PER_POSTING, STATUTORY_SUFFIX } from "./constants";

/**
 * A (signal, posting sentence) pair the model may cite. Computed by code.
 * - `requirement`: the posting's Need Card has a requirement tied to that sentence and the signal touches it.
 * - `posting_skill`: the signal's ESCO skill is one the posting lists; the sentence is the first one naming it.
 * - `occupation`: the skill belongs to an occupation the posting is classed under. Code-rendered reasons only.
 */
export type AllowedPair = {
  signalId: string;
  /** 0-based index into `Job.sentences`, or null when no sentence names it. */
  sentence: number | null;
  via: "requirement" | "posting_skill" | "occupation";
  /** What the posting lists, in words: the requirement text or the ESCO label. */
  listed: string;
  escoUri?: string;
};

/** The signal data a reason may be built from. No handle, no transcript, no language. */
export type SignalForReason = {
  id: string;
  phrase: string;
  rendering: string | null;
  evidence: EvidenceRef | null;
};

const VIA_ORDER: Record<AllowedPair["via"], number> = { requirement: 0, posting_skill: 1, occupation: 2 };

const signalNumber = (id: string) => Number(id.replace(/\D/g, "")) || 0;

/** Stable order for pairs: how they were found, then signal number, then sentence. */
export function sortPairs(pairs: AllowedPair[]): AllowedPair[] {
  return [...pairs].sort(
    (a, b) =>
      VIA_ORDER[a.via] - VIA_ORDER[b.via] ||
      signalNumber(a.signalId) - signalNumber(b.signalId) ||
      (a.sentence ?? Number.MAX_SAFE_INTEGER) - (b.sentence ?? Number.MAX_SAFE_INTEGER),
  );
}

/** Remove duplicate (signal, sentence) pairs, keeping the first in sorted order. */
export function uniquePairs(pairs: AllowedPair[]): AllowedPair[] {
  const seen = new Set<string>();
  const out: AllowedPair[] = [];
  for (const p of sortPairs(pairs)) {
    const key = `${p.signalId}|${p.sentence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/** Pairs the model may be shown. Occupation pairs never go to the model. */
export const modelPairs = (pairs: AllowedPair[]) => pairs.filter((p) => p.via !== "occupation");

const label = (prefix: "S" | "P", value: string | number) =>
  prefix === "S" ? `S${signalNumber(String(value))}` : `P${value}`;

/** The system message of docs/specs/prompts/match-reasons.md, verbatim. */
export const REASONS_SYSTEM_PROMPT = `You explain to a person why a job posting might interest them. You write JSON only.

Rules:
1. Write in plain, friendly English. Short sentences. Address the person as "you".
2. You may ONLY use the pairs listed under "Allowed pairs". Each reason uses one pair: one signal id (like "S2") and its posting sentence id (like "P5", or null).
3. Write 1 to 3 reasons. Each reason is one sentence, at most 160 characters, in this shape:
   "Your card mentions <what the signal says>; the posting asks for <what the sentence asks>."
4. Describe, never judge. Do not praise or grade the person. Never use: strong, excellent, great, impressive, perfect, ideal, expert, talented, skilled, qualified, senior, junior, fit, match, best, top, highly, score, percent.
5. Do not say whether the person will get the job or is suitable. Do not give advice.
6. Do not invent facts. Use only the signal text and the sentence text given.
7. Pick pairs that cover different requirements when you can.`;

/**
 * The messages for one (person, posting) call. Inputs are exactly: the posting title, the
 * cited signals' phrases and renderings, the cited posting sentences, and the allowed pairs.
 */
export function buildReasonMessages(input: {
  title: string;
  signals: SignalForReason[];
  sentences: string[];
  pairs: AllowedPair[];
}): ChatMessage[] {
  const cited = modelPairs(input.pairs);
  const signalIds = new Set(cited.map((p) => p.signalId));
  const sentenceIdx = [...new Set(cited.flatMap((p) => (p.sentence === null ? [] : [p.sentence])))].sort(
    (a, b) => a - b,
  );
  const signalLines = input.signals
    .filter((s) => signalIds.has(s.id))
    .map((s) => `${label("S", s.id)}: ${s.phrase}.${s.rendering ? ` ${s.rendering}` : ""}`)
    .join("\n");
  const sentenceLines = sentenceIdx.map((i) => `${label("P", i)}: ${input.sentences[i] ?? ""}`).join("\n");
  const pairLines = cited
    .map((p) => `${label("S", p.signalId)}, ${p.sentence === null ? `null (ESCO: ${p.listed})` : label("P", p.sentence)}`)
    .join("\n");
  const user = `Posting title: ${input.title}

Your card (signals):
${signalLines}

Posting sentences you may cite:
${sentenceLines}

Allowed pairs (signal, sentence):
${pairLines}

Return JSON: {"reasons": [{"signal": "S1", "sentence": "P4", "text": "..."}]}`;
  return [
    { role: "system", content: REASONS_SYSTEM_PROMPT },
    { role: "user", content: user },
  ];
}

/** Why a model reason was dropped. Used for the guard note on the call log and in tests. */
export type DropCause = "pair_not_allowed" | "banned_wording" | "duplicate_signal";

/**
 * Code checks 1 to 3 of match-reasons.md: drop a reason whose pair is not allowed, one with
 * banned wording or a fraction or percentage, and repeats of the same signal. Check 5 (store
 * the evidence reference) is applied here too. Returns what survived, in model order.
 */
export function checkModelReasons(
  output: MatchReasonsOutput,
  pairs: AllowedPair[],
  signals: SignalForReason[],
): { reasons: JobMatchReason[]; dropped: DropCause[] } {
  const allowed = modelPairs(pairs);
  const bySignal = new Map(signals.map((s) => [s.id, s]));
  const used = new Set<string>();
  const dropped: DropCause[] = [];
  const reasons: JobMatchReason[] = [];
  for (const r of output.reasons) {
    const signalId = r.signal.toLowerCase();
    const sentence = r.sentence === null ? null : Number(r.sentence.slice(1));
    const pair = allowed.find((p) => p.signalId === signalId && p.sentence === sentence);
    const signal = bySignal.get(signalId);
    if (!pair || !signal) {
      dropped.push("pair_not_allowed");
      continue;
    }
    if (REASON_BANNED_PATTERN.test(r.text) || findBannedEvaluative(r.text).length > 0) {
      dropped.push("banned_wording");
      continue;
    }
    if (used.has(signalId)) {
      dropped.push("duplicate_signal");
      continue;
    }
    used.add(signalId);
    reasons.push({
      text: r.text.trim(),
      signalId,
      evidence: signal.evidence,
      postingSentence: pair.sentence,
      ...(pair.escoUri ? { escoUri: pair.escoUri } : {}),
    });
    if (reasons.length === REASON_MAX_PER_POSTING) break;
  }
  return { reasons, dropped };
}

/**
 * The code-rendered reason: one line, no model. "Your card mentions {phrase}. This posting
 * lists {label}." For an occupation link the second sentence says what the kind of work involves.
 */
export function codeReason(pairs: AllowedPair[], signals: SignalForReason[]): JobMatchReason | null {
  const bySignal = new Map(signals.map((s) => [s.id, s]));
  for (const pair of sortPairs(pairs)) {
    const signal = bySignal.get(pair.signalId);
    if (!signal) continue;
    const tail =
      pair.via === "occupation"
        ? `This kind of work usually involves ${pair.listed}.`
        : `This posting lists ${pair.listed}.`;
    return {
      text: `Your card mentions ${signal.phrase}. ${tail}`.slice(0, 200),
      signalId: signal.id,
      evidence: signal.evidence,
      postingSentence: pair.sentence,
      ...(pair.escoUri ? { escoUri: pair.escoUri } : {}),
    };
  }
  return null;
}

/**
 * "Not mentioned in your conversation" items: requirements of the posting's Need Card that
 * the card does not touch, must first then nice, in posting order, at most five. A statutory
 * requirement carries the English suffix `STATUTORY_SUFFIX`, which the page localises.
 */
export function notMentionedItems(
  requirements: Array<{ id: string; text: string; kind: "must" | "nice"; statutory: string }>,
  touchedIds: ReadonlySet<string>,
): string[] {
  const rest = requirements.filter((r) => !touchedIds.has(r.id));
  const ordered = [...rest.filter((r) => r.kind === "must"), ...rest.filter((r) => r.kind === "nice")];
  return ordered
    .slice(0, NOT_MENTIONED_MAX)
    .map((r) =>
      r.statutory !== "none" ? `${r.text.slice(0, 200 - STATUTORY_SUFFIX.length)}${STATUTORY_SUFFIX}` : r.text.slice(0, 200),
    );
}

/** Split a stored not-mentioned item into its text and whether it was statutory. */
export function splitNotMentioned(item: string): { text: string; statutory: boolean } {
  return item.endsWith(STATUTORY_SUFFIX)
    ? { text: item.slice(0, -STATUTORY_SUFFIX.length), statutory: true }
    : { text: item, statutory: false };
}
