import { getDb } from "@/db/client";
import { requireOwnApplication, skipApplicationQuestion } from "@/features/application";
import { assertInterviewing } from "@/features/application/engine-store";
import { route } from "@/lib/http";
import { sseResponse } from "@/lib/sse";

export const dynamic = "force-dynamic";

/** "Skip question": the requirement is marked skipped and the next line streams as in a turn. */
export const POST = route(async (_request: Request, ctx: RouteContext<"/api/application/[id]/skip">) => {
  const { id } = await ctx.params;
  const db = getDb();
  await requireOwnApplication(db, id);
  await assertInterviewing(db, id);
  return sseResponse(async (send, signal) => {
    for await (const event of skipApplicationQuestion(db, id, { signal })) send(event as never);
  });
});
