/** Database access for the interview engine. Rows in, contract types out. */
import { and, asc, eq, ne, sql } from "drizzle-orm";
import {
  InterviewState,
  type CoverageArea,
  type EvidenceRef,
  type Interview,
  type Signal,
  type Turn,
} from "@/contracts";
import type { Db } from "@/db/client";
import { interview, signal, turn } from "@/db/schema";

type InterviewRow = typeof interview.$inferSelect;
type TurnRow = typeof turn.$inferSelect;
type SignalRow = typeof signal.$inferSelect;

export function readState(row: Pick<InterviewRow, "state">): InterviewState {
  return row.state as InterviewState;
}

export async function loadInterview(db: Db, id: string): Promise<InterviewRow | null> {
  const [row] = await db.select().from(interview).where(eq(interview.id, id)).limit(1);
  return row ?? null;
}

export function toInterview(row: InterviewRow): Interview {
  return {
    id: row.id,
    talentId: row.talentId,
    mode: row.mode,
    lang: row.lang,
    status: row.status,
    state: InterviewState.parse(row.state),
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export function toTurn(row: TurnRow): Turn {
  return {
    id: row.id,
    interviewId: row.interviewId,
    index: row.index,
    role: row.role,
    kind: row.kind,
    target: row.target,
    text: row.text,
    sentences: row.sentences,
    sentencesOriginal: row.sentencesOriginal,
    lang: row.lang,
    inputMode: row.inputMode,
    redactedAt: row.redactedAt ? row.redactedAt.toISOString() : null,
    at: row.at.toISOString(),
  };
}

export async function loadTurns(db: Db, interviewId: string): Promise<TurnRow[]> {
  return db.select().from(turn).where(eq(turn.interviewId, interviewId)).orderBy(asc(turn.index));
}

export function rowToSignal(row: SignalRow): Signal {
  return {
    id: row.id,
    phrase: row.phrase,
    phraseOwn: row.phraseOwn,
    kind: row.kind,
    esco: row.escoUri
      ? { uri: row.escoUri, labelEn: row.escoLabelEn ?? row.phrase, labelFi: row.escoLabelFi }
      : null,
    evidence: row.evidence as EvidenceRef[],
    hasExample: row.hasExample,
    status: row.status,
    addedBy: row.addedBy,
  };
}

/** Every signal row of the talent, in id order of creation, with any status. */
export async function loadSignalRows(db: Db, talentId: string): Promise<SignalRow[]> {
  return db.select().from(signal).where(eq(signal.talentId, talentId)).orderBy(asc(signal.createdAt));
}

export async function countLiveSignals(db: Db, interviewId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(signal)
    .where(and(eq(signal.interviewId, interviewId), ne(signal.status, "removed")));
  return row?.n ?? 0;
}

/** Areas that an interviewer question has targeted, derived from the stored turns. */
export function askedTargetsOf(turns: readonly Pick<Turn, "role" | "kind" | "target">[]): Set<CoverageArea> {
  const asked = new Set<CoverageArea>();
  for (const t of turns) {
    if (t.role === "interviewer" && t.target && (t.kind === "opening" || t.kind === "question" || t.kind === "probe")) {
      asked.add(t.target);
    }
  }
  return asked;
}

/** Read-modify-write the interview's state under a row lock. */
export async function mutateState(
  db: Db,
  interviewId: string,
  change: (state: InterviewState) => InterviewState,
  extra?: Partial<Pick<InterviewRow, "status" | "completedAt" | "lang">>,
): Promise<InterviewState> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ state: interview.state })
      .from(interview)
      .where(eq(interview.id, interviewId))
      .for("update");
    if (!row) throw new Error(`interview ${interviewId} not found`);
    const next = change(structuredClone(row.state as InterviewState));
    await tx
      .update(interview)
      .set({ state: next, ...extra })
      .where(eq(interview.id, interviewId));
    return next;
  });
}
