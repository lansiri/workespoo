import type { ApplicationPlan, ApplicationTurn, EvidenceRef } from "@/contracts";
import type { applicationTurn } from "@/db/schema";

/**
 * Small readers shared by the assessment and the organiser's evidence view: which questions
 * were asked about a requirement, and which stored answers are about it.
 */

export const LEFT_OUT = "[left out]";

type TurnRow = typeof applicationTurn.$inferSelect;

/** A stored turn as the contract's `ApplicationTurn`. */
export function toApplicationTurn(row: TurnRow): ApplicationTurn {
  return {
    id: row.id,
    applicationId: row.applicationId,
    index: row.index,
    role: row.role,
    kind: row.kind,
    requirementId: row.requirementId,
    text: row.text,
    sentences: row.sentences,
    inputMode: row.inputMode,
    removedAt: row.removedAt ? row.removedAt.toISOString() : null,
    at: row.at.toISOString(),
  };
}

/**
 * The interviewer's questions about one requirement, in order. For the opening only the
 * question part is kept: the plan's question, not the greeting.
 */
export function questionsAbout(plan: ApplicationPlan, turns: readonly ApplicationTurn[], requirementId: string): string[] {
  const planned = plan.requirements.find((r) => r.requirementId === requirementId)?.question ?? null;
  const out: string[] = [];
  for (const t of turns) {
    if (t.role !== "interviewer" || t.requirementId !== requirementId) continue;
    if (t.kind === "opening") {
      if (planned) out.push(planned);
    } else if (t.kind === "question") {
      out.push(planned && t.text.includes(planned) ? planned : t.text.trim());
    } else if (t.kind === "follow_up") {
      out.push(t.text.trim());
    }
  }
  return [...new Set(out.filter((q) => q.length > 0))];
}

/** The person's stored answers about one requirement that have not been removed. */
export function answersAbout(turns: readonly ApplicationTurn[], requirementId: string): ApplicationTurn[] {
  return turns.filter((t) => t.role === "participant" && t.requirementId === requirementId && t.removedAt === null && t.sentences.length > 0);
}

/** Every sentence a reference covers, as `{ turnIndex, sentence }`, sentence 1-based. */
export function expandRefs(refs: readonly EvidenceRef[]): Array<{ turnIndex: number; sentence: number }> {
  const out: Array<{ turnIndex: number; sentence: number }> = [];
  for (const r of refs) {
    for (let s = r.sentenceFrom; s <= r.sentenceTo; s++) out.push({ turnIndex: r.turnIndex, sentence: s });
  }
  return out;
}

