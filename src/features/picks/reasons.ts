import { sql } from "drizzle-orm";
import { PicksDraftOutput, type NeedCard, type PickReason, type SignalCard } from "@/contracts";
import type { Db } from "@/db/client";
import { chatJson, llmConfigured } from "@/lib/llm";
import { findBannedEvaluative } from "@/lib/lexicon";
import { rowsOf } from "@/lib/sql";
import { MAX_REASONS, REASONS_DEADLINE_MS, REASON_MAX_CHARS, TOUCH_SIMILARITY } from "./constants";

/** One (requirement, signal) pair the model may cite. Computed by code, never by the model. */
export type AllowedPair = { requirementId: string; signalId: string };

type Requirement = NeedCard["requirements"][number];
type CardSignal = SignalCard["signals"][number];

export const PICKS_SYSTEM_PROMPT = `You explain to an employer why one anonymous card from a talent pool relates to their need. You write JSON only.

Rules:
1. Write plain English. Short sentences. Refer to the person only as "the card" or "this person". Never use he, she, him or her.
2. You may ONLY use the pairs listed under "Allowed pairs". Each reason uses one pair: one requirement id (like "R3") and one signal id (like "S2").
3. Write 2 or 3 reasons if at least 2 pairs exist, otherwise 1. Each reason is one sentence, at most 130 characters, in this shape:
   "The card describes <what the signal says>, which relates to <the requirement>."
4. Describe, never judge. Do not praise, grade or compare the person. Never use: strong, excellent, great, impressive, perfect, ideal, expert, talented, skilled, qualified, senior, junior, fit, match, best, top, highly, recommend, score, percent.
5. Do not say whether the person meets the requirement in full. Do not mention years, levels or fluency unless the signal text says them.
6. Do not mention anything that is not in the signal text. Do not guess age, background, nationality or language.
7. Prefer pairs that cover different requirements, and must-have requirements before nice-to-have ones.`;

/** Signals of the approved card, which are the only ones a reason may rest on. */
export function approvedSignals(card: SignalCard): CardSignal[] {
  return card.signals.filter((s) => s.status === "approved");
}

/**
 * Every (requirement, signal) pair where the requirement is one the card speaks to and the
 * signal is what made it so: the signal's ESCO skill is one of the requirement's, or its
 * phrase is trigram-similar to the requirement text (matching.md 3.1). A language
 * requirement that rests only on a self-declared work language has no signal, so it has no pair.
 */
export async function computeAllowedPairs(
  db: Db,
  need: NeedCard,
  touched: ReadonlySet<string>,
  card: SignalCard,
): Promise<AllowedPair[]> {
  const requirements = need.requirements.filter((r) => touched.has(r.id));
  const signals = approvedSignals(card);
  if (requirements.length === 0 || signals.length === 0) return [];

  const result = await db.execute(sql`
    select r.rid as rid, s.sid as sid
    from jsonb_to_recordset(${JSON.stringify(requirements.map((r) => ({ rid: r.id, txt: r.text })))}::jsonb) as r(rid text, txt text)
    cross join jsonb_to_recordset(${JSON.stringify(signals.map((s) => ({ sid: s.id, phrase: s.phrase })))}::jsonb) as s(sid text, phrase text)
    where word_similarity(r.txt, s.phrase) >= ${TOUCH_SIMILARITY}::real`);
  const byText = new Set(rowsOf<{ rid: string; sid: string }>(result).map((row) => `${row.rid}|${row.sid}`));

  const pairs: AllowedPair[] = [];
  for (const r of requirements) {
    const uris = new Set(r.escoSkillUris);
    for (const s of signals) {
      if ((s.esco && uris.has(s.esco.uri)) || byText.has(`${r.id}|${s.id}`)) {
        pairs.push({ requirementId: r.id, signalId: s.id });
      }
    }
  }
  return pairs;
}

/** Requirements the card does not speak to, in the need's own order. */
export function notMentionedIds(need: NeedCard, touched: ReadonlySet<string>): string[] {
  return need.requirements.filter((r) => !touched.has(r.id)).map((r) => r.id);
}

/** Must-haves first, then nice-to-haves, each in posting order. Stable. */
export function mustFirst(requirements: readonly Requirement[]): Requirement[] {
  return [...requirements.filter((r) => r.kind === "must"), ...requirements.filter((r) => r.kind !== "must")];
}

const clip = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

function makeReason(requirement: Requirement, signal: CardSignal, text: string): PickReason {
  return {
    text: clip(text, REASON_MAX_CHARS),
    requirementId: requirement.id,
    signalId: signal.id,
    evidence: signal.evidence[0] ?? null,
    postingSentence: requirement.postingSentence,
  };
}

/**
 * Reasons rendered by code: one per requirement, up to three, preferring distinct signals
 * and must-haves first. No model involved.
 */
export function codeReasons(need: NeedCard, card: SignalCard, pairs: readonly AllowedPair[]): PickReason[] {
  const signals = new Map(approvedSignals(card).map((s) => [s.id, s]));
  const reasons: PickReason[] = [];
  const usedSignals = new Set<string>();
  for (const requirement of mustFirst(need.requirements)) {
    if (reasons.length >= MAX_REASONS) break;
    const options = pairs.filter((p) => p.requirementId === requirement.id);
    if (options.length === 0) continue;
    const chosen = options.find((p) => !usedSignals.has(p.signalId)) ?? options[0];
    const signal = signals.get(chosen.signalId);
    if (!signal) continue;
    usedSignals.add(signal.id);
    const requirementText = clip(requirement.text, 90);
    reasons.push(
      makeReason(requirement, signal, `The card describes ${signal.phrase}, which relates to ${requirementText}.`),
    );
  }
  return reasons;
}

/** Wording the lexicon does not cover: pronouns, grading and recommending words, percentages and ratios. */
const JUDGEMENT_RE =
  /\b(he|she|him|her|his|hers|ideal|qualified|fit|match(?:es|ed)?|best|top|highly|recommend(?:ed)?|percent)\b|%|\d+\s*\/\s*\d+/i;

/** True when a model-written reason is acceptable to show an employer (picks-draft.md check 2). */
export function reasonTextAllowed(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (JUDGEMENT_RE.test(trimmed)) return false;
  return findBannedEvaluative(trimmed).length === 0;
}

export type ReasonPrompt = {
  messages: Array<{ role: "system" | "user"; content: string }>;
  /** `R<n>` label to requirement id. */
  requirementByLabel: Map<string, string>;
  /** `S<n>` label to signal id (local to this call). */
  signalByLabel: Map<string, string>;
};

/** The user message of picks-draft.md. Carries no transcript, name, handle, language or input mode. */
export function buildReasonPrompt(need: NeedCard, card: SignalCard, pairs: readonly AllowedPair[]): ReasonPrompt {
  const requirementByLabel = new Map<string, string>();
  need.requirements.forEach((r, i) => requirementByLabel.set(`R${i + 1}`, r.id));
  const labelOfRequirement = new Map(need.requirements.map((r, i) => [r.id, `R${i + 1}`]));

  const signals = new Map(approvedSignals(card).map((s) => [s.id, s]));
  const touchingIds: string[] = [];
  for (const p of pairs) if (!touchingIds.includes(p.signalId)) touchingIds.push(p.signalId);
  const signalByLabel = new Map<string, string>();
  touchingIds.forEach((id, i) => signalByLabel.set(`S${i + 1}`, id));
  const labelOfSignal = new Map(touchingIds.map((id, i) => [id, `S${i + 1}`]));

  const renderings = new Map(card.companyView.items.map((i) => [i.signalId, i.text]));
  const orderedPairs = mustFirst(need.requirements).flatMap((r) =>
    pairs.filter((p) => p.requirementId === r.id),
  );

  const user = [
    `Need: ${need.title}`,
    need.summary,
    "",
    "Requirements:",
    ...need.requirements.map((r, i) => `R${i + 1} (${r.kind}): ${r.text}`),
    "",
    "Card signals (English renderings):",
    ...touchingIds.map((id) => {
      const s = signals.get(id)!;
      const rendering = renderings.get(id);
      return `${labelOfSignal.get(id)}: ${s.phrase}.${rendering ? ` ${rendering}` : ""}`;
    }),
    "",
    "Allowed pairs (requirement, signal):",
    ...orderedPairs.map((p) => `${labelOfRequirement.get(p.requirementId)}, ${labelOfSignal.get(p.signalId)}`),
    "",
    'Return JSON: {"reasons": [{"req": "R1", "signal": "S1", "text": "..."}]}',
  ].join("\n");

  return {
    messages: [
      { role: "system", content: PICKS_SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    requirementByLabel,
    signalByLabel,
  };
}

/** Apply every code check of picks-draft.md to a parsed model output. May return an empty list. */
export function checkModelReasons(
  output: PicksDraftOutput,
  prompt: ReasonPrompt,
  need: NeedCard,
  card: SignalCard,
  pairs: readonly AllowedPair[],
): PickReason[] {
  const allowed = new Set(pairs.map((p) => `${p.requirementId}|${p.signalId}`));
  const requirements = new Map(need.requirements.map((r) => [r.id, r]));
  const signals = new Map(approvedSignals(card).map((s) => [s.id, s]));
  const seen = new Set<string>();
  const reasons: PickReason[] = [];
  for (const item of output.reasons) {
    const requirementId = prompt.requirementByLabel.get(item.req);
    const signalId = prompt.signalByLabel.get(item.signal);
    if (!requirementId || !signalId) continue;
    if (!allowed.has(`${requirementId}|${signalId}`)) continue;
    if (!reasonTextAllowed(item.text)) continue;
    if (seen.has(requirementId)) continue;
    const requirement = requirements.get(requirementId);
    const signal = signals.get(signalId);
    if (!requirement || !signal) continue;
    seen.add(requirementId);
    reasons.push(makeReason(requirement, signal, item.text.trim()));
    if (reasons.length >= MAX_REASONS) break;
  }
  return reasons;
}

/**
 * The reasons for one pick: the model words them from the allowed pairs, code checks every
 * one, and code renders them when the model is unavailable or nothing survives.
 */
export async function writeReasons(
  db: Db,
  need: NeedCard,
  card: SignalCard,
  pairs: readonly AllowedPair[],
): Promise<{ reasons: PickReason[]; source: "model" | "code" }> {
  if (pairs.length === 0) return { reasons: [], source: "code" };
  if (llmConfigured("analyst")) {
    try {
      const prompt = buildReasonPrompt(need, card, pairs);
      const result = await chatJson({
        role: "analyst",
        purpose: "picks.reasons",
        messages: prompt.messages,
        temperature: 0.2,
        schema: PicksDraftOutput,
        deadlineMs: REASONS_DEADLINE_MS,
        db,
      });
      if (result.data) {
        const reasons = checkModelReasons(result.data, prompt, need, card, pairs);
        if (reasons.length > 0) return { reasons, source: "model" };
      }
    } catch (error) {
      console.error("[picks] reason call failed, using code-rendered reasons:", error instanceof Error ? error.message : String(error));
    }
  }
  return { reasons: codeReasons(need, card, pairs), source: "code" };
}
