import { z } from "zod";
import { getDb } from "@/db/client";
import { askToMeetApplicant } from "@/features/application";
import { parseBody, route } from "@/lib/http";

export const dynamic = "force-dynamic";

const Body = z.object({ token: z.string().min(1).max(200), applicationId: z.string().min(1).max(64) });

/** A company, by its private link, asks to meet an applicant on its approved list. */
export const POST = route(async (request) => {
  const body = await parseBody(request, Body);
  return Response.json(await askToMeetApplicant(getDb(), body));
});
