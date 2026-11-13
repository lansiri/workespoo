/**
 * The interview engine: start, one turn end to end, stop, settle.
 * Flow per participant turn follows docs/specs/interview.md section 6 in order.
 */
import { eq, max } from "drizzle-orm";
import {
  TURN_MAX_STORED_CHARS,
  initialInterviewState,
  type CoverageArea,
  type InterviewEvent,
  type InterviewState,
  type StartInterviewRequest,
  type StartInterviewResponse,
  type TurnKind,
  type TurnRequest,
  type UiLang,
} from "@/contracts";
import type { Db } from "@/db/client";
import { talent, turn as turnTable, interview as interviewTable } from "@/db/schema";
import { synthesiseCard } from "@/features/card";
import { audit } from "@/lib/audit";
import { recordConsent } from "@/lib/consent";
import { getEnv } from "@/lib/env";
import { HttpError } from "@/lib/http";
import {
  FALLBACK_QUESTIONS,
  GENERIC_PROBE,
  INTERVIEW_LINES,
  PROBE_QUESTIONS,
} from "@/lib/i18n/content/interview-lines";
import { newHandle, newId } from "@/lib/ids";
import { chatStream, type LlmOptions } from "@/lib/llm";
import { splitSentences } from "@/lib/sentences";
import { preCheck, wordCount } from "./commands";
import { seedsFromCv } from "./cv-seed";
import { runExtraction } from "./extractor";
import { publishEvent } from "./events";
import { guardStream, type GuardResult } from "./guard";
import { detectLang, isUiLang } from "./lang";
import { planNext, type Plan } from "./planner";
import { redactTurn } from "./remove";
import { buildLivePrompt, type LiveTarget, type Situation } from "./prompts";
import {
  acquireLock,
  nowMs,
  runtime,
  track,
  waitForPending,
} from "./runtime";
import {
  askedTargetsOf,
  countLiveSignals,
  loadInterview,
  loadSignalRows,
  loadTurns,
  mutateState,
  readState,
  toTurn,
} from "./store";

/** How long a turn waits for the previous answer's extraction before planning without it. */
export const PREVIOUS_EXTRACTION_WAIT_MS = 2000;
/** How long ending the interview waits for outstanding extraction before synthesis. */
export const FINISH_EXTRACTION_WAIT_MS = 8000;
export const SETTLE_DEFAULT_TIMEOUT_MS = 30_000;
/** The live reply must start within this, gateway wait and retries included (patch IL-2). */
export const LIVE_DEADLINE_MS = 6000;

type InterviewRow = NonNullable<Awaited<ReturnType<typeof loadInterview>>>;
type TurnRow = Awaited<ReturnType<typeof loadTurns>>[number];

/* ------------------------------------------------------------------------------------------
 * Start
 * ---------------------------------------------------------------------------------------- */

export async function startInterview(db: Db, request: StartInterviewRequest): Promise<StartInterviewResponse> {
  if (request.consent.interview !== true) {
    throw new HttpError(400, "consent_required", "The interview needs the person's consent");
  }
  const now = new Date(nowMs());
  const talentId = newId("tal");
  const interviewId = newId("int");
  const handle = await newHandle(async (h) => {
    const [existing] = await db.select({ id: talent.id }).from(talent).where(eq(talent.handle, h)).limit(1);
    return existing !== undefined;
  });
  const lines = INTERVIEW_LINES[request.uiLang];
  const text = request.mode === "express" ? lines.openingExpress : lines.openingFull;

  const state = initialInterviewState(request.uiLang, now.toISOString());
  state.stage = "awaiting_answer";
  state.questionsAsked = 1;
  state.coverage.recent_work = "asked";
  // The CV text lives only inside this call: what is kept is the validated seeds.
  const hasCv = (request.cvText ?? "").trim() !== "";
  const seeds = await seedsFromCv(db, request.cvText);
  state.cvSeeds = request.mode === "express" ? seeds.slice(0, 1) : seeds.slice(0, 2);

  const turnId = newId("trn");
  await db.transaction(async (tx) => {
    await tx.insert(talent).values({
      id: talentId,
      handle,
      liveDemo: request.consent.liveDemo,
      // Everyone who starts is a live demo session; the simulator clears this for synthetic people.
      purgeAfter: new Date(now.getTime() + getEnv().LIVE_SESSION_TTL_HOURS * 3_600_000),
    });
    await tx.insert(interviewTable).values({
      id: interviewId,
      talentId,
      mode: request.mode,
      lang: request.uiLang,
      status: "active",
      state,
      startedAt: now,
    });
    await tx.insert(turnTable).values({
      id: turnId,
      interviewId,
      index: 0,
      role: "interviewer",
      kind: "opening",
      target: "recent_work",
      text,
      sentences: splitSentences(text),
      at: now,
    });
  });

  await recordConsent(db, { subjectType: "talent", subjectId: talentId, kind: "interview" });
  if (request.consent.voiceVendor) {
    await recordConsent(db, { subjectType: "talent", subjectId: talentId, kind: "voice_vendor" });
  }
  if (request.consent.liveDemo) {
    await recordConsent(db, { subjectType: "talent", subjectId: talentId, kind: "live_demo" });
  }
  await audit(db, {
    actor: `talent:${talentId}`,
    action: "interview.started",
    subjectType: "interview",
    subjectId: interviewId,
    detail: {
      talentId,
      mode: request.mode,
      liveDemo: request.consent.liveDemo,
      voice: request.consent.voiceVendor,
    },
  });

  if (hasCv) {
    await audit(db, {
      actor: `talent:${talentId}`,
      action: "cv.seeded",
      subjectType: "interview",
      subjectId: interviewId,
      detail: { count: state.cvSeeds.length },
    });
  }

  const [opening] = await db.select().from(turnTable).where(eq(turnTable.id, turnId));
  return { interviewId, talentId, handle, opening: toTurn(opening!) };
}

/* ------------------------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------------------------- */

function elapsedSeconds(state: InterviewState): number {
  return Math.max(0, (nowMs() - Date.parse(state.startedAt)) / 1000);
}

/** The language for scripted lines: the last detected participant language if known, else the UI language. */
function scriptLang(state: InterviewState, turns: readonly TurnRow[], current?: string | null): UiLang {
  if (isUiLang(current)) return current;
  const last = [...turns].reverse().find((t) => t.role === "participant" && isUiLang(t.lang));
  return last && isUiLang(last.lang) ? last.lang : state.uiLang;
}

/** The language of bank questions: the detected reply language if we have a bank for it. */
function bankLang(state: InterviewState, interviewLang: string, detected: string): UiLang {
  if (isUiLang(detected)) return detected;
  if (detected !== "unknown" && detected !== "und") return "en"; // a language without a bank
  if (isUiLang(interviewLang)) return interviewLang;
  if (interviewLang !== "und" && interviewLang !== "unknown" && interviewLang !== state.uiLang) return "en";
  return state.uiLang;
}

function fallbackQuestion(
  lang: UiLang,
  plan: Extract<Plan, { action: "ask" }>,
  turns: readonly TurnRow[],
  probePhrase: { phrase: string; labelFi: string | null } | null,
): string {
  if (plan.kind === "probe" && probePhrase) {
    if (lang === "en") return PROBE_QUESTIONS.en[0]!.replace("{phrase}", probePhrase.phrase);
    if (lang === "fi" && probePhrase.labelFi) return PROBE_QUESTIONS.fi[0]!.replace("{phrase}", probePhrase.labelFi);
    return GENERIC_PROBE[lang];
  }
  const bank = FALLBACK_QUESTIONS[lang][plan.target];
  const timesAsked = turns.filter(
    (t) => t.role === "interviewer" && t.target === plan.target && (t.kind === "question" || t.kind === "probe"),
  ).length;
  return bank[timesAsked % bank.length]!;
}

async function nextTurnIndex(db: Db, interviewId: string): Promise<number> {
  const [row] = await db.select({ m: max(turnTable.index) }).from(turnTable).where(eq(turnTable.interviewId, interviewId));
  return (row?.m ?? -1) + 1;
}

async function storeTurn(
  db: Db,
  interviewId: string,
  t: {
    role: "interviewer" | "participant";
    kind: TurnKind;
    target: CoverageArea | null;
    text: string;
    sentences: string[];
    lang?: string | null;
    inputMode?: "voice" | "text" | null;
  },
): Promise<number> {
  const index = await nextTurnIndex(db, interviewId);
  await db.insert(turnTable).values({
    id: newId("trn"),
    interviewId,
    index,
    role: t.role,
    kind: t.kind,
    target: t.target,
    text: t.text,
    sentences: t.sentences,
    lang: t.lang ?? null,
    inputMode: t.inputMode ?? null,
  });
  return index;
}

function* scriptedEvents(text: string, turnIndex: number, kind: TurnKind, closing: boolean): Generator<InterviewEvent> {
  for (const sentence of splitSentences(text)) yield { type: "turn.delta", text: sentence };
  yield { type: "turn.done", turnIndex, text, kind, closing };
}

/** The closing line on the turn response, and on the events stream so a lost response can be recovered. */
async function* closingEvents(
  db: Db,
  interviewId: string,
  closing: { index: number; text: string },
): AsyncGenerator<InterviewEvent, void, void> {
  await publishEvent(db, interviewId, {
    type: "turn.done",
    turnIndex: closing.index,
    text: closing.text,
    kind: "closing",
    closing: true,
  });
  yield* scriptedEvents(closing.text, closing.index, "closing", true);
}

/** The latest earlier answer that has not been removed. */
function previousAnswerOf(turns: readonly TurnRow[], beforeIndex: number): TurnRow | undefined {
  return [...turns]
    .reverse()
    .find(
      (t) =>
        t.role === "participant" &&
        t.kind === "answer" &&
        t.index < beforeIndex &&
        t.redactedAt === null &&
        preCheck(t.text) !== "delete",
    );
}

const DELETED_LINES = Object.values(INTERVIEW_LINES).map((l) => l.deleted);
const isQuestionTurn = (t: TurnRow) =>
  t.role === "interviewer" && !!t.target && (t.kind === "opening" || t.kind === "question" || t.kind === "probe");
const isDeletedReply = (t: TurnRow) => t.kind === "question" && t.role === "interviewer" && DELETED_LINES.some((l) => t.text.startsWith(l));

/**
 * The target of a question that was pending when an answer was removed. The removal's reply
 * re-asked another area in its place, so the pending question has to be asked again later.
 */
export function lostPendingTarget(turns: readonly TurnRow[]): CoverageArea | null {
  const lost = new Set<CoverageArea>();
  for (const d of turns.filter(isDeletedReply)) {
    const before = turns.filter((t) => t.index < d.index && !isDeletedReply(t));
    const pending = [...before].reverse().find(isQuestionTurn);
    if (!pending?.target || pending.target === d.target) continue;
    const answered = before.some(
      (t) =>
        t.index > pending.index &&
        t.role === "participant" &&
        t.kind === "answer" &&
        t.redactedAt === null &&
        preCheck(t.text) !== "delete",
    );
    if (answered) continue;
    const reasked = turns.some((t) => t.index > d.index && isQuestionTurn(t) && !isDeletedReply(t) && t.target === pending.target);
    if (!reasked) lost.add(pending.target);
  }
  return [...lost].at(-1) ?? null;
}

/**
 * Confirm a removal with the scripted line and ask the same area again with its fallback
 * question. This is not a new question: the count and the planner's progress stay as they were.
 */
async function storeDeletedReply(
  db: Db,
  row: InterviewRow,
  target: CoverageArea,
  scriptLanguage: UiLang,
  questionLanguage: UiLang,
): Promise<{ index: number; text: string }> {
  const turns = await loadTurns(db, row.id);
  const question = fallbackQuestion(
    questionLanguage,
    { action: "ask", kind: "question", target, reask: false, situation: null, probeSignalId: null },
    turns,
    null,
  );
  const text = `${INTERVIEW_LINES[scriptLanguage].deleted} ${question}`;
  const index = await storeTurn(db, row.id, {
    role: "interviewer",
    kind: "question",
    target,
    text,
    sentences: splitSentences(text),
  });
  const next = await mutateState(db, row.id, (s) => ({
    ...s,
    stage: "awaiting_answer",
    repairsInRow: 0,
    coverage: { ...s.coverage, [target]: s.coverage[target] === "skipped" ? "skipped" : "asked" },
  }));
  await publishEvent(db, row.id, { type: "coverage.updated", areas: next.coverage });
  return { index, text };
}

/**
 * The remove control on one of the person's own answers. Blanks it, drops what only it
 * supported, confirms with the scripted line and asks the same area again.
 */
export async function removeAnswer(
  db: Db,
  interviewId: string,
  turnIndex: number,
): Promise<{ turnIndex: number; text: string }> {
  runtime().active.get(interviewId)?.abort();
  await waitForPending(interviewId, PREVIOUS_EXTRACTION_WAIT_MS);
  const release = await acquireLock(interviewId);
  try {
    const row = await loadInterview(db, interviewId);
    if (!row) throw new HttpError(404, "not_found", "Interview not found");
    const state = readState(row);
    if (row.status !== "active" || state.stage === "closing" || state.stage === "synthesising") {
      throw new HttpError(409, "interview_closed", "This interview has ended");
    }
    const turns = await loadTurns(db, interviewId);
    const answer = turns.find((t) => t.index === turnIndex && t.role === "participant" && t.kind === "answer");
    if (!answer || answer.redactedAt !== null) throw new HttpError(404, "not_found", "That answer cannot be removed");
    const redaction = await redactTurn(db, row.talentId, interviewId, turnIndex);
    const target = redaction?.target ?? answer.target ?? "recent_work";
    const sLang = scriptLang(state, turns);
    const reply = await storeDeletedReply(db, row, target, sLang, bankLang(state, row.lang, sLang));
    await publishEvent(db, interviewId, {
      type: "turn.done",
      turnIndex: reply.index,
      text: reply.text,
      kind: "question",
      closing: false,
    });
    return { turnIndex: reply.index, text: reply.text };
  } finally {
    release();
  }
}

/** True when this retry key was already accepted for the interview (in this process). */
export function isKnownTurnKey(interviewId: string, key: string | undefined): boolean {
  return key !== undefined && (runtime().seenKeys.get(interviewId)?.has(key) ?? false);
}

/* ------------------------------------------------------------------------------------------
 * Ending
 * ---------------------------------------------------------------------------------------- */

/** The per-answer flag history is only needed while the interview runs. */
const dropFlagHistory = (s: InterviewState): InterviewState => ({ ...s, recentFlags: undefined });

/** Wait for extraction, settle the status, announce completion and build the card. Never throws. */
async function finishInterview(db: Db, interviewId: string, stopped: boolean): Promise<void> {
  try {
    const row = await loadInterview(db, interviewId);
    if (!row) return;
    if (!stopped) {
      await mutateState(db, interviewId, (s) => s, { status: "completed", completedAt: new Date(nowMs()) });
      await publishEvent(db, interviewId, { type: "interview.completed", interviewId, talentId: row.talentId });
    }
    await waitForPending(interviewId, FINISH_EXTRACTION_WAIT_MS);
    // A late extraction may have written flags while we waited: clear them once it has settled.
    await mutateState(db, interviewId, dropFlagHistory);
    const signals = await countLiveSignals(db, interviewId);
    const status = stopped && signals === 0 ? "abandoned" : "completed";
    if (stopped) {
      await mutateState(db, interviewId, dropFlagHistory, { status, completedAt: new Date(nowMs()) });
      await publishEvent(db, interviewId, { type: "interview.completed", interviewId, talentId: row.talentId });
    }
    await audit(db, {
      actor: "system",
      action: "interview.completed",
      subjectType: "interview",
      subjectId: interviewId,
      detail: { status, signals, stopped },
    });
    if (status !== "completed") {
      // Nothing was noted, so there is no card. The page shows its own localised text.
      await publishEvent(db, interviewId, { type: "error", message: "No notes were made", retryable: false });
      return;
    }

    await mutateState(db, interviewId, (s) => ({ ...s, stage: "synthesising" }));
    try {
      await synthesiseCard(db, interviewId);
      await publishEvent(db, interviewId, { type: "card.ready", talentId: row.talentId });
    } catch (error) {
      console.error("[interview] card synthesis failed:", error instanceof Error ? error.message : String(error));
      await publishEvent(db, interviewId, {
        type: "error",
        message: "The notes could not be prepared yet",
        retryable: true,
      });
    }
  } catch (error) {
    console.error("[interview] finishing failed:", error instanceof Error ? error.message : String(error));
  }
}

/** Store the scripted closing line and start the background finish. Returns the turn index. */
async function storeClosing(
  db: Db,
  interviewId: string,
  kind: "done" | "time_cap" | "stopped",
  lang: UiLang,
): Promise<{ index: number; text: string }> {
  const lines = INTERVIEW_LINES[lang];
  const text = kind === "stopped" ? lines.closingStopped : kind === "time_cap" ? lines.closingTimeCap : lines.closing;
  const index = await storeTurn(db, interviewId, {
    role: "interviewer",
    kind: "closing",
    target: null,
    text,
    sentences: splitSentences(text),
  });
  await mutateState(db, interviewId, (s) => ({ ...s, stage: "closing" }));
  track(interviewId, finishInterview(db, interviewId, kind === "stopped"), "finish");
  return { index, text };
}

/** Ends the interview early with the scripted closing and triggers synthesis. */
export async function stopInterview(db: Db, interviewId: string): Promise<void> {
  runtime().active.get(interviewId)?.abort();
  const release = await acquireLock(interviewId);
  try {
    const row = await loadInterview(db, interviewId);
    if (!row || row.status !== "active") return;
    const state = readState(row);
    if (state.stage === "closing" || state.stage === "synthesising") return;
    const turns = await loadTurns(db, interviewId);
    const closing = await storeClosing(db, interviewId, "stopped", scriptLang(state, turns));
    await publishEvent(db, interviewId, {
      type: "turn.done",
      turnIndex: closing.index,
      text: closing.text,
      kind: "closing",
      closing: true,
    });
  } finally {
    release();
  }
}

/** Resolves once background work for the interview (extraction, synthesis) has finished. */
export async function settleInterview(
  db: Db,
  interviewId: string,
  timeoutMs = SETTLE_DEFAULT_TIMEOUT_MS,
): Promise<void> {
  void db;
  await waitForPending(interviewId, timeoutMs, ["work", "finish"]);
}

/* ------------------------------------------------------------------------------------------
 * One turn
 * ---------------------------------------------------------------------------------------- */

export type SubmitTurnOptions = {
  signal?: AbortSignal;
};

/**
 * A CV seed words the first `example` question and, in full mode, the first `tools` question.
 * It never changes which area is asked.
 */
function cvSeedFor(
  state: InterviewState,
  plan: Extract<Plan, { action: "ask" }>,
  mode: InterviewRow["mode"],
  turns: readonly TurnRow[],
): { question: string } | null {
  if (plan.kind !== "question" || plan.reask) return null;
  if (plan.target !== "example" && !(mode === "full" && plan.target === "tools")) return null;
  if (askedTargetsOf(turns.map(toTurn)).has(plan.target)) return null;
  const seed = plan.target === "example" ? state.cvSeeds[0] : (state.cvSeeds[1] ?? null);
  return seed ? { question: seed.question } : null;
}

function situationFor(state: InterviewState, plan: Extract<Plan, { action: "ask" }>, skipped: boolean): Situation | null {
  if (skipped) return "skipped";
  if ((state.flagCounts.distress ?? 0) > 0) return "distress_seen";
  const recent = state.recentFlags ?? [];
  if (recent.length >= 2 && recent.slice(-2).every((f) => f.includes("off_topic"))) return "off_topic_twice";
  if (recent.at(-1)?.includes("buzzwords")) return "general_answers";
  if (plan.situation === "short_answer") return "short_answer";
  return null;
}

export async function* submitTurn(
  db: Db,
  interviewId: string,
  request: TurnRequest,
  opts: SubmitTurnOptions = {},
): AsyncGenerator<InterviewEvent, void, void> {
  const rt = runtime();
  const key = request.clientTurnId;
  const duplicate = key !== undefined && (rt.seenKeys.get(interviewId)?.has(key) ?? false);
  if (key !== undefined && !duplicate) {
    const keys = rt.seenKeys.get(interviewId) ?? new Map<string, number | null>();
    keys.set(key, null);
    rt.seenKeys.set(interviewId, keys);
  }

  if (!duplicate) rt.active.get(interviewId)?.abort(); // barge-in
  const ac = new AbortController();
  if (!duplicate) rt.active.set(interviewId, ac);
  const forward = () => ac.abort();
  if (opts.signal?.aborted) ac.abort();
  else opts.signal?.addEventListener("abort", forward, { once: true });

  const release = await acquireLock(interviewId);
  try {
    if (duplicate && key !== undefined) {
      const index = rt.seenKeys.get(interviewId)?.get(key);
      if (index !== null && index !== undefined) {
        const turns = await loadTurns(db, interviewId);
        const reply = turns.find((t) => t.index === index + 1 && t.role === "interviewer");
        if (reply) yield* scriptedEvents(reply.text, reply.index, reply.kind, reply.kind === "closing");
        else yield* resumeReply(db, interviewId, index, turns, request, ac);
        return;
      }
    }
    yield* processTurn(db, interviewId, request, ac, key);
  } finally {
    opts.signal?.removeEventListener("abort", forward);
    if (rt.active.get(interviewId) === ac) rt.active.delete(interviewId);
    release();
  }
}

/**
 * A retry whose answer is already stored but never got a reply (the first attempt's stream was
 * dropped or it failed). Plans and streams the reply now; the answer is not stored again.
 */
async function* resumeReply(
  db: Db,
  interviewId: string,
  answerIndex: number,
  turns: TurnRow[],
  request: TurnRequest,
  ac: AbortController,
): AsyncGenerator<InterviewEvent, void, void> {
  const rt = runtime();
  const row = await loadInterview(db, interviewId);
  if (!row || row.status !== "active") return;
  const state = readState(row);
  if (state.stage === "closing" || state.stage === "synthesising") return;
  const answer = turns.find((t) => t.index === answerIndex && t.role === "participant");
  // Anything stored after the answer means a newer turn took over; this retry is stale.
  if (!answer || turns.some((t) => t.index > answerIndex)) return;
  rt.active.set(interviewId, ac); // barge-in works on the retry too
  const lastQuestion = [...turns]
    .reverse()
    .find((t) => t.index < answerIndex && t.role === "interviewer" && (t.kind === "opening" || t.kind === "question" || t.kind === "probe"));
  const check = preCheck(answer.text);
  yield* planAndReply(db, row, state, turns, {
    request,
    detected: detectLang(answer.text, request.sttLang),
    answerArea: answer.target ?? null,
    answerWords: wordCount(answer.text),
    lastKind: lastQuestion?.kind ?? null,
    skipped: check === "skip",
    repairFinal: check === "empty",
    answerIndex,
  }, ac);
}

async function* processTurn(
  db: Db,
  interviewId: string,
  request: TurnRequest,
  ac: AbortController,
  key: string | undefined,
): AsyncGenerator<InterviewEvent, void, void> {
  const rt = runtime();
  const row = await loadInterview(db, interviewId);
  if (!row) throw new HttpError(404, "not_found", "Interview not found");
  let state = readState(row);
  if (row.status !== "active" || state.stage === "closing" || state.stage === "synthesising") {
    throw new HttpError(409, "interview_closed", "This interview has ended");
  }
  let turns = await loadTurns(db, interviewId);

  /* 1. Store the participant turn. */
  const text = request.text.trim().slice(0, TURN_MAX_STORED_CHARS);
  const sentences = splitSentences(text);
  const detected = detectLang(text, request.sttLang);
  const lastQuestion = [...turns]
    .reverse()
    .find((t) => t.role === "interviewer" && (t.kind === "opening" || t.kind === "question" || t.kind === "probe"));
  const answerArea = lastQuestion?.target ?? null;
  const answerIndex = await storeTurn(db, interviewId, {
    role: "participant",
    kind: "answer",
    target: answerArea,
    text,
    sentences,
    lang: detected === "unknown" ? null : detected,
    inputMode: request.inputMode,
  });
  if (key !== undefined) rt.seenKeys.get(interviewId)?.set(key, answerIndex);

  if (ac.signal.aborted) return; // replaced by a newer turn before any work started

  /* The previous answer's extraction should be in before planning (normally it is). */
  await waitForPending(interviewId, PREVIOUS_EXTRACTION_WAIT_MS);
  track(
    interviewId,
    audit(db, {
      actor: `talent:${row.talentId}`,
      action: "interview.turn",
      subjectType: "interview",
      subjectId: interviewId,
      detail: { turnIndex: answerIndex, sentences: sentences.length, chars: text.length, words: wordCount(text) },
    }),
  );

  /* 2. Pre-check. */
  let check = preCheck(text);
  // "delete this" needs an earlier answer to delete; with none it is treated like an empty turn.
  const previousAnswer = check === "delete" ? previousAnswerOf(turns, answerIndex) : undefined;
  if (check === "delete" && !previousAnswer) check = "empty";
  const lang = detected === "unknown" ? row.lang : detected;
  await mutateState(db, interviewId, (s) => ({ ...s, stage: "replying" }), detected === "unknown" ? undefined : { lang });
  turns = await loadTurns(db, interviewId);
  state = readState((await loadInterview(db, interviewId))!);
  const sLang = scriptLang(state, turns, detected);

  if (check === "empty") {
    if (state.repairsInRow >= 2) {
      yield* planAndReply(db, row, state, turns, {
        request,
        detected,
        answerArea,
        answerWords: 0,
        lastKind: lastQuestion?.kind ?? null,
        skipped: false,
        repairFinal: true,
        answerIndex,
      }, ac);
      return;
    }
    const line = INTERVIEW_LINES[sLang].repair;
    const index = await storeTurn(db, interviewId, {
      role: "interviewer",
      kind: "repair",
      target: answerArea,
      text: line,
      sentences: splitSentences(line),
    });
    await mutateState(db, interviewId, (s) => ({ ...s, repairsInRow: s.repairsInRow + 1, stage: "awaiting_answer" }));
    yield* scriptedEvents(line, index, "repair", false);
    return;
  }

  if (check === "stop") {
    const closing = await storeClosing(db, interviewId, "stopped", sLang);
    yield* closingEvents(db, interviewId, closing);
    return;
  }

  if (check === "delete" && previousAnswer) {
    const redaction = await redactTurn(db, row.talentId, interviewId, previousAnswer.index);
    const target = redaction?.target ?? previousAnswer.target ?? answerArea ?? "recent_work";
    const reply = await storeDeletedReply(db, row, target, sLang, bankLang(state, row.lang, detected));
    yield* scriptedEvents(reply.text, reply.index, "question", false);
    return;
  }

  let skipped = false;
  if (check === "skip") {
    skipped = true;
    if (answerArea) {
      const next = await mutateState(db, interviewId, (s) => ({
        ...s,
        repairsInRow: 0,
        coverage: { ...s.coverage, [answerArea]: "skipped" },
      }));
      await publishEvent(db, interviewId, { type: "coverage.updated", areas: next.coverage });
    }
  } else {
    await mutateState(db, interviewId, (s) => ({ ...s, repairsInRow: 0 }));
    track(interviewId, runExtraction(db, interviewId, answerIndex));
  }

  state = readState((await loadInterview(db, interviewId))!);
  yield* planAndReply(db, row, state, turns, {
    request,
    detected,
    answerArea,
    answerWords: wordCount(text),
    lastKind: lastQuestion?.kind ?? null,
    skipped,
    repairFinal: false,
    answerIndex,
  }, ac);
}

type ReplyContext = {
  request: TurnRequest;
  detected: string;
  answerArea: CoverageArea | null;
  answerWords: number;
  lastKind: TurnKind | null;
  skipped: boolean;
  repairFinal: boolean;
  answerIndex: number;
};

async function* planAndReply(
  db: Db,
  row: InterviewRow,
  state: InterviewState,
  turns: TurnRow[],
  ctx: ReplyContext,
  ac: AbortController,
): AsyncGenerator<InterviewEvent, void, void> {
  const interviewId = row.id;

  /* The extractor heard a request to end the whole interview: close with the scripted line. */
  if ((state.flagCounts.wants_stop ?? 0) > 0 && !ctx.repairFinal) {
    const closing = await storeClosing(db, interviewId, "stopped", scriptLang(state, turns, ctx.detected));
    yield* closingEvents(db, interviewId, closing);
    return;
  }

  const signalRows = await loadSignalRows(db, row.talentId);
  const live = signalRows.filter((s) => s.status !== "removed");
  const byId = new Map(live.map((s) => [s.id, s]));

  /* 3. The deterministic planner. */
  let plan = planNext({
    mode: row.mode,
    questionsAsked: state.questionsAsked,
    elapsedSeconds: elapsedSeconds(state),
    coverage: state.coverage,
    askedTargets: askedTargetsOf(turns.map(toTurn)),
    reasked: state.reasked,
    probesUsed: state.probesUsed,
    probed: state.probed,
    distressSeen: (state.flagCounts.distress ?? 0) > 0,
    answer: {
      words: ctx.answerWords,
      area: ctx.answerArea,
      ignoreShort: ctx.skipped || ctx.repairFinal,
    },
    latestSignals: (state.lastExtracted ?? [])
      .map((id) => byId.get(id))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => ({ id: s.id, kind: s.kind, hasExample: s.hasExample })),
  });

  // A removal replaced the question that was pending: ask it now, without counting it twice.
  const lostTarget = lostPendingTarget(turns);
  const reaskLost = lostTarget !== null && !ctx.repairFinal && !(plan.action === "close" && plan.reason === "time_cap");
  if (reaskLost) {
    plan = { action: "ask", kind: "question", target: lostTarget, reask: false, situation: null, probeSignalId: null };
  }

  const sLang = scriptLang(state, turns, ctx.detected);

  if (plan.action === "close") {
    const closing = await storeClosing(db, interviewId, plan.reason === "time_cap" ? "time_cap" : "done", sLang);
    yield* closingEvents(db, interviewId, closing);
    return;
  }

  const qLang = bankLang(state, row.lang, ctx.detected);
  const probeSignal = plan.probeSignalId ? byId.get(plan.probeSignalId) : undefined;
  const fallback = fallbackQuestion(
    qLang,
    plan,
    turns,
    probeSignal ? { phrase: probeSignal.phrase, labelFi: probeSignal.escoLabelFi } : null,
  );
  const repairPrefix = ctx.repairFinal ? INTERVIEW_LINES[sLang].repairFinal : "";

  let replyText: string;
  let replySentences: string[];

  if (ctx.repairFinal) {
    /* Repair loop ended: a scripted line plus the bank question, no model call. */
    replyText = `${repairPrefix} ${fallback}`;
    replySentences = splitSentences(replyText);
    for (const sentence of replySentences) yield { type: "turn.delta", text: sentence };
  } else {
    /* 4a. The live call, through the output guard. */
    const seed = cvSeedFor(state, plan, row.mode, turns);
    const target: LiveTarget =
      plan.kind === "probe" && probeSignal
        ? { kind: "probe", signalPhrase: probeSignal.phrase }
        : plan.reask
          ? { kind: "reask", area: plan.target }
          : seed
            ? { kind: "seed", area: plan.target, question: seed.question }
            : { kind: "area", area: plan.target };
    const prompt = buildLivePrompt({
      replyLang: ctx.detected,
      questionNumber: state.questionsAsked + 1,
      questionsTotal: row.mode === "express" ? "3" : "5-7",
      target,
      situation: situationFor(state, plan, ctx.skipped),
      steeringNote: state.lastNote,
      notedPhrases: live.filter((s) => s.interviewId === interviewId).map((s) => s.phrase),
      history: turns.map((t) => ({ role: t.role, text: t.text, redacted: t.redactedAt !== null })),
    });
    const upstream = new AbortController();
    const llmOptions: LlmOptions = {
      role: "live",
      purpose: "interview.live",
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: 0.4,
      maxTokens: 90,
      deadlineMs: LIVE_DEADLINE_MS,
      signal: upstream.signal,
      db,
    };
    const guarded = guardStream(chatStream(llmOptions), {
      fallbackQuestion: fallback,
      upstream,
      signal: ac.signal,
      llmOptions,
    });
    let result: GuardResult;
    try {
      for (;;) {
        const step = await guarded.next();
        if (step.done) {
          result = step.value;
          break;
        }
        yield { type: "turn.delta", text: step.value };
      }
    } finally {
      await guarded.return({
        emitted: [],
        text: "",
        stopped: false,
        fallbackUsed: false,
        aborted: true,
        actions: [],
      });
    }

    if (result.stopped) {
      const closing = await storeClosing(db, interviewId, "stopped", sLang);
      yield* closingEvents(db, interviewId, closing);
      return;
    }
    if (result.aborted && result.emitted.length === 0) return; // never shown: does not count
    replyText = result.text;
    replySentences = result.emitted;
  }

  /* 5. Store the interviewer turn and update the state. */
  const kind: TurnKind = plan.kind === "probe" ? "probe" : "question";
  const index = await storeTurn(db, interviewId, {
    role: "interviewer",
    kind,
    target: plan.target,
    text: replyText,
    sentences: replySentences,
  });
  const next = await mutateState(db, interviewId, (s) => {
    const coverage = { ...s.coverage };
    if (coverage[plan.target] !== "covered" && coverage[plan.target] !== "skipped") coverage[plan.target] = "asked";
    const reasked = [...s.reasked];
    if (plan.reask && !reasked.includes(plan.target)) reasked.push(plan.target);
    if (ctx.repairFinal && ctx.answerArea) {
      if (coverage[ctx.answerArea] !== "covered") coverage[ctx.answerArea] = "thin";
    }
    return {
      ...s,
      stage: "awaiting_answer",
      questionsAsked: reaskLost ? s.questionsAsked : s.questionsAsked + 1,
      repairsInRow: 0,
      coverage,
      reasked,
      probesUsed: plan.kind === "probe" ? s.probesUsed + 1 : s.probesUsed,
      probed: plan.probeSignalId ? [...s.probed, plan.probeSignalId] : s.probed,
    };
  });
  await publishEvent(db, interviewId, { type: "coverage.updated", areas: next.coverage });

  if (ac.signal.aborted && !ctx.repairFinal) return; // the consumer is gone or moved on
  yield { type: "turn.done", turnIndex: index, text: replyText, kind, closing: false };
}
