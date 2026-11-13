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
