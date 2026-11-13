import { and, desc, eq } from "drizzle-orm";
import {
  SignalCard,
  type EvidenceRef,
  type InputMode,
  type Signal,
  type SignalCardStatus,
  type SignalKind,
} from "@/contracts";
import type { Db } from "@/db/client";
import { interview, signalCard, turn } from "@/db/schema";
import { renderEvidence } from "@/lib/sentences";

export type TranscriptTurn = {
  index: number;
  kind: string;
  sentences: string[];
  lang: string | null;
  inputMode: InputMode | null;
  redacted: boolean;
};

export type Transcript = Map<number, TranscriptTurn>;

/** The person's most recent interview, which their card's evidence points into. */
export async function latestInterview(db: Db, talentId: string) {
  const [row] = await db
    .select()
    .from(interview)
    .where(eq(interview.talentId, talentId))
    .orderBy(desc(interview.startedAt), desc(interview.id))
    .limit(1);
  return row ?? null;
}

/** Participant turns of one interview by turn index, redacted ones flagged. */
export async function loadTranscript(db: Db, interviewId: string): Promise<Transcript> {
  const rows = await db
    .select()
    .from(turn)
    .where(and(eq(turn.interviewId, interviewId), eq(turn.role, "participant")))
    .orderBy(turn.index);
  return new Map(
    rows.map((r) => [
      r.index,
      {
        index: r.index,
        kind: r.kind,
        sentences: r.sentences,
        lang: r.lang,
        inputMode: r.inputMode,
        redacted: r.redactedAt !== null,
      },
    ]),
  );
}

export async function loadCard(db: Db, talentId: string, status: SignalCardStatus): Promise<SignalCard | null> {
  const [row] = await db
    .select()
    .from(signalCard)
    .where(and(eq(signalCard.talentId, talentId), eq(signalCard.status, status)));
  return row ? SignalCard.parse(row.body) : null;
}

/** Validate and write a card row (one per talent and status). */
export async function saveCard(db: Db, talentId: string, card: SignalCard): Promise<void> {
  const body = SignalCard.parse(card);
  const approvedAt = body.approvedAt ? new Date(body.approvedAt) : null;
  await db
    .insert(signalCard)
    .values({ talentId, status: body.status, version: body.version, body, approvedAt })
    .onConflictDoUpdate({
      target: [signalCard.talentId, signalCard.status],
      set: { version: body.version, body, approvedAt, updatedAt: new Date() },
    });
}

/** Resolve evidence against the stored transcript: the turn must exist, be unredacted, and the range in bounds. */
export function resolvable(ref: EvidenceRef, transcript: Transcript): boolean {
  const t = transcript.get(ref.turnIndex);
  return !!t && !t.redacted && renderEvidence(t.sentences, ref.sentenceFrom, ref.sentenceTo) !== null;
}

/** The person's words behind a signal, rendered by code from the stored sentences. */
export function quotesFor(evidence: readonly EvidenceRef[], transcript: Transcript): string[] {
  const quotes: string[] = [];
  for (const ref of evidence) {
    const t = transcript.get(ref.turnIndex);
    if (!t || t.redacted) continue;
    const text = renderEvidence(t.sentences, ref.sentenceFrom, ref.sentenceTo);
    if (text) quotes.push(text);
  }
  return quotes;
}

const GROUP_ORDER: Record<SignalKind, number> = { skill: 0, tool: 1, knowledge: 2, domain: 3 };

const idNumber = (id: string) => Number(id.slice(1));

/**
 * The fixed order of the card: group (what I do, tools, know-how, fields), then the first
 * evidence turn, then id. Never by anything that implies strength.
 */
export function orderSignals<T extends Pick<Signal, "id" | "kind" | "evidence">>(signals: readonly T[]): T[] {
  const firstTurn = (s: T) => (s.evidence.length ? Math.min(...s.evidence.map((e) => e.turnIndex)) : Infinity);
  return [...signals].sort(
    (a, b) =>
      GROUP_ORDER[a.kind] - GROUP_ORDER[b.kind] ||
      (firstTurn(a) === firstTurn(b) ? 0 : firstTurn(a) < firstTurn(b) ? -1 : 1) ||
      idNumber(a.id) - idNumber(b.id),
  );
}
