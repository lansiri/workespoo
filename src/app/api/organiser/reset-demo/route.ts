import { getDb } from "@/db/client";
import { resetDemoFromSnapshot } from "@/features/synth";
import { audit } from "@/lib/audit";
import { route } from "@/lib/http";
import { requireOrganiser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Restores the saved demo state. `restored: false` means no snapshot exists and nothing changed.
 * A restore is recorded in the audit log with counts only.
 */
export const POST = route(async () => {
  await requireOrganiser();
  const db = getDb();
  const result = await resetDemoFromSnapshot(db);
  if (result.restored) {
    await audit(db, {
      actor: "organiser",
      action: "demo.reset",
      subjectType: "system",
      subjectId: "demo",
      detail: { people: result.people, companies: result.companies },
    });
  }
  return Response.json(result);
});
