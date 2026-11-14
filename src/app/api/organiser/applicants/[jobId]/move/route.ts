import { z } from "zod";
import { MoveApplicantRequest } from "@/contracts";
import { getDb } from "@/db/client";
import { moveApplicant } from "@/features/application";
import { parseBody, route } from "@/lib/http";
import { requireOrganiser } from "@/lib/session";

export const dynamic = "force-dynamic";

const Params = z.object({ jobId: z.string().min(1).max(64) });

/** Puts one applicant at a position, with a written reason. */
export const POST = route(async (request, ctx: RouteContext<"/api/organiser/applicants/[jobId]/move">) => {
  await requireOrganiser();
  const { jobId } = Params.parse(await ctx.params);
  const body = await parseBody(request, MoveApplicantRequest);
  await moveApplicant(getDb(), jobId, body);
  return Response.json({ ok: true });
});
