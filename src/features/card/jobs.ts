import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { consent, talent } from "@/db/schema";
import { audit } from "@/lib/audit";
import { defineJob, type JobDefinition, type Schedule } from "@/lib/queue";
import { renderJobs } from "./render";

export const PURGE_KIND = "trust.purge_live_sessions";

/** Delete every real (non-synthetic) person whose `purgeAfter` has passed, whatever `liveDemo` says; the cascade removes everything else except consent rows, which are deleted here. */
export async function purgeLiveSessions(db: Db, now: Date = new Date()): Promise<number> {
  return db.transaction(async (tx) => {
    const gone = await tx
      .delete(talent)
      .where(and(eq(talent.synthetic, false), isNotNull(talent.purgeAfter), lte(talent.purgeAfter, now)))
      .returning({ id: talent.id });
    if (gone.length === 0) return 0;
    // consent has no foreign key to talent, so the cascade does not reach it.
    await tx.delete(consent).where(and(eq(consent.subjectType, "talent"), inArray(consent.subjectId, gone.map((g) => g.id))));
    await audit(tx, {
      actor: "system",
      action: "talent.purged",
      subjectType: "system",
      subjectId: "live_sessions",
      detail: { count: gone.length },
    });
    return gone.length;
  });
}

export const jobs: JobDefinition[] = [
  ...renderJobs,
  defineJob(PURGE_KIND, z.object({}).passthrough(), async (_payload, { db }) => {
    await purgeLiveSessions(db);
  }),
];

export const schedules: Schedule[] = [{ kind: PURGE_KIND, everyMinutes: 30, payload: {} }];
