import { getDb } from "@/db/client";
import { exportPersonData } from "@/features/card";
import { route } from "@/lib/http";
import { requireTalent } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Everything stored about the session's person, as one JSON download. */
export const GET = route(async () => {
  const talentId = await requireTalent();
  const data = await exportPersonData(getDb(), talentId);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="my-workespoo-data.json"',
      "cache-control": "no-store",
    },
  });
});
