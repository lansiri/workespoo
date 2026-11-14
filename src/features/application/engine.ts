import { and, eq } from "drizzle-orm";
import {
  APPLICATION_MAX_FOLLOW_UPS,
  ApplicationAssessment,
  ApplicationTurnOutput,
  type ApplicationEvent,
  type ApplicationPlan,
  type ApplicationState,
  type ApplicationStatus,
  type ApplicationTurn,
  type ApplicationTurnRequest,
  type CoveredRequirement,
  type EvidenceRef,
  type StartApplicationRequest,
  type StartApplicationResponse,
} from "@/contracts";
import type { Db } from "@/db/client";
import { application, applicationTurn, company, job } from "@/db/schema";
import { getApprovedCard } from "@/features/card";
import { audit } from "@/lib/audit";
import { recordConsent } from "@/lib/consent";
import { HttpError } from "@/lib/http";
import { newId } from "@/lib/ids";
import { findProtectedCard } from "@/lib/lexicon";
import { chatJson } from "@/lib/llm";
import { employerTerms, maskEmployer } from "@/lib/mask";
import { enqueue } from "@/lib/queue";
import { preCheck } from "@/lib/commands";
import { requireTalent } from "@/lib/session";
import { splitSentences } from "@/lib/sentences";
import { TURN_MAX_STORED_CHARS } from "@/contracts";
import {
  acquireLock,
  answersFor,
  findByClientTurnId,
  insertTurn,
  dropFromRanking,
  previousAnswer,
  loadApp,
  loadTurns,
  publicTurn,
  requireApp,
  saveState,
  withLock,
  type AppRow,
  type NewTurn,
  type TurnRow,
} from "./engine-store";
import { questionsFor } from "./engine-questions";
import { ASSESS_KIND } from "./jobs";
import { bridgeFor, closingLine, deletedLine, openingLine, repairLine, scriptedFollowUp } from "./lines";
import { buildTurnPrompt, followUpProblem } from "./prompts-interview";
import { applicationPoints, ownPosition } from "./rank";
import { currentRequirementKinds, loadApplyContext, loadJobContext } from "./requirements";

/**
 * The job interview itself (docs/specs/job-interview.md section 5): start, one turn at a time,
 * skip, stop, remove an answer, send, withdraw. Every function that changes something checks
 * that the application is in a status that allows it and throws `HttpError` (404, 409) when
 * it is not. Ownership (the session's person owns the application) is checked by the route
 * through `requireOwnApplication`.
 */

export interface EngineOptions {
  signal?: AbortSignal;
  now?: () => Date;
}

const nowOf = (options?: EngineOptions) => (options?.now ?? (() => new Date()))();
const actorOf = (talentId: string) => `talent:${talentId}` as const;

/** Postgres unique violation, however the driver wraps it. */
function isUniqueViolation(error: unknown): boolean {
  for (let e: unknown = error, depth = 0; e && depth < 4; depth++) {
    if ((e as { code?: string }).code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/* ------------------------------------------ start ------------------------------------------ */

/**
 * Starts an application for the signed-in person: checks the approved card and the job,
 * records the `job_assessment` consent, makes the plan (the model words the questions; code
 * checks them and falls back to scripted wording), stores the opening turn and audits
 * `application.started`. Throws 409 `already_applied` when one exists for this job,
 * 409 `no_approved_card`, 404 `unknown_job`.
 */
export async function startApplication(
  db: Db,
  talentId: string,
  request: StartApplicationRequest,
  options?: EngineOptions,
): Promise<StartApplicationResponse> {
  if (request.consent?.assessment !== true) {
    throw new HttpError(400, "consent_required", "Agreeing to the rating and ranking is required");
  }
  if (!(await getApprovedCard(db, talentId))) {
    throw new HttpError(409, "no_approved_card", "Approve your Signal Card first");
  }
  const ctx = await loadApplyContext(db, request.jobId);
  if (!ctx) throw new HttpError(404, "unknown_job", "This job is not open for applications");
  const [existing] = await db
    .select({ id: application.id })
    .from(application)
    .where(and(eq(application.talentId, talentId), eq(application.jobId, request.jobId)));
  if (existing) throw new HttpError(409, "already_applied", "You have already applied to this job");

  const lang = request.uiLang;
  const questions = await questionsFor(db, ctx, lang);
  const requirements: CoveredRequirement[] = ctx.covered.map((r, i) => ({
    requirementId: r.id,
    text: ctx.mask(r.text).slice(0, 200),
    kind: r.kind,
    category: r.category,
    postingSentence: r.postingSentence,
    question: questions[i]!.question,
    wording: questions[i]!.wording,
  }));
  const plan: ApplicationPlan = { needCardId: ctx.card.id, needCardVersion: ctx.card.version, lang, requirements };
  const state: ApplicationState = {
    cursor: 0,
    followUps: {},
    progress: Object.fromEntries(requirements.map((r, i) => [r.requirementId, i === 0 ? "asked" : "waiting"])),
    noted: {},
  };
  const first = requirements[0]!;
  const text = `${openingLine(lang, ctx.mask(ctx.card.title), requirements.length)} ${first.question}`;
  const at = nowOf(options);
  const applicationId = newId("app");

  await recordConsent(db, { subjectType: "talent", subjectId: talentId, kind: "job_assessment" });
  let opening: TurnRow;
  try {
    opening = await db.transaction(async (tx) => {
      await tx.insert(application).values({
        id: applicationId,
        talentId,
        jobId: request.jobId,
        companyId: ctx.companyId,
        status: "interviewing",
        plan,
        state,
        createdAt: at,
      });
      const turn = await insertTurn(
        tx,
        applicationId,
        { role: "interviewer", kind: "opening", requirementId: first.requirementId, text, sentences: splitSentences(text) },
        at,
      );
      await audit(tx, {
        actor: actorOf(talentId),
        action: "application.started",
        subjectType: "application",
        subjectId: applicationId,
        detail: { talentId, jobId: request.jobId },
      });
      return turn;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, "already_applied", "You have already applied to this job");
    throw error;
  }
  return { applicationId, opening: publicTurn(opening) };
}

/* ---------------------------------- the interviewer's lines ---------------------------------- */

function* lineEvents(turn: TurnRow, ended: boolean): Generator<ApplicationEvent, void, void> {
  for (const sentence of turn.sentences) yield { type: "turn.delta", text: sentence };
  yield { type: "turn.done", turn: publicTurn(turn), ended };
}

/** Stores one interviewer turn together with the new state (and status) in one transaction. */
async function commit(
  db: Db,
  app: AppRow,
  state: ApplicationState,
  turn: Omit<NewTurn, "role" | "sentences"> & { text: string },
  at: Date,
  status?: ApplicationStatus,
): Promise<TurnRow> {
  return db.transaction(async (tx) => {
    const stored = await insertTurn(tx, app.id, { ...turn, role: "interviewer", sentences: splitSentences(turn.text) }, at);
    await saveState(tx, app.id, state, status);
    return stored;
  });
}

function cloneState(state: ApplicationState): ApplicationState {
  return structuredClone(state);
}

/** The next requirement still waiting after the cursor, or -1. */
function nextWaiting(plan: ApplicationPlan, state: ApplicationState): number {
  for (let i = state.cursor + 1; i < plan.requirements.length; i++) {
    if (state.progress[plan.requirements[i]!.requirementId] === "waiting") return i;
  }
  return -1;
}

/** Closes the interview: the closing line is stored and the status becomes `review`. */
async function closeInterview(db: Db, app: AppRow, state: ApplicationState, stopped: boolean, at: Date): Promise<TurnRow> {
  const next = cloneState(state);
  next.cursor = app.plan.requirements.length;
  return commit(
    db,
    app,
    next,
    { kind: "closing", requirementId: null, text: closingLine(app.plan.lang, stopped) },
    at,
    "review",
  );
}

/** The next question behind a bridge, or the closing line when none is left. */
async function moveOn(db: Db, app: AppRow, state: ApplicationState, at: Date): Promise<{ turn: TurnRow; ended: boolean }> {
  const idx = nextWaiting(app.plan, state);
  if (idx < 0) return { turn: await closeInterview(db, app, state, false, at), ended: true };
  const next = cloneState(state);
  const req = app.plan.requirements[idx]!;
  next.cursor = idx;
  next.progress[req.requirementId] = "asked";
  const turn = await commit(
    db,
    app,
    next,
    { kind: "question", requirementId: req.requirementId, text: `${bridgeFor(app.plan.lang, idx)} ${req.question}` },
    at,
  );
  return { turn, ended: false };
}

/** Marks the current requirement passed over, or answered when something was said about it already. */
function settleCurrent(state: ApplicationState, turns: readonly TurnRow[], requirementId: string, skipped: boolean): ApplicationState {
  const next = cloneState(state);
  const answered = answersFor(turns, requirementId).length > 0;
  next.progress[requirementId] = answered ? "answered" : skipped ? "skipped" : "asked";
  return next;
}

/* ------------------------------------------- a turn ------------------------------------------- */

/**
 * One answer. Yields, in this order: `answer.stored`; `requirement.noted` when words were
 * noted; `turn.delta` for each sentence of the interviewer's next line; `turn.done` with the
 * stored interviewer turn (`ended: true` on the closing line, when the status is `review`).
 * The same `clientTurnId` again replays the stored result without storing a second answer.
 */
export async function* submitApplicationTurn(
  db: Db,
  applicationId: string,
  request: ApplicationTurnRequest,
  options?: EngineOptions,
): AsyncGenerator<ApplicationEvent, void, void> {
  const release = await acquireLock(applicationId);
  try {
    yield* processAnswer(db, applicationId, request, options);
  } finally {
    release();
  }
}

async function* processAnswer(
  db: Db,
  applicationId: string,
  request: ApplicationTurnRequest,
  options?: EngineOptions,
): AsyncGenerator<ApplicationEvent, void, void> {
  const signal = options?.signal;
  let app = await requireApp(db, applicationId);
  let answer: TurnRow | null = null;

  if (request.clientTurnId) {
    const known = await findByClientTurnId(db, applicationId, request.clientTurnId);
    if (known) {
      yield { type: "answer.stored", turn: publicTurn(known) };
      const turns = await loadTurns(db, applicationId);
      const follower = turns.find((t) => t.index === known.index + 1);
      if (follower) {
        yield* lineEvents(follower, follower.kind === "closing");
        return;
      }
      answer = known; // the reply was lost: make it now, without storing the answer again
    }
  }

  let turns = await loadTurns(db, applicationId);
  if (!answer) {
    if (app.status !== "interviewing") throw new HttpError(409, "not_interviewing", "This interview is not running");
    const text = request.text.trim().slice(0, TURN_MAX_STORED_CHARS);
    let check = preCheck(text);
    if (check === "delete" && !previousAnswer(turns)) check = "empty";
    const current = app.plan.requirements[app.state.cursor];
    answer = await insertTurn(
      db,
      applicationId,
      {
        role: "participant",
        kind: check === "none" ? "answer" : "repair",
        requirementId: current?.requirementId ?? null,
        text,
        sentences: splitSentences(text),
        inputMode: request.inputMode,
        clientTurnId: request.clientTurnId ?? null,
      },
      nowOf(options),
    );
    turns = [...turns, answer];
    yield { type: "answer.stored", turn: publicTurn(answer) };
  }
  if (app.status !== "interviewing") return;

  const at = nowOf(options);
  const plan = app.plan;
  const lang = plan.lang;
  const current = plan.requirements[app.state.cursor];
  if (!current) return;
  let check = answer.kind === "answer" ? "none" : preCheck(answer.text);
  const before = turns.filter((t) => t.index < answer!.index);
  if (check === "delete" && !previousAnswer(before)) check = "empty";
  if (check === "none" && answer.kind !== "answer") check = "empty";

  if (check === "empty") {
    let repeats = 0;
    for (let i = before.length - 1; i >= 1; i -= 2) {
      const a = before[i]!;
      const b = before[i - 1]!;
      if (a.role === "interviewer" && a.kind === "repair" && b.role === "participant" && b.kind === "repair") repeats++;
      else break;
    }
    if (repeats >= 2) check = "skip";
    else {
      const turn = await commit(db, app, app.state, { kind: "repair", requirementId: current.requirementId, text: repairLine(lang) }, at);
      yield* lineEvents(turn, false);
      return;
    }
  }

  if (check === "stop") {
    const state = settleCurrent(app.state, turns, current.requirementId, false);
    const turn = await closeInterview(db, app, state, true, at);
    yield* lineEvents(turn, true);
    return;
  }

  if (check === "skip") {
    const state = settleCurrent(app.state, turns, current.requirementId, true);
    const { turn, ended } = await moveOn(db, app, state, at);
    yield* lineEvents(turn, ended);
    return;
  }

  if (check === "delete") {
    const previous = previousAnswer(before)!;
    await blankAnswer(db, app, previous, turns);
    app = await requireApp(db, applicationId);
    const reqIndex = Math.max(0, plan.requirements.findIndex((r) => r.requirementId === previous.requirementId));
    const req = plan.requirements[reqIndex]!;
    const state = cloneState(app.state);
    const wasCurrent = state.cursor;
    state.cursor = reqIndex;
    if (wasCurrent !== reqIndex) {
      const cur = plan.requirements[wasCurrent]!.requirementId;
      if (state.progress[cur] === "asked") state.progress[cur] = "waiting";
    }
    state.progress[req.requirementId] = "asked";
    const turn = await commit(
      db,
      app,
      state,
      { kind: "question", requirementId: req.requirementId, text: `${deletedLine(lang)} ${req.question}` },
      at,
    );
    yield* lineEvents(turn, false);
    return;
  }

  // An ordinary answer: prompt B decides whether one follow-up is worth asking.
  const sentences = answer.sentences;
  const lastInterviewer = [...before].reverse().find((t) => t.role === "interviewer");
  const questionAsked =
    lastInterviewer?.kind === "follow_up" && lastInterviewer.requirementId === current.requirementId
      ? lastInterviewer.text
      : current.question;
  const followUpsSoFar = app.state.followUps[current.requirementId] ?? 0;
  const terms = await employerTermsOf(db, app);

  let output: ApplicationTurnOutput | null = null;
  try {
    const prompt = buildTurnPrompt({
      lang,
      requirement: current.text,
      question: questionAsked,
      followUpAsked: followUpsSoFar >= APPLICATION_MAX_FOLLOW_UPS,
      sentences,
    });
    const result = await chatJson({
      role: "live",
      purpose: "application.turn",
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      schema: ApplicationTurnOutput,
      temperature: 0.2,
      maxTokens: 300,
      deadlineMs: 8000,
      signal,
      db,
    });
    output = result.data;
  } catch {
    output = null;
  }
  if (signal?.aborted) return;

  const state = cloneState(app.state);
  const noted: EvidenceRef[] = [];
  if (output) {
    const wanted = [...new Set(output.evidence)].filter((n) => n >= 1 && n <= sentences.length).sort((a, b) => a - b);
    for (const n of wanted) {
      if (findProtectedCard(sentences[n - 1]!).length > 0) continue;
      noted.push({ turnIndex: answer.index, sentenceFrom: n, sentenceTo: n });
    }
    if (noted.length > 0) state.noted[current.requirementId] = [...(state.noted[current.requirementId] ?? []), ...noted];
  }

  let followUp: string | null = null;
  if (output && !output.concrete && followUpsSoFar < APPLICATION_MAX_FOLLOW_UPS) {
    const proposed = output.followUp?.trim() ?? "";
    if (proposed) {
      if (followUpProblem(proposed, terms) === null) followUp = proposed;
    } else if (output.missing !== "none") {
      followUp = scriptedFollowUp(lang);
    }
  }

  if (followUp) {
    state.followUps[current.requirementId] = followUpsSoFar + 1;
    state.progress[current.requirementId] = "asked";
    if (noted.length > 0) yield { type: "requirement.noted", requirementId: current.requirementId, evidence: noted, progress: "asked" };
    const turn = await commit(db, app, state, { kind: "follow_up", requirementId: current.requirementId, text: followUp }, at);
    yield* lineEvents(turn, false);
    return;
  }

  state.progress[current.requirementId] = "answered";
  if (noted.length > 0) yield { type: "requirement.noted", requirementId: current.requirementId, evidence: noted, progress: "answered" };
  const { turn, ended } = await moveOn(db, app, state, at);
  yield* lineEvents(turn, ended);
}


/** The employer's terms when the company is masked: what no line the model writes may contain. */
async function employerTermsOf(db: Db, app: AppRow): Promise<string[]> {
  const ctx = await loadJobContext(db, app.jobId);
  return ctx?.terms ?? [];
}

/* ------------------------------------- skip, stop, remove ------------------------------------- */

/** The person passes on the current question: the requirement is marked skipped, and the next line is yielded as in a turn. */
export async function* skipApplicationQuestion(
  db: Db,
  applicationId: string,
  options?: EngineOptions & { requirementId?: string },
): AsyncGenerator<ApplicationEvent, void, void> {
  const release = await acquireLock(applicationId);
  try {
    const app = await requireApp(db, applicationId);
    if (app.status !== "interviewing") throw new HttpError(409, "not_interviewing", "This interview is not running");
    const current = app.plan.requirements[app.state.cursor];
    if (!current) throw new HttpError(409, "not_interviewing", "There is no question to skip");
    // A repeated or late skip names a question that is no longer the current one: nothing to do.
    if (options?.requirementId && options.requirementId !== current.requirementId) return;
    const turns = await loadTurns(db, applicationId);
    const state = settleCurrent(app.state, turns, current.requirementId, true);
    const { turn, ended } = await moveOn(db, app, state, nowOf(options));
    yield* lineEvents(turn, ended);
  } finally {
    release();
  }
}

/** The person stops the interview: the scripted closing line is stored and the status becomes `review`. Returns that turn. */
export function stopApplicationInterview(db: Db, applicationId: string, options?: EngineOptions): Promise<ApplicationTurn> {
  return withLock(applicationId, async () => {
    const app = await requireApp(db, applicationId);
    if (app.status !== "interviewing") throw new HttpError(409, "not_interviewing", "This interview is not running");
    const current = app.plan.requirements[app.state.cursor];
    const turns = await loadTurns(db, applicationId);
    const state = current ? settleCurrent(app.state, turns, current.requirementId, false) : app.state;
    return publicTurn(await closeInterview(db, app, state, true, nowOf(options)));
  });
}

/** Blanks one answer and drops what was noted from it. Its requirement goes back to `asked` unless another answer still speaks to it. */
async function blankAnswer(db: Db, app: AppRow, answer: TurnRow, turns: readonly TurnRow[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(applicationTurn)
      .set({ text: "", sentences: [], removedAt: new Date() })
      .where(and(eq(applicationTurn.applicationId, app.id), eq(applicationTurn.index, answer.index)));
    const state = cloneState((await requireApp(tx, app.id)).state);
    const reqId = answer.requirementId;
    if (reqId) {
      state.noted[reqId] = (state.noted[reqId] ?? []).filter((ref) => ref.turnIndex !== answer.index);
      if (state.noted[reqId]!.length === 0) delete state.noted[reqId];
      const others = answersFor(turns, reqId).filter((t) => t.index !== answer.index);
      if (others.length === 0 && state.progress[reqId] === "answered") state.progress[reqId] = "asked";
    }
    await saveState(tx, app.id, state);
  });
}

/**
 * Removes one of the person's answers (status `interviewing` or `review`): its text and
 * sentences are blanked, `removedAt` is set, what was noted from it is dropped, and its
 * requirement counts as unanswered unless another answer of theirs still speaks to it.
 */
export function removeApplicationAnswer(db: Db, applicationId: string, turnIndex: number, options?: EngineOptions): Promise<void> {
  void options;
  return withLock(applicationId, async () => {
    const app = await requireApp(db, applicationId);
    if (app.status !== "interviewing" && app.status !== "review") {
      throw new HttpError(409, "not_editable", "This application can no longer be changed");
    }
    const turns = await loadTurns(db, applicationId);
    const target = turns.find((t) => t.index === turnIndex);
    if (!target || target.role !== "participant" || target.kind !== "answer" || target.removedAt) {
      throw new HttpError(404, "not_found", "That answer does not exist");
    }
    await blankAnswer(db, app, target, turns);
  });
}

/* ----------------------------------- send and withdraw ----------------------------------- */

/**
 * Sends the application (status `review`, at least one answer that is not removed): status
 * `submitted`, `submittedAt`, audit `application.submitted`, and the `application.assess`
 * job is enqueued with the application id as its dedupe key.
 */
export function submitApplication(db: Db, applicationId: string, options?: EngineOptions): Promise<void> {
  return withLock(applicationId, async () => {
    const app = await requireApp(db, applicationId);
    if (app.status !== "review") throw new HttpError(409, "not_in_review", "This application is not ready to send");
    const turns = await loadTurns(db, applicationId);
    const answers = turns.filter((t) => t.role === "participant" && t.kind === "answer" && !t.removedAt && t.sentences.length > 0);
    if (answers.length === 0) throw new HttpError(409, "no_answers", "Answer at least one question before sending");
    const at = nowOf(options);
    await db.transaction(async (tx) => {
      await tx.update(application).set({ status: "submitted", submittedAt: at }).where(eq(application.id, applicationId));
      await audit(tx, {
        actor: actorOf(app.talentId),
        action: "application.submitted",
        subjectType: "application",
        subjectId: applicationId,
        detail: { talentId: app.talentId, jobId: app.jobId, answers: answers.length },
      });
    });
    await enqueue(db, ASSESS_KIND, { applicationId }, { dedupeKey: `${ASSESS_KIND}:${applicationId}` });
  });
}

/** Deletes the application with its turns, in any status, and audits `application.withdrawn`. */
export function withdrawApplication(db: Db, applicationId: string, options?: EngineOptions): Promise<void> {
  void options;
  return withLock(applicationId, async () => {
    const app = await requireApp(db, applicationId);
    await db.transaction(async (tx) => {
      await dropFromRanking(tx, app.jobId, applicationId);
      await tx.delete(application).where(eq(application.id, applicationId)); // turns cascade
      await audit(tx, {
        actor: actorOf(app.talentId),
        action: "application.withdrawn",
        subjectType: "application",
        subjectId: applicationId,
        detail: { talentId: app.talentId, jobId: app.jobId, status: app.status },
      });
    });
  });
}

/* ------------------------------------------- reading ------------------------------------------- */

/** The session's person must own the application. Throws 401, or 404 when it is not theirs or does not exist. Returns the talent id. */
export async function requireOwnApplication(db: Db, applicationId: string): Promise<string> {
  const talentId = await requireTalent();
  const [row] = await db
    .select({ talentId: application.talentId })
    .from(application)
    .where(eq(application.id, applicationId));
  if (!row || row.talentId !== talentId) throw new HttpError(404, "not_found", "Application not found");
  return talentId;
}

/** Everything the person's own pages show about one application. Built field by field. */
export interface OwnApplication {
  id: string;
  jobId: string;
  companyName: string;
  masked: boolean;
  /** The Need Card's title, employer masked. */
  title: string;
  status: ApplicationStatus;
  plan: ApplicationPlan;
  state: ApplicationState;
  /** All turns in order. A removed answer has empty text and sentences. */
  turns: ApplicationTurn[];
  /** Null until assessed. */
  assessment: ApplicationAssessment | null;
  /** Points under the Need Card as it is now. Null until assessed. */
  points: { points: number; maxPoints: number } | null;
  /** The person's place on the list an organiser approved, when they are on it. */
  position: { position: number; of: number; approvedAt: string } | null;
  createdAt: string;
  submittedAt: string | null;
}

/** Company name, masked flag and masked title of a job, even when its Need Card is gone. */
async function jobHeading(db: Db, jobId: string, companyId: string) {
  const ctx = await loadJobContext(db, jobId);
  if (ctx) return { companyName: ctx.companyName, masked: ctx.masked, title: ctx.mask(ctx.card.title) };
  const [co] = await db.select().from(company).where(eq(company.id, companyId));
  const [posting] = await db.select({ title: job.title, employerName: job.employerName }).from(job).where(eq(job.id, jobId));
  const masked = co?.masked ?? true;
  const terms = masked ? employerTerms(co?.realName, posting?.employerName) : [];
  return {
    companyName: co?.displayName ?? "",
    masked,
    title: terms.length ? maskEmployer(posting?.title ?? "", terms) : (posting?.title ?? ""),
  };
}

/** The person's own application, or null when it does not exist or is not theirs. */
export async function loadOwnApplication(db: Db, talentId: string, applicationId: string): Promise<OwnApplication | null> {
  const app = await loadApp(db, applicationId);
  if (!app || app.talentId !== talentId) return null;
  const turns = await loadTurns(db, applicationId);
  const heading = await jobHeading(db, app.jobId, app.companyId);
  const assessment = app.assessment ? ApplicationAssessment.parse(app.assessment) : null;
  let points: OwnApplication["points"] = null;
  if (assessment) {
    const { points: p, maxPoints } = applicationPoints(assessment.ratings, await currentRequirementKinds(db, app.jobId));
    points = { points: p, maxPoints };
  }
  const position = assessment ? await ownPosition(db, applicationId) : null;
  return {
    id: app.id,
    jobId: app.jobId,
    ...heading,
    status: app.status,
    plan: app.plan,
    state: app.state,
    turns: turns.map(publicTurn),
    assessment,
    points,
    position,
    createdAt: app.createdAt.toISOString(),
    submittedAt: app.submittedAt ? app.submittedAt.toISOString() : null,
  };
}

/** For "download my data": every application of the person with its turns and assessment. */
export async function exportApplications(db: Db, talentId: string): Promise<unknown[]> {
  const rows = await db.select({ id: application.id }).from(application).where(eq(application.talentId, talentId));
  const out: unknown[] = [];
  for (const { id } of rows) {
    const app = await loadApp(db, id);
    if (!app) continue;
    const turns = await loadTurns(db, id);
    const heading = await jobHeading(db, app.jobId, app.companyId);
    out.push({
      id: app.id,
      jobId: app.jobId,
      company: heading.companyName,
      title: heading.title,
      status: app.status,
      plan: app.plan,
      state: app.state,
      turns: turns.map((t) => ({
        index: t.index,
        role: t.role,
        kind: t.kind,
        requirementId: t.requirementId,
        text: t.removedAt ? null : t.text,
        sentences: t.removedAt ? [] : t.sentences,
        inputMode: t.inputMode,
        removed: t.removedAt !== null,
        at: t.at,
      })),
      assessment: app.assessment,
      createdAt: app.createdAt.toISOString(),
      submittedAt: app.submittedAt ? app.submittedAt.toISOString() : null,
    });
  }
  return out;
}

