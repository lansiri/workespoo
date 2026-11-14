import { getDb } from "@/db/client";
import { requireOwnApplication, submitApplication } from "@/features/application";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** "Send my application": status `submitted`, and the assessment is queued. */
export const POST = route(async (_request: Request, ctx: RouteContext<"/api/application/[id]/submit">) => {
  const { id } = await ctx.params;
  const db = getDb();
  await requireOwnApplication(db, id);
  await submitApplication(db, id);
  return Response.json({ ok: true });
});
