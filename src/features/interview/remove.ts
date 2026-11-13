/**
 * Removing an answer (docs/specs/interview.md 6.2 and 6.3): the turn's words are blanked, the
 * signals it supported lose that evidence, and a signal left with none is removed.
 */
import { and, eq } from "drizzle-orm";
import { toSignalPublic, type CoverageArea } from "@/contracts";
import type { Db } from "@/db/client";
import { signal as signalTable, turn as turnTable } from "@/db/schema";
import { audit } from "@/lib/audit";
import { publishEvent } from "./events";
import { nowMs, withLock } from "./runtime";
import { loadSignalRows, mutateState, rowToSignal } from "./store";

export type Redaction = {
  /** The area the removed answer was given to. */
  target: CoverageArea | null;
  signalsChanged: number;
  signalsRemoved: number;
};

/**
 * Blank participant turn `turnIndex`. Returns null if there is no such answer or it is already
 * removed. Runs under the extraction lock, so an extraction in flight cannot add the turn back:
 * the merge skips redacted turns.
 */
export async function redactTurn(
  db: Db,
  talentId: string,
  interviewId: string,
  turnIndex: number,
): Promise<Redaction | null> {
  return withLock(`${interviewId}#extract`, async () => {
    const [row] = await db
      .select()
      .from(turnTable)
      .where(and(eq(turnTable.interviewId, interviewId), eq(turnTable.index, turnIndex)))
      .limit(1);
    if (!row || row.role !== "participant" || row.redactedAt !== null) return null;

    // Keep the sentence count so every other label stays stable; the words go.
    await db
      .update(turnTable)
      .set({
        text: "",
        sentences: row.sentences.map(() => ""),
        sentencesOriginal: null,
        redactedAt: new Date(nowMs()),
      })
      .where(and(eq(turnTable.interviewId, interviewId), eq(turnTable.index, turnIndex)));

    const signals = (await loadSignalRows(db, talentId)).filter(
      (s) => s.interviewId === interviewId && s.status !== "removed" && s.evidence.some((e) => e.turnIndex === turnIndex),
    );
    const removedIds: string[] = [];
    const changed = [];
    for (const s of signals) {
      const evidence = s.evidence.filter((e) => e.turnIndex !== turnIndex);
      const gone = evidence.length === 0;
      // Nothing is claimed without its sentence: an example flag is dropped with evidence it may have rested on.
      const [updated] = await db
        .update(signalTable)
        .set({ evidence, hasExample: false, status: gone ? "removed" : s.status, updatedAt: new Date() })
        .where(and(eq(signalTable.talentId, talentId), eq(signalTable.id, s.id)))
        .returning();
      if (gone) removedIds.push(s.id);
      if (updated) changed.push(updated);
    }

    await mutateState(db, interviewId, (state) => ({
      ...state,
      lastNote: "",
      lastExtracted: (state.lastExtracted ?? []).filter((id) => !removedIds.includes(id)),
    }));
    for (const s of changed) {
      await publishEvent(db, interviewId, { type: "signal.updated", signal: toSignalPublic(rowToSignal(s)) });
    }
    await audit(db, {
      actor: `talent:${talentId}`,
      action: "interview.turn_redacted",
      subjectType: "interview",
      subjectId: interviewId,
      detail: { turnIndex, signalsChanged: changed.length, signalsRemoved: removedIds.length },
    });
    return { target: row.target, signalsChanged: changed.length, signalsRemoved: removedIds.length };
  });
}
