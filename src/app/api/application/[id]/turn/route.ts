import { ApplicationTurnRequest, type ApplicationEvent } from "@/contracts";
import { getDb } from "@/db/client";
import { requireOwnApplication, submitApplicationTurn } from "@/features/application";
import { assertInterviewing } from "@/features/application/engine-store";
import { parseBody, route } from "@/lib/http";
import { sseResponse } from "@/lib/sse";

export const dynamic = "force-dynamic";

/**
 * One answer. The response is a server-sent event stream of `ApplicationEvent`. A client that
 * retries after a network error sends the same `clientTurnId`, so the answer is stored once.
 */
export const POST = route(async (request: Request, ctx: RouteContext<"/api/application/[id]/turn">) => {
  const { id } = await ctx.params;
  const db = getDb();
  await requireOwnApplication(db, id);
  const body = await parseBody(request, ApplicationTurnRequest);
  await assertInterviewing(db, id, body.clientTurnId);
  return sseResponse<ApplicationEvent>(async (send, signal) => {
    for await (const event of submitApplicationTurn(db, id, body, { signal })) send(event);
  });
});
