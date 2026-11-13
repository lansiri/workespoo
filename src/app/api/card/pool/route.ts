import { z } from "zod";
import { getDb } from "@/db/client";
import { setPoolOptIn } from "@/features/card";
import { parseBody, route } from "@/lib/http";
import { requireTalent } from "@/lib/session";

export const dynamic = "force-dynamic";

const Body = z.object({ inPool: z.boolean() });

export const POST = route(async (request) => {
  const talentId = await requireTalent();
  const { inPool } = await parseBody(request, Body);
  await setPoolOptIn(getDb(), talentId, inPool);
  return Response.json({ inPool });
});
