/**
 * Public API of the synthetic world (stream S4). Signatures are fixed by docs/FEATURE-API.md.
 * This body is a placeholder until the second pass lands.
 */
import type { Db } from "@/db/client";

export async function resetDemoFromSnapshot(_db: Db): Promise<{ restored: boolean; people: number; companies: number }> {
  return { restored: false, people: 0, companies: 0 };
}
