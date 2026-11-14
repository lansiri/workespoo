import { z } from "zod";
import { getDb } from "@/db/client";
import { unpinApplicant } from "@/features/application";
import { parseBody, route } from "@/lib/http";
import { requireOrganiser } from "@/lib/session";

export const dynamic = "force-dynamic";

const Params = z.object({ jobId: z.string().min(1).max(64) });
const Body = z.object({ applicationId: z.string().min(1).max(64) });

/** Puts an applicant back where the points place them. */
export const POST = route(async (request, ctx: RouteContext<"/api/organiser/applicants/[jobId]/unpin">) => {
  await requireOrganiser();
  const { jobId } = Params.parse(await ctx.params);
  const body = await parseBody(request, Body);
  await unpinApplicant(getDb(), jobId, body.applicationId);
  return Response.json({ ok: true });
});
