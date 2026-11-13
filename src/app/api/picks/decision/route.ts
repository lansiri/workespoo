import { getDb } from "@/db/client";
import { DecisionBody, decidePick } from "@/features/picks/decisions";
import { parseBody, route } from "@/lib/http";
import { requireOrganiser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** One pick, one decision. There is deliberately no endpoint that takes several. */
export const POST = route(async (request) => {
  await requireOrganiser();
  const body = await parseBody(request, DecisionBody);
  return Response.json(await decidePick(getDb(), body));
});
