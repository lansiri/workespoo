import { z } from "zod";
import { HttpError, parseBody, route } from "@/lib/http";
import { setOrganiserSession, verifyOrganiserPasscode } from "@/lib/session";

export const dynamic = "force-dynamic";

const Body = z.strictObject({ passcode: z.string().min(1).max(200) });

export const POST = route(async (request) => {
  const { passcode } = await parseBody(request, Body);
  if (!verifyOrganiserPasscode(passcode)) throw new HttpError(401, "invalid_passcode", "That passcode is not right");
  await setOrganiserSession();
  return Response.json({ ok: true });
});
