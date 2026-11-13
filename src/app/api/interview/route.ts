import { StartInterviewRequest } from "@/contracts";
import { getDb } from "@/db/client";
import { startInterview } from "@/features/interview";
import { HttpError, parseBody, route } from "@/lib/http";
import { setTalentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Start an interview: creates the talent and sets the talent session cookie. */
export const POST = route(async (request: Request) => {
  const body = await parseBody(request, StartInterviewRequest);
  // Everyone who starts on the site is a live demo session: the acknowledgement is required.
  if (!body.consent.liveDemo) {
    throw new HttpError(400, "consent_required", "The live demo acknowledgement is required");
  }
  const result = await startInterview(getDb(), body);
  await setTalentSession(result.talentId);
  return Response.json(result);
});
