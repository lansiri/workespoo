import { z } from "zod";
import { getDb } from "@/db/client";
import { rankedListForJob } from "@/features/application";
import { HttpError, route } from "@/lib/http";
import { requireOrganiser } from "@/lib/session";

export const dynamic = "force-dynamic";

const Params = z.object({ jobId: z.string().min(1).max(64) });


/** The ranked list of one job, draft order with pins, and the approved list. */
export const GET = route(async (_request, ctx: RouteContext<"/api/organiser/applicants/[jobId]">) => {
  await requireOrganiser();
  const { jobId } = Params.parse(await ctx.params);
  const list = await rankedListForJob(getDb(), jobId);
  if (!list) throw new HttpError(404, "unknown_job", "No such job");
  return Response.json(list);
});
