/** Read models for the interview pages and the dev test page. Server only. */
import { and, desc, inArray, ne, sql } from "drizzle-orm";
import type { CoverageArea, CoverageStatus, InterviewMode, InterviewStatus, SignalPublic, UiLang } from "@/contracts";
import { toSignalPublic } from "@/contracts";
import type { Db } from "@/db/client";
import { interview, signal } from "@/db/schema";
import { loadInterview, loadSignalRows, loadTurns, readState, rowToSignal } from "./store";

export type TranscriptLine = { index: number; role: "interviewer" | "participant"; text: string };

export type InterviewView = {
  interviewId: string;
  talentId: string;
  mode: InterviewMode;
  uiLang: UiLang;
  status: InterviewStatus;
  /** The closing line was sent: no more turns are accepted. */
  ended: boolean;
  transcript: TranscriptLine[];
  signals: SignalPublic[];
  coverage: Partial<Record<CoverageArea, CoverageStatus>>;
};

/** Everything the interview page needs to render, loaded on the server. */
export async function loadInterviewView(db: Db, interviewId: string): Promise<InterviewView | null> {
  const row = await loadInterview(db, interviewId);
  if (!row) return null;
  const state = readState(row);
  const turns = await loadTurns(db, interviewId);
  const signals = (await loadSignalRows(db, row.talentId))
    .filter((s) => s.interviewId === interviewId && s.status !== "removed")
    .map((s) => toSignalPublic(rowToSignal(s)));
  return {
    interviewId,
    talentId: row.talentId,
    mode: row.mode,
    uiLang: state.uiLang,
    status: row.status,
    ended: row.status !== "active" || state.stage === "closing" || state.stage === "synthesising",
    transcript: turns
      .filter((t) => t.redactedAt === null && t.text !== "")
      .map((t) => ({ index: t.index, role: t.role, text: t.text })),
    signals,
    coverage: state.coverage,
  };
}

export type InterviewListItem = {
  id: string;
  mode: InterviewMode;
  status: InterviewStatus;
  questionsAsked: number;
  topicsTouched: number;
  topicsTotal: number;
  signalCount: number;
  startedAt: string;
};

/** The organiser test page: recent interviews, newest first (the only ordering used). */
export async function listRecentInterviews(db: Db, limit = 50): Promise<InterviewListItem[]> {
  const rows = await db.select().from(interview).orderBy(desc(interview.startedAt)).limit(limit);
  if (rows.length === 0) return [];
  const counts = await db
    .select({ interviewId: signal.interviewId, n: sql<number>`count(*)::int` })
    .from(signal)
    .where(and(inArray(signal.interviewId, rows.map((r) => r.id)), ne(signal.status, "removed")))
    .groupBy(signal.interviewId);
  const byInterview = new Map(counts.map((c) => [c.interviewId, c.n]));
  return rows.map((r) => {
    const state = readState(r);
    const areas = Object.values(state.coverage);
    return {
      id: r.id,
      mode: r.mode,
      status: r.status,
      questionsAsked: state.questionsAsked,
      topicsTouched: areas.filter((s) => s !== "open").length,
      topicsTotal: areas.length,
      signalCount: byInterview.get(r.id) ?? 0,
      startedAt: r.startedAt.toISOString(),
    };
  });
}

