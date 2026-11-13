import { and, count, eq, gt, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db/client";
import { auditLog, job, llmCall } from "@/db/schema";

/** Totals for the "What this system has done so far" section. Never about one person. */
export interface HowStats {
  openPostings: number;
  modelCalls: number;
  /** Median milliseconds to the first word of live replies in the last 24 hours, or null. */
  firstWordMedianMs: number | null;
  picksApproved: number;
  picksRemoved: number;
  introsAgreed: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Read the totals. Returns null when the database cannot be read. */
export async function loadStats(db: Db, now: Date = new Date()): Promise<HowStats | null> {
  try {
    const since = new Date(now.getTime() - DAY_MS);
    const [postings] = await db
      .select({ n: count() })
      .from(job)
      .where(and(eq(job.active, true), or(isNull(job.expiresAt), gt(job.expiresAt, now))));
    const [calls] = await db.select({ n: count() }).from(llmCall);
    const [median] = await db
      .select({ ms: sql<number | null>`percentile_cont(0.5) within group (order by ${llmCall.firstTokenMs})` })
      .from(llmCall)
      .where(
        and(eq(llmCall.role, "live"), eq(llmCall.ok, true), isNotNull(llmCall.firstTokenMs), gte(llmCall.at, since)),
      );
    const audits = await db
      .select({ action: auditLog.action, n: count() })
      .from(auditLog)
      .where(inArray(auditLog.action, ["pick.approved", "pick.removed", "intro.accepted"]))
      .groupBy(auditLog.action);
    const by = (a: string) => Number(audits.find((r) => r.action === a)?.n ?? 0);
    const ms = median?.ms;
    return {
      openPostings: Number(postings?.n ?? 0),
      modelCalls: Number(calls?.n ?? 0),
      firstWordMedianMs: ms === null || ms === undefined ? null : Number(ms),
      picksApproved: by("pick.approved"),
      picksRemoved: by("pick.removed"),
      introsAgreed: by("intro.accepted"),
    };
  } catch (err) {
    console.warn("[how-it-works] could not read totals:", err instanceof Error ? err.message : "unknown error");
    return null;
  }
}

const TTL_MS = 60_000;
let cached: { at: number; value: HowStats } | undefined;

/** `loadStats` on the production database, kept for a minute. Failures are not cached. */
export async function getCachedStats(now: number = Date.now()): Promise<HowStats | null> {
  if (cached && now - cached.at < TTL_MS) return cached.value;
  let db: Db;
  try {
    db = getDb();
  } catch {
    return null;
  }
  const value = await loadStats(db, new Date(now));
  if (value) cached = { at: now, value };
  return value;
}

/** For tests. */
export function resetStatsCache(): void {
  cached = undefined;
}
