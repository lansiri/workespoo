import { z } from "zod";
import { getDb } from "@/db/client";
import { removeAnswer } from "@/features/interview";
import { requireOwnedInterview } from "@/features/interview/access";
import { parseBody, route } from "@/lib/http";

export const dynamic = "force-dynamic";

const RemoveRequest = z.object({ turnIndex: z.number().int().min(1) });

/**
 * The remove control on one of the person's own answers. The answer's words and the evidence
 * built on it are removed; the reply is the scripted confirmation plus the same question again.
 */
export const POST = route(async (request: Request, ctx: RouteContext<"/api/interview/[id]/remove">) => {
  const { id } = await ctx.params;
  const db = getDb();
  await requireOwnedInterview(db, id);
  const { turnIndex } = await parseBody(request, RemoveRequest);
  return Response.json(await removeAnswer(db, id, turnIndex));
});
