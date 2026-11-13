/**
 * Public API of the synthetic world (stream S4). Signatures are fixed by docs/FEATURE-API.md.
 */
import { eq, like } from "drizzle-orm";
import type { Db } from "@/db/client";
import { company, talent } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { realSeedDeps } from "./deps";
import { loadPersonas } from "./persona";
import { hasSnapshot, restoreDemoSnapshot } from "./snapshot";

/**
 * Puts the demo world back to the snapshot taken after seeding (`npm run seed -- --snapshot`).
 * Interviews, cards and Need Cards come from the snapshot with no model call; yesterday's
 * published digests and today's drafted ones are made again. The only model call left is the
 * reasons call of the picks feature, which has its own deadline and falls back to code-written
 * reasons, so a slow or absent model delays a reset by at most that deadline per pick.
 * `restored` is false when no snapshot exists; nothing is changed in that case.
 */
export async function resetDemoFromSnapshot(db: Db): Promise<{ restored: boolean; people: number; companies: number }> {
  if (!hasSnapshot()) return { restored: false, people: 0, companies: 0 };
  await restoreDemoSnapshot(db, { deps: realSeedDeps(), personas: loadPersonas(), appUrl: getEnv().APP_URL });
  const people = await db.select({ id: talent.id }).from(talent).where(eq(talent.synthetic, true));
  const companies = await db.select({ id: company.id }).from(company).where(like(company.id, "co_demo%"));
  return { restored: true, people: people.length, companies: companies.length };
}
