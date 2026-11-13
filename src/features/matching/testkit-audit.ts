/** Test helper: audit rows by action. */
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { auditLog } from "@/db/schema";

export async function audit_rows(db: Db, action: string) {
  return db.select().from(auditLog).where(eq(auditLog.action, action));
}
