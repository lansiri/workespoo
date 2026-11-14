import { z } from "zod";
import { getDb } from "@/db/client";
import { evidenceForOrganiser, rankedListForJob } from "@/features/application";
import { HttpError, route } from "@/lib/http";
import { requireOrganiser } from "@/lib/session";

export const dynamic = "force-dynamic";

const Params = z.object({ jobId: z.string().min(1).max(64) });
const Query = z.object({ application: z.string().min(1).max(64) });

/** The person's own words behind one applicant's ratings. Opened on demand by the organiser. */
export const GET = route(async (request, ctx: RouteContext<"/api/organiser/applicants/[jobId]/evidence">) => {
  await requireOrganiser();
  const { jobId } = Params.parse(await ctx.params);
  const { application } = Query.parse({ application: new URL(request.url).searchParams.get("application") });
  const db = getDb();
  const list = await rankedListForJob(db, jobId);
  if (!list?.applicants.some((a) => a.applicationId === application)) throw new HttpError(404, "unknown_applicant", "No such applicant for this job");
  return Response.json(await evidenceForOrganiser(db, application));
});
