/**
 * Public API of the interview feature (stream S1a). Signatures are fixed by
 * docs/FEATURE-API.md; the owning stream replaces these stub bodies.
 */
import type { Db } from "@/db/client";
import type {
  InterviewEvent,
  StartInterviewRequest,
  StartInterviewResponse,
  TurnRequest,
} from "@/contracts";

function notImplemented(name: string): never {
  throw new Error(`@/features/interview: ${name} is not implemented yet`);
}

export async function startInterview(
  _db: Db,
  _request: StartInterviewRequest,
): Promise<StartInterviewResponse> {
  return notImplemented("startInterview");
}

// eslint-disable-next-line require-yield
export async function* submitTurn(
  _db: Db,
  _interviewId: string,
  _request: TurnRequest,
  _opts?: { signal?: AbortSignal },
): AsyncIterable<InterviewEvent> {
  notImplemented("submitTurn");
}

// eslint-disable-next-line require-yield
export async function* followEvents(
  _db: Db,
  _interviewId: string,
  _opts?: { afterEventId?: number; signal?: AbortSignal },
): AsyncIterable<{ id: number; event: InterviewEvent }> {
  notImplemented("followEvents");
}

export async function stopInterview(_db: Db, _interviewId: string): Promise<void> {
  return notImplemented("stopInterview");
}

export async function settleInterview(
  _db: Db,
  _interviewId: string,
  _timeoutMs?: number,
): Promise<void> {
  return notImplemented("settleInterview");
}
