import { z } from "zod";
import { getDb } from "@/db/client";
import { approveRanking } from "@/features/application";
import { HttpError, route } from "@/lib/http";
import { requireOrganiser } from "@/lib/session";

export const dynamic = "force-dynamic";

const Body = z.object({ seen: z.string().max(20000).optional() });
const Params = z.object({ jobId: z.string().min(1).max(64) });

/** Approves the list as it stands: from now the company sees exactly this. */
export const POST = route(async (request, ctx: RouteContext<"/api/organiser/applicants/[jobId]/approve">) => {
  await requireOrganiser();
  const { jobId } = Params.parse(await ctx.params);
  // The body is optional: `seen` is the list signature the organiser looked at.
  const text = await request.text();
  let raw: unknown = {};
  try {
    if (text.trim() !== "") raw = JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_body", "Request body must be valid JSON");
  }
  const { seen } = Body.parse(raw);
  const published = await approveRanking(getDb(), jobId, { seen });
  return Response.json({ approvedAt: published.publishedAt, count: published.applicants.length });
});
