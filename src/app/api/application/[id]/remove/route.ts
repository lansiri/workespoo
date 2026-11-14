import { z } from "zod";
import { getDb } from "@/db/client";
import { removeApplicationAnswer, requireOwnApplication } from "@/features/application";
import { parseBody, route } from "@/lib/http";

export const dynamic = "force-dynamic";

const RemoveRequest = z.object({ turnIndex: z.number().int().min(1) });

/** "Remove this answer": its words and what was noted from it are removed. */
export const POST = route(async (request: Request, ctx: RouteContext<"/api/application/[id]/remove">) => {
  const { id } = await ctx.params;
  const db = getDb();
  await requireOwnApplication(db, id);
  const { turnIndex } = await parseBody(request, RemoveRequest);
  await removeApplicationAnswer(db, id, turnIndex);
  return Response.json({ ok: true });
});
