import { getDb } from "@/db/client";
import { approveCard } from "@/features/card";
import { route } from "@/lib/http";
import { requireTalent } from "@/lib/session";

export const dynamic = "force-dynamic";

export const POST = route(async () => {
  const talentId = await requireTalent();
  return Response.json(await approveCard(getDb(), talentId));
});
