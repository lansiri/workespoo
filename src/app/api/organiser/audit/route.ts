import { getDb } from "@/db/client";
import { listAudit, parseAuditAction, parseAuditBefore } from "@/features/picks/console";
import { route } from "@/lib/http";
import { requireOrganiser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  await requireOrganiser();
  const url = new URL(request.url);
  const page = await listAudit(getDb(), {
    action: parseAuditAction(url.searchParams.get("action")),
    before: parseAuditBefore(url.searchParams.get("before")),
  });
  return Response.json(page);
});
