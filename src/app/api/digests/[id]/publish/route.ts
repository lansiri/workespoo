import { z } from "zod";
import { getDb } from "@/db/client";
import { publishDigest } from "@/features/picks/decisions";
import { route } from "@/lib/http";
import { requireOrganiser } from "@/lib/session";

export const dynamic = "force-dynamic";

const Params = z.object({ id: z.string().min(1).max(64) });

export const POST = route(async (_request, ctx: RouteContext<"/api/digests/[id]/publish">) => {
  await requireOrganiser();
  const { id } = Params.parse(await ctx.params);
  return Response.json(await publishDigest(getDb(), id));
});
