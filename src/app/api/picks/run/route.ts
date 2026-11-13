import { z } from "zod";
import { getDb } from "@/db/client";
import { draftDailyDigests } from "@/features/picks";
import { DATE_RE, helsinkiDate } from "@/features/picks/time";
import { HttpError, route } from "@/lib/http";
import { requireOrganiser } from "@/lib/session";

export const dynamic = "force-dynamic";

const Body = z.strictObject({ date: z.string().regex(DATE_RE).optional() });

/**
 * Runs today's drafting now, in this request, so the organiser sees the result at once.
 * Drafting is idempotent, so pressing it twice changes nothing. The body is optional.
 */
export const POST = route(async (request) => {
  await requireOrganiser();
  const raw: unknown = await request.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, "invalid_body", "Expected {} or { date: YYYY-MM-DD }");
  const result = await draftDailyDigests(getDb(), parsed.data.date ?? helsinkiDate(new Date()));
  return Response.json(result);
});
