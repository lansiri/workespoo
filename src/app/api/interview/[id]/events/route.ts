import { getDb } from "@/db/client";
import { followEvents } from "@/features/interview";
import { requireOwnedInterview } from "@/features/interview/access";
import { sseResponseWithIds } from "@/features/interview/sse-stream";
import { route } from "@/lib/http";

export const dynamic = "force-dynamic";

function afterId(request: Request): number {
  const raw = request.headers.get("last-event-id") ?? new URL(request.url).searchParams.get("after") ?? "";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Background events: signals, coverage, jobs lit, completion and card ready. Replays what
 * was missed after `Last-Event-ID` (or `?after=`), then follows until the client leaves.
 */
export const GET = route(async (request: Request, ctx: RouteContext<"/api/interview/[id]/events">) => {
  const { id } = await ctx.params;
  const db = getDb();
  await requireOwnedInterview(db, id);
  const afterEventId = afterId(request);
  return sseResponseWithIds(async (send, signal) => {
    for await (const { id: eventId, event } of followEvents(db, id, { afterEventId, signal })) send(eventId, event);
  }, request.signal);
});
