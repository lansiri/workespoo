import { getDb } from "@/db/client";
import { HttpError, parseBody, route } from "@/lib/http";
import { companyFromToken } from "@/lib/session";
import { AnswerInput, answerQuestion, companyNeedView, companyTokenFrom } from "@/features/needs/actions";

export const dynamic = "force-dynamic";

/** The company answers the question on one requirement. Returns the company's view of the new version. */
export const POST = route(async (request: Request, ctx: RouteContext<"/api/needs/[id]/answer">) => {
  const { id } = await ctx.params;
  const db = getDb();
  const token = companyTokenFrom(request);
  const company = token ? await companyFromToken(db, token) : null;
  if (!token || !company) throw new HttpError(401, "unauthenticated", "A company link is required");
  const input = await parseBody(request, AnswerInput);
  await answerQuestion(db, id, company.id, input);
  return Response.json(await companyNeedView(db, id, token));
});
