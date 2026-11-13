import { z } from "zod";
import { getDb } from "@/db/client";
import { requestToMeet } from "@/features/intros/service";
import { parseBody, route } from "@/lib/http";

export const dynamic = "force-dynamic";

const Body = z.strictObject({ token: z.string().min(1).max(200), pickId: z.string().min(1).max(64) });

/** A company asks to meet the person in one of its approved picks. The secret in its link is the credential. */
export const POST = route(async (request) => {
  const { token, pickId } = await parseBody(request, Body);
  const result = await requestToMeet(getDb(), { token, pickId });
  return Response.json(result, { status: 201 });
});
