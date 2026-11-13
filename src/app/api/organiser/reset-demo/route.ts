import { getDb } from "@/db/client";
import { resetDemoFromSnapshot } from "@/features/synth";
import { route } from "@/lib/http";
import { requireOrganiser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Restores the saved demo state. `restored: false` means no snapshot exists and nothing changed. */
export const POST = route(async () => {
  await requireOrganiser();
  return Response.json(await resetDemoFromSnapshot(getDb()));
});
