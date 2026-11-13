/** Database handles for the two scripts: the real one, or an in-memory one for dry runs. */
import type { Db } from "@/db/client";

export type OpenedDb = { db: Db; close: () => Promise<void>; memory: boolean };

/** `memory` opens PGlite with the fixture postings and ESCO subset; nothing is saved. */
export async function openDb(memory: boolean): Promise<OpenedDb> {
  if (memory) {
    const { createTestDb } = await import("../../../tests/helpers/db");
    const { loadJobFixtures } = await import("../../../fixtures/load");
    const t = await createTestDb();
    await loadJobFixtures(t.db);
    return { db: t.db, close: t.close, memory: true };
  }
  const { getDb, closeDb } = await import("@/db/client");
  return { db: getDb() as unknown as Db, close: closeDb, memory: false };
}

/**
 * Which database `npm run sim` uses. The default is in memory (the real features on PGlite),
 * so a bare run never writes synthetic people into a real pool. `--db` opts in to DATABASE_URL;
 * the fake engine never touches it.
 */
export function simUsesMemory(flags: { db?: boolean; fake?: boolean; pglite?: boolean }): boolean {
  if (flags.fake) {
    if (flags.db) throw new Error("--fake never runs against the real database; drop --db");
    return true;
  }
  return !flags.db;
}

/** Simulated people are opted into the pool for good: refuse to add them next to a seeded demo. */
export async function assertNoDemoEvent(db: Db, eventId: string): Promise<void> {
  const { eq } = await import("drizzle-orm");
  const { matchEvent } = await import("@/db/schema");
  const rows = await db.select({ id: matchEvent.id }).from(matchEvent).where(eq(matchEvent.id, eventId));
  if (rows.length > 0) throw new Error(`The demo event ${eventId} exists in this database. Simulated interviews would leave synthetic people in its pool. Run npm run seed -- --reset first, or leave out --db to simulate in memory.`);
}
