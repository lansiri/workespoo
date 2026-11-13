import { llmCall } from "@/db/schema";
import type { Db } from "@/db/client";

/** The role and purpose of every model call logged so far. Tests only. */
export async function llmCalls(db: Db): Promise<Array<{ role: string; purpose: string }>> {
  const rows = await db.select({ role: llmCall.role, purpose: llmCall.purpose }).from(llmCall).orderBy(llmCall.id);
  return rows;
}
