import { getDb } from "@/db/client";
import { stopInterview } from "@/features/interview";
import { requireOwnedInterview } from "@/features/interview/access";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** The Stop button: ends the interview with the scripted line. A second stop does nothing. */
export const POST = route(async (_request: Request, ctx: RouteContext<"/api/interview/[id]/stop">) => {
  const { id } = await ctx.params;
  const db = getDb();
  await requireOwnedInterview(db, id);
  await stopInterview(db, id);
  return Response.json({ ok: true });
});
