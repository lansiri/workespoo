import { z } from "zod";
import { getDb } from "@/db/client";
import { approveRanking } from "@/features/application";
import { route } from "@/lib/http";
import { requireOrganiser } from "@/lib/session";

export const dynamic = "force-dynamic";

const Params = z.object({ jobId: z.string().min(1).max(64) });

/** Approves the list as it stands: from now the company sees exactly this. */
export const POST = route(async (_request, ctx: RouteContext<"/api/organiser/applicants/[jobId]/approve">) => {
  await requireOrganiser();
  const { jobId } = Params.parse(await ctx.params);
  const published = await approveRanking(getDb(), jobId);
  return Response.json({ approvedAt: published.publishedAt, count: published.applicants.length });
});
