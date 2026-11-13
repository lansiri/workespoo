import { getDb } from "@/db/client";
import { HttpError, route } from "@/lib/http";
import { companyFromToken } from "@/lib/session";
import { companyNeedView, companyTokenFrom, confirmNeedCard } from "@/features/needs/actions";

export const dynamic = "force-dynamic";

/** The company confirms its need. Returns the company's view of the new version. */
export const POST = route(async (request: Request, ctx: RouteContext<"/api/needs/[id]/confirm">) => {
  const { id } = await ctx.params;
  const db = getDb();
  const token = companyTokenFrom(request);
  const company = token ? await companyFromToken(db, token) : null;
  if (!token || !company) throw new HttpError(401, "unauthenticated", "A company link is required");
  await confirmNeedCard(db, id, company.id);
  return Response.json(await companyNeedView(db, id, token));
});
