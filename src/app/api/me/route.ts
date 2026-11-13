import { getDb } from "@/db/client";
import { deletePerson } from "@/features/card";
import { route } from "@/lib/http";
import { clearSession, requireTalent } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Deletes the session's person and everything stored about them, then clears the session cookie. */
export const DELETE = route(async () => {
  const talentId = await requireTalent();
  const { deleted } = await deletePerson(getDb(), talentId);
  await clearSession();
  return Response.json({ deleted });
});
