import { getDb } from "@/db/client";
import { requireOwnApplication, stopApplicationInterview } from "@/features/application";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** The Stop button: the rest is left unanswered and the application goes to review. */
export const POST = route(async (_request: Request, ctx: RouteContext<"/api/application/[id]/stop">) => {
  const { id } = await ctx.params;
  const db = getDb();
  await requireOwnApplication(db, id);
  return Response.json({ turn: await stopApplicationInterview(db, id) });
});
