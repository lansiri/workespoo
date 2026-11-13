/** Who may touch an interview, shared by the interview routes and pages. */
import type { Db } from "@/db/client";
import { HttpError } from "@/lib/http";
import { requireTalent } from "@/lib/session";
import { loadInterview, readState } from "./store";

/** The interview, if the session's talent owns it. Throws 401, 403 or 404. */
export async function requireOwnedInterview(db: Db, interviewId: string) {
  const talentId = await requireTalent();
  const row = await loadInterview(db, interviewId);
  if (!row) throw new HttpError(404, "not_found", "Interview not found");
  if (row.talentId !== talentId) throw new HttpError(403, "forbidden", "This is not your interview");
  return row;
}

/** A turn can only be submitted while the interview is open. Throws 409. */
export function assertOpen(row: NonNullable<Awaited<ReturnType<typeof loadInterview>>>): void {
  const stage = readState(row).stage;
  if (row.status !== "active" || stage === "closing" || stage === "synthesising") {
    throw new HttpError(409, "interview_closed", "This interview has ended");
  }
}
