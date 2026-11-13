import { EscoPickOutput, type EscoRef, type SignalKind } from "@/contracts";
import type { Db } from "@/db/client";
import { escoCandidates, escoTopMatch, type EscoCandidate } from "@/lib/esco";
import { chatJson } from "@/lib/llm";

/** Prompt C (card-synthesis.md section C): the model chooses among ESCO candidates by meaning. */
export const ESCO_PICK_SYSTEM_PROMPT = `You match skill phrases to entries in the ESCO skills list. For each item choose the candidate number that means the same thing, or a clearly matching slightly broader or narrower skill. Choose 0 if none fits. Do not guess. A candidate that only shares a word or looks similar does not fit: "React" is not "react to mining emergencies" and "Excel" is not "demand excellence from performers". Output JSON only.

OUTPUT FORMAT
{"picks":[{"i":0,"choice":2}]}`;

export const ESCO_CANDIDATES_PER_SIGNAL = 6;
export const ESCO_MIN_CANDIDATE_SIMILARITY = 0.3;
export const ESCO_PICK_DEADLINE_MS = 15_000;

export type PickItem = { key: string; phrase: string; kind: SignalKind };

const toRef = (c: EscoCandidate): EscoRef => ({ uri: c.uri, labelEn: c.labelEn, labelFi: c.labelFi });

/** What the model sees: phrases and candidate labels only, never the transcript or the person. */
export function buildEscoPickMessages(items: ReadonlyArray<{ phrase: string; kind: SignalKind; candidates: readonly EscoCandidate[] }>) {
  const blocks = items
    .map((it, i) => `i=${i} | phrase: ${it.phrase} | kind: ${it.kind}\n${it.candidates.map((c, n) => `${n + 1}. ${c.labelEn}`).join("\n")}\n0. none`)
    .join("\n\n");
  return [
    { role: "system" as const, content: ESCO_PICK_SYSTEM_PROMPT },
    { role: "user" as const, content: `${blocks}\n\nReturn the JSON now.` },
  ];
}

/**
 * ESCO labels for a card's signals with one model call for the whole card (never one per signal).
 * Signals without a candidate get no label and are left out of the call; no call when none has a
 * candidate. A failed or late call falls back to the strict text match for each signal.
 */
export async function pickEscoLabels(db: Db, items: readonly PickItem[]): Promise<Map<string, EscoRef | null>> {
  const out = new Map<string, EscoRef | null>();
  const asked: Array<PickItem & { candidates: EscoCandidate[] }> = [];
  for (const it of items) {
    out.set(it.key, null);
    let candidates: EscoCandidate[] = [];
    try {
      candidates = (await escoCandidates(db, it.phrase, { type: "skill", limit: ESCO_CANDIDATES_PER_SIGNAL })).filter(
        (c) => c.similarity >= ESCO_MIN_CANDIDATE_SIMILARITY,
      );
    } catch {
      candidates = [];
    }
    if (candidates.length > 0) asked.push({ ...it, candidates });
  }
  if (asked.length === 0) return out;

  let picks: Array<{ i: number; choice: number }> | null = null;
  try {
    picks = (
      await chatJson({
        role: "analyst",
        purpose: "card.esco_pick",
        messages: buildEscoPickMessages(asked),
        schema: EscoPickOutput,
        temperature: 0,
        maxTokens: 400,
        deadlineMs: ESCO_PICK_DEADLINE_MS,
        db,
      })
    ).data?.picks ?? null;
  } catch {
    picks = null;
  }

  if (picks === null) {
    for (const it of asked) {
      try {
        out.set(it.key, await escoTopMatch(db, it.phrase));
      } catch {
        out.set(it.key, null);
      }
    }
    return out;
  }
  const seen = new Set<number>();
  for (const p of picks) {
    if (seen.has(p.i)) continue;
    seen.add(p.i);
    const it = asked[p.i];
    const chosen = it && p.choice >= 1 ? it.candidates[p.choice - 1] : undefined;
    if (it) out.set(it.key, chosen ? toRef(chosen) : null);
  }
  return out;
}
