import { z } from "zod";
import { getDb } from "@/db/client";
import { TalentAnswer, respondToIntro } from "@/features/intros/service";
import { parseBody, route } from "@/lib/http";
import { requireTalent } from "@/lib/session";

export const dynamic = "force-dynamic";

const Params = z.object({ id: z.string().min(1).max(64) });

/** The person accepts (with a name and a contact) or declines. The response carries no identity. */
export const POST = route(async (request, ctx: RouteContext<"/api/intros/[id]/respond">) => {
  const talentId = await requireTalent();
  const { id } = Params.parse(await ctx.params);
  const answer = await parseBody(request, TalentAnswer);
  return Response.json(await respondToIntro(getDb(), { introId: id, talentId, answer }));
});
