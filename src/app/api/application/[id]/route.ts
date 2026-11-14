import { getDb } from "@/db/client";
import { loadOwnApplication, requireOwnApplication, withdrawApplication } from "@/features/application";
import { HttpError, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** The person's own application: plan, turns, state, and the assessment once it exists. */
export const GET = route(async (_request: Request, ctx: RouteContext<"/api/application/[id]">) => {
  const { id } = await ctx.params;
  const db = getDb();
  const talentId = await requireOwnApplication(db, id);
  const own = await loadOwnApplication(db, talentId, id);
  if (!own) throw new HttpError(404, "not_found", "Application not found");
  return Response.json(own);
});

/** Withdraw: the application is deleted with its turns and leaves every list. */
export const DELETE = route(async (_request: Request, ctx: RouteContext<"/api/application/[id]">) => {
  const { id } = await ctx.params;
  const db = getDb();
  await requireOwnApplication(db, id);
  await withdrawApplication(db, id);
  return Response.json({ ok: true });
});
