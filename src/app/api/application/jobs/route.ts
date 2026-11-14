import { getDb } from "@/db/client";
import { listApplyJobs } from "@/features/application";
import { route } from "@/lib/http";
import { requireTalent } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The event's jobs for the signed-in person, with the status of their own application to each. */
export const GET = route(async () => {
  const talentId = await requireTalent();
  return Response.json({ jobs: await listApplyJobs(getDb(), talentId) });
});
