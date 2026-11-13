/**
 * Public API of the synthetic world (stream S4). Signatures are fixed by docs/FEATURE-API.md.
 */
import { and, eq, like, lt } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appMeta, company, talent } from "@/db/schema";
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
 * `restored` is false when no snapshot exists; nothing is changed in that case. A second reset
 * while one runs throws "A demo reset is already running" (the route can answer 409).
 */
const RESET_LOCK_KEY = "demo:reset_running";
/** A lock older than this is a crashed reset and may be taken over. */
const RESET_LOCK_MAX_AGE_MS = 10 * 60_000;

/** One reset at a time: a claim row in app_meta, taken with an insert that does nothing on conflict. */
async function claimReset(db: Db): Promise<boolean> {
  await db.delete(appMeta).where(and(eq(appMeta.key, RESET_LOCK_KEY), lt(appMeta.updatedAt, new Date(Date.now() - RESET_LOCK_MAX_AGE_MS))));
  const claimed = await db.insert(appMeta).values({ key: RESET_LOCK_KEY, value: true }).onConflictDoNothing().returning({ key: appMeta.key });
  return claimed.length > 0;
}

export async function resetDemoFromSnapshot(db: Db): Promise<{ restored: boolean; people: number; companies: number }> {
  if (!hasSnapshot()) return { restored: false, people: 0, companies: 0 };
  if (!(await claimReset(db))) throw new Error("A demo reset is already running");
  try {
    await restoreDemoSnapshot(db, { deps: realSeedDeps(), personas: loadPersonas(), appUrl: getEnv().APP_URL });
  } finally {
    await db.delete(appMeta).where(eq(appMeta.key, RESET_LOCK_KEY));
  }
  const people = await db.select({ id: talent.id }).from(talent).where(eq(talent.synthetic, true));
  const companies = await db.select({ id: company.id }).from(company).where(like(company.id, "co_demo%"));
  return { restored: true, people: people.length, companies: companies.length };
}
