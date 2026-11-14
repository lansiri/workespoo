import { StartApplicationRequest } from "@/contracts";
import { getDb } from "@/db/client";
import { startApplication } from "@/features/application";
import { parseBody, route } from "@/lib/http";
import { requireTalent } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Start a job interview. Needs the `job_assessment` consent in the body; without it nothing is stored. */
export const POST = route(async (request: Request) => {
  const talentId = await requireTalent();
  const body = await parseBody(request, StartApplicationRequest);
  return Response.json(await startApplication(getDb(), talentId, body, { signal: request.signal }));
});
