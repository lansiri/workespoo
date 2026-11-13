import { StartInterviewRequest } from "@/contracts";
import { getDb } from "@/db/client";
import { startInterview } from "@/features/interview";
import { parseBody, route } from "@/lib/http";
import { setTalentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Start an interview: creates the talent and sets the talent session cookie. */
export const POST = route(async (request: Request) => {
  const body = await parseBody(request, StartInterviewRequest);
  const result = await startInterview(getDb(), body);
  await setTalentSession(result.talentId);
  return Response.json(result);
});
