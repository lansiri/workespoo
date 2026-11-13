import { TurnRequest } from "@/contracts";
import { getDb } from "@/db/client";
import { isKnownTurnKey, submitTurn } from "@/features/interview";
import { assertOpen, requireOwnedInterview } from "@/features/interview/access";
import { parseBody, route } from "@/lib/http";
import { sseResponse } from "@/lib/sse";

export const dynamic = "force-dynamic";

/**
 * One participant turn. The response is a server-sent event stream of `turn.delta` and
 * `turn.done`. A client that retries after a network error sends the same `Idempotency-Key`
 * header, so the answer is stored once.
 */
export const POST = route(async (request: Request, ctx: RouteContext<"/api/interview/[id]/turn">) => {
  const { id } = await ctx.params;
  const db = getDb();
  const row = await requireOwnedInterview(db, id);
  const body = await parseBody(request, TurnRequest);
  const idempotencyKey = request.headers.get("idempotency-key")?.slice(0, 80) || undefined;
  // A retry of an answer already accepted goes on to the replay, even if that answer ended the interview.
  const retryKey = (body as { clientTurnId?: string }).clientTurnId ?? idempotencyKey;
  if (!isKnownTurnKey(id, retryKey)) assertOpen(row);
  return sseResponse(async (send, signal) => {
    for await (const event of submitTurn(db, id, body, { signal, idempotencyKey })) send(event);
  });
});
