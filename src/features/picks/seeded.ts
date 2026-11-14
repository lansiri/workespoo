import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { auditLog } from "@/db/schema";

/** True when any audit row was written by the demo seed, so the pages may say the history was seeded. */
export async function hasSeededHistory(db: Db): Promise<boolean> {
  const rows = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(sql`${auditLog.detail}->>'seeded' = 'true'`)
    .limit(1);
  return rows.length > 0;
}
