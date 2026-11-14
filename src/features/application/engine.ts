import type {
  ApplicationAssessment,
  ApplicationEvent,
  ApplicationPlan,
  ApplicationState,
  ApplicationStatus,
  ApplicationTurn,
  ApplicationTurnRequest,
  StartApplicationRequest,
  StartApplicationResponse,
} from "@/contracts";
import type { Db } from "@/db/client";

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

/**
 * Starts an application for the signed-in person: checks the approved card and the job,
 * records the `job_assessment` consent, makes the plan (the model words the questions; code
 * checks them and falls back to scripted wording), stores the opening turn and audits
 * `application.started`. Throws 409 `already_applied` when one exists for this job,
 * 409 `no_approved_card`, 404 `unknown_job`.
 */
export function startApplication(
  db: Db,
  talentId: string,
  request: StartApplicationRequest,
  options?: EngineOptions,
): Promise<StartApplicationResponse> {
  void db;
  void talentId;
  void request;
  void options;
  throw new Error("not built yet");
}

/**
 * One answer. Yields, in this order: `answer.stored`; `requirement.noted` when words were
 * noted; `turn.delta` for each sentence of the interviewer's next line; `turn.done` with the
 * stored interviewer turn (`ended: true` on the closing line, when the status is `review`).
 * The same `clientTurnId` again replays the stored result without storing a second answer.
 */
export function submitApplicationTurn(
  db: Db,
  applicationId: string,
  request: ApplicationTurnRequest,
  options?: EngineOptions,
): AsyncGenerator<ApplicationEvent, void, void> {
  void db;
  void applicationId;
  void request;
  void options;
  throw new Error("not built yet");
}

/** The person passes on the current question: the requirement is marked skipped, and the next line is yielded as in a turn. */
export function skipApplicationQuestion(
  db: Db,
  applicationId: string,
  options?: EngineOptions,
): AsyncGenerator<ApplicationEvent, void, void> {
  void db;
  void applicationId;
  void options;
  throw new Error("not built yet");
}

/** The person stops the interview: the scripted closing line is stored and the status becomes `review`. Returns that turn. */
export function stopApplicationInterview(db: Db, applicationId: string, options?: EngineOptions): Promise<ApplicationTurn> {
  void db;
  void applicationId;
  void options;
  throw new Error("not built yet");
}

/**
 * Removes one of the person's answers (status `interviewing` or `review`): its text and
 * sentences are blanked, `removedAt` is set, what was noted from it is dropped, and its
 * requirement counts as unanswered unless another answer of theirs still speaks to it.
 */
export function removeApplicationAnswer(db: Db, applicationId: string, turnIndex: number, options?: EngineOptions): Promise<void> {
  void db;
  void applicationId;
  void turnIndex;
  void options;
  throw new Error("not built yet");
}

/**
 * Sends the application (status `review`, at least one answer that is not removed): status
 * `submitted`, `submittedAt`, audit `application.submitted`, and the `application.assess`
 * job is enqueued with the application id as its dedupe key.
 */
export function submitApplication(db: Db, applicationId: string, options?: EngineOptions): Promise<void> {
  void db;
  void applicationId;
  void options;
  throw new Error("not built yet");
}

/** Deletes the application with its turns, in any status, and audits `application.withdrawn`. */
export function withdrawApplication(db: Db, applicationId: string, options?: EngineOptions): Promise<void> {
  void db;
  void applicationId;
  void options;
  throw new Error("not built yet");
}

/** The session's person must own the application. Throws 401, or 404 when it is not theirs or does not exist. Returns the talent id. */
export function requireOwnApplication(db: Db, applicationId: string): Promise<string> {
  void db;
  void applicationId;
  throw new Error("not built yet");
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

/** The person's own application, or null when it does not exist or is not theirs. */
export function loadOwnApplication(db: Db, talentId: string, applicationId: string): Promise<OwnApplication | null> {
  void db;
  void talentId;
  void applicationId;
  throw new Error("not built yet");
}

/** For "download my data": every application of the person with its turns and assessment. */
export function exportApplications(db: Db, talentId: string): Promise<unknown[]> {
  void db;
  void talentId;
  throw new Error("not built yet");
}
