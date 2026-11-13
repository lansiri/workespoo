import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { appMeta } from "@/db/schema";
import { defineJob, enqueue, type JobDefinition, type Schedule } from "@/lib/queue";
import { draftDailyDigests } from "./draft";
import { eventIdOf, getCurrentEvent, loadSettings } from "./settings";
import { DATE_RE, helsinkiDate, helsinkiTime } from "./time";

export const DAILY_DRAFT_KIND = "picks.draft_daily";
export const DAILY_TICK_KIND = "picks.daily_tick";

const markerKey = (date: string) => `picks:daily_run:${date}`;

async function hasRun(db: Db, date: string): Promise<boolean> {
  const [row] = await db.select().from(appMeta).where(eq(appMeta.key, markerKey(date))).limit(1);
  return Boolean(row);
}

async function markRun(db: Db, date: string): Promise<void> {
  await db
    .insert(appMeta)
    .values({ key: markerKey(date), value: { at: new Date().toISOString() } })
    .onConflictDoUpdate({ target: appMeta.key, set: { value: { at: new Date().toISOString() }, updatedAt: new Date() } });
}

/**
 * Runs hourly. Once the Helsinki time has passed `dailyRunAt` and today's drafting has not
 * run, enqueue it once. `now` is injected so tests do not depend on the clock.
 */
export async function dailyTick(db: Db, now: Date): Promise<{ enqueued: boolean; date: string }> {
  const date = helsinkiDate(now);
  const settings = await loadSettings(db, eventIdOf(await getCurrentEvent(db)));
  if (helsinkiTime(now) < settings.dailyRunAt || (await hasRun(db, date))) return { enqueued: false, date };
  await enqueue(db, DAILY_DRAFT_KIND, { date }, { dedupeKey: `picks:daily:${date}` });
  return { enqueued: true, date };
}

export const jobs: JobDefinition[] = [
  defineJob(DAILY_DRAFT_KIND, z.object({ date: z.string().regex(DATE_RE) }), async ({ date }, { db }) => {
    await draftDailyDigests(db, date);
    await markRun(db, date);
  }),
  defineJob(DAILY_TICK_KIND, z.object({}).passthrough(), async (_payload, { db }) => {
    await dailyTick(db, new Date());
  }),
];

export const schedules: Schedule[] = [{ kind: DAILY_TICK_KIND, everyMinutes: 60 }];
