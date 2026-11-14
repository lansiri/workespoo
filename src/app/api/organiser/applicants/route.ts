import { getDb } from "@/db/client";
import { listJobsWithApplicants } from "@/features/application";
import { route } from "@/lib/http";
import { requireOrganiser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The event's jobs with their applicant counts. */
export const GET = route(async () => {
  await requireOrganiser();
  return Response.json({ jobs: await listJobsWithApplicants(getDb()) });
});
