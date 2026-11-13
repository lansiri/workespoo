import { getDb } from "@/db/client";
import { buildReviewQueue } from "@/features/picks/queue-view";
import { route } from "@/lib/http";
import { requireOrganiser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireOrganiser();
  return Response.json(await buildReviewQueue(getDb()));
});
