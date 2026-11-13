import { getDb } from "@/db/client";
import { route } from "@/lib/http";
import { getSession } from "@/lib/session";
import { companyTokenFrom, organiserNeedView, resolveNeedAccess } from "@/features/needs/actions";
import { buildCompanyView } from "@/features/needs/view";

export const dynamic = "force-dynamic";

/** The Need Card, to its own company (link secret) or to an organiser session. */
export const GET = route(async (request: Request, ctx: RouteContext<"/api/needs/[id]">) => {
  const { id } = await ctx.params;
  const db = getDb();
  const { organiser } = await getSession();
  const { access, card } = await resolveNeedAccess(db, id, { token: companyTokenFrom(request), organiser: organiser === true });
  if (access.kind === "company") return Response.json(await buildCompanyView(db, card, access.company));
  return Response.json(organiserNeedView(card));
});
