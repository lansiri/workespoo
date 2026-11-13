import { getDb } from "@/db/client";
import { matchesPayload } from "@/features/matching/payload";
import { route } from "@/lib/http";
import { requireTalent } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The session talent's job feed and introductions. */
export const GET = route(async () => {
  const talentId = await requireTalent();
  return Response.json(await matchesPayload(getDb(), talentId));
});
