import { desc, eq } from "drizzle-orm";
import { MATCHING_SETTINGS_DEFAULTS } from "@/contracts";
import type { Db } from "@/db/client";
import { appMeta, matchEvent } from "@/db/schema";
import { NO_EVENT_ID } from "./constants";

export type PicksSettings = {
  digestSize: number;
  rotationDays: number;
  maxPicksPerDay: number;
  dailyRunAt: string;
};

export type CurrentEvent = typeof matchEvent.$inferSelect;

/** The event the picks belong to: the one with the latest date. Null when none exists. */
export async function getCurrentEvent(db: Db): Promise<CurrentEvent | null> {
  const [row] = await db.select().from(matchEvent).orderBy(desc(matchEvent.date), desc(matchEvent.id)).limit(1);
  return row ?? null;
}

export function eventIdOf(event: CurrentEvent | null): string {
  return event?.id ?? NO_EVENT_ID;
}

async function readSetting(db: Db, eventId: string, key: string): Promise<unknown> {
  const [row] = await db.select().from(appMeta).where(eq(appMeta.key, `settings:${eventId}:${key}`)).limit(1);
  return row?.value;
}

function intSetting(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Defaults from `MATCHING_SETTINGS_DEFAULTS`, overridden by `app_meta` rows `settings:<eventId>:<key>`. */
export async function loadSettings(db: Db, eventId: string): Promise<PicksSettings> {
  const d = MATCHING_SETTINGS_DEFAULTS;
  const runAt = await readSetting(db, eventId, "dailyRunAt");
  return {
    digestSize: intSetting(await readSetting(db, eventId, "digestSize"), d.digestSize, 1, 20),
    rotationDays: intSetting(await readSetting(db, eventId, "rotationDays"), d.rotationDays, 1, 60),
    maxPicksPerDay: intSetting(await readSetting(db, eventId, "maxPicksPerDay"), d.maxPicksPerDay, 1, 20),
    dailyRunAt: typeof runAt === "string" && /^\d{2}:\d{2}$/.test(runAt) ? runAt : d.dailyRunAt,
  };
}
