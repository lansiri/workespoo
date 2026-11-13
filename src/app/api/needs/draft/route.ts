import { z } from "zod";
import { getDb } from "@/db/client";
import { HttpError, parseBody, route } from "@/lib/http";
import { requireOrganiser } from "@/lib/session";
import { getJob } from "@/features/jobs";
import { draftNeedCard } from "@/features/needs";
import { loadCompany } from "@/features/needs/view";

export const dynamic = "force-dynamic";

const Body = z.object({ jobId: z.string().min(1), companyId: z.string().min(1).nullable().optional() });

/** Organiser: draft (or draft again) the Need Card for a posting. Runs the model in this request. */
export const POST = route(async (request: Request) => {
  await requireOrganiser();
  const { jobId, companyId } = await parseBody(request, Body);
  const db = getDb();
  if (!(await getJob(db, jobId))) throw new HttpError(404, "job_not_found", "Posting not found");
  if (companyId && !(await loadCompany(db, companyId))) throw new HttpError(404, "company_not_found", "Company not found");
  try {
    return Response.json(await draftNeedCard(db, jobId, companyId ?? null));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error("needs.draft failed", error instanceof Error ? error.message : error);
    throw new HttpError(502, "draft_failed", "The draft could not be made. Try again.");
  }
});
