import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { jobQueue } from "@/db/schema";
import { rowsOf } from "@/lib/sql";

export type JobContext = { db: Db; attempt: number };
export type JobDefinition = { kind: string; run(payload: unknown, ctx: JobContext): Promise<void> };
export type Schedule = { kind: string; everyMinutes: number; payload?: unknown };

/** Throw from a handler to fail a job for good, with no retries. */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

/** Retry delays after the 1st, 2nd and 3rd+ failure. */
export const BACKOFF_MS = [30_000, 120_000, 600_000] as const;
const ERROR_MAX_CHARS = 1000;
/** A claimed row whose worker vanished is reclaimable after this long. */
const LOCK_TIMEOUT_MS = 10 * 60_000;

export function defineJob<T>(
  kind: string,
  schema: z.ZodType<T>,
  handler: (payload: T, ctx: JobContext) => Promise<void>,
): JobDefinition {
  return {
    kind,
    async run(payload, ctx) {
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new PermanentJobError(`invalid payload for ${kind}: ${issue?.path.join(".") || "payload"}: ${issue?.message}`);
      }
      await handler(parsed.data, ctx);
    },
  };
}

type EnqueueOpts = { runAfter?: Date; dedupeKey?: string; maxAttempts?: number };

async function insertJob(db: Db, kind: string, payload: unknown, opts: EnqueueOpts, blockOnDone: boolean): Promise<boolean> {
  const runAfter = opts.runAfter ?? new Date();
  const maxAttempts = opts.maxAttempts ?? 3;
  const key = opts.dedupeKey ?? null;
  return db.transaction(async (tx) => {
    if (key !== null) {
      // Serialise concurrent enqueues of the same key so the existence check cannot race.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
    }
    const open = blockOnDone ? sql`true` : sql`done_at is null and attempts < max_attempts`;
    const result = await tx.execute(sql`
      insert into job_queue (kind, payload, dedupe_key, run_after, max_attempts)
      select ${kind}, ${JSON.stringify(payload ?? null)}::jsonb, ${key}::text, ${runAfter.toISOString()}::timestamptz, ${maxAttempts}::int
      where ${key}::text is null
         or not exists (select 1 from job_queue where dedupe_key = ${key}::text and ${open})
      returning id`);
    return rowsOf<{ id: number }>(result).length > 0;
  });
}

/**
 * Add a job. With `dedupeKey` it is a no-op while an open row with that key exists
 * (open = not done and not dead).
 */
export async function enqueue(db: Db, kind: string, payload: unknown, opts: EnqueueOpts = {}): Promise<void> {
  await insertJob(db, kind, payload, opts, false);
}

type Claimed = typeof jobQueue.$inferSelect;

/**
 * Claim the next ready job. Kinds listed in `last` are taken only when nothing else is ready,
 * so slow background work never holds up a job a person is waiting on.
 */
async function claim(db: Db, kinds: string[], workerId: string, last: string[] = []): Promise<Claimed | null> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - LOCK_TIMEOUT_MS);
  const lastKinds = last.filter((k) => kinds.includes(k));
  // No term at all when nothing is marked: a bare constant in ORDER BY means a column position.
  const order =
    lastKinds.length > 0
      ? [asc(sql`(${jobQueue.kind} IN (${sql.join(lastKinds.map((k) => sql`${k}`), sql`, `)}))::int`), asc(jobQueue.runAfter), asc(jobQueue.id)]
      : [asc(jobQueue.runAfter), asc(jobQueue.id)];
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(jobQueue)
      .where(
        and(
          isNull(jobQueue.doneAt),
          lte(jobQueue.runAfter, now),
          lt(jobQueue.attempts, jobQueue.maxAttempts),
          inArray(jobQueue.kind, kinds),
          or(isNull(jobQueue.lockedAt), lt(jobQueue.lockedAt, staleBefore)),
        ),
      )
      .orderBy(...order)
      .limit(1)
      .for("update", { skipLocked: true });
    if (!row) return null;
    await tx.update(jobQueue).set({ lockedAt: now, lockedBy: workerId }).where(eq(jobQueue.id, row.id));
    return row;
  });
}

async function finish(db: Db, row: Claimed, def: JobDefinition): Promise<void> {
  try {
    await def.run(row.payload, { db, attempt: row.attempts + 1 });
    await db.update(jobQueue).set({ doneAt: new Date(), lockedAt: null, lockedBy: null, error: null }).where(eq(jobQueue.id, row.id));
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, ERROR_MAX_CHARS);
    const permanent = err instanceof PermanentJobError;
    const attempts = permanent ? row.maxAttempts : row.attempts + 1;
    const dead = attempts >= row.maxAttempts;
    const delay = BACKOFF_MS[Math.min(row.attempts, BACKOFF_MS.length - 1)];
    await db
      .update(jobQueue)
      .set({
        attempts,
        error: message,
        lockedAt: null,
        lockedBy: null,
        ...(dead ? {} : { runAfter: new Date(Date.now() + delay) }),
      })
      .where(eq(jobQueue.id, row.id));
    console.error(`[queue] ${row.kind} #${row.id} ${dead ? "dead" : "failed"} (attempt ${attempts}/${row.maxAttempts}): ${message}`);
  }
}

async function drain(
  db: Db,
  definitions: JobDefinition[],
  workerId: string,
  signal?: AbortSignal,
  last: string[] = [],
): Promise<number> {
  const byKind = new Map(definitions.map((d) => [d.kind, d]));
  const kinds = [...byKind.keys()];
  if (kinds.length === 0) return 0;
  let ran = 0;
  while (!signal?.aborted) {
    const row = await claim(db, kinds, workerId, last);
    if (!row) break;
    await finish(db, row, byKind.get(row.kind)!);
    ran++;
  }
  return ran;
}

/**
 * Process every job that is ready now, then return how many ran (successes and failures).
 * Kinds in `opts.last` run only when nothing else is ready.
 */
export function runReadyJobs(db: Db, definitions: JobDefinition[], opts: { last?: string[] } = {}): Promise<number> {
  return drain(db, definitions, `ready-${process.pid}`, undefined, opts.last);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

/**
 * Long-running loop for the worker process. Resolves when `signal` aborts. Several loops may
 * run side by side (jobs are claimed with SKIP LOCKED, so none runs twice). Kinds in
 * `opts.last` are taken only when nothing else is ready.
 */
export async function runWorkerLoop(
  db: Db,
  definitions: JobDefinition[],
  opts: { pollMs?: number; signal?: AbortSignal; workerId?: string; last?: string[] } = {},
): Promise<void> {
  const pollMs = opts.pollMs ?? 1000;
  const workerId = opts.workerId ?? `worker-${process.pid}`;
  while (!opts.signal?.aborted) {
    let ran = 0;
    try {
      ran = await drain(db, definitions, workerId, opts.signal, opts.last);
    } catch (err) {
      console.error("[queue] worker loop error:", err instanceof Error ? err.message : String(err));
    }
    if (ran === 0) await sleep(pollMs, opts.signal);
  }
}

/** Enqueue each schedule once per period (at most one row per kind and period, even after it finished). */
export async function enqueueDueSchedules(db: Db, schedules: Schedule[], now: Date = new Date()): Promise<void> {
  for (const s of schedules) {
    const periodMs = s.everyMinutes * 60_000;
    const period = Math.floor(now.getTime() / periodMs);
    await insertJob(db, s.kind, s.payload ?? {}, { dedupeKey: `schedule:${s.kind}:${period}`, runAfter: now }, true);
  }
}

const SCHEDULE_TICK_MS = 30_000;

/** Recurring work: every tick, enqueue `kind` with a dedupe key for the current period. Resolves on abort. */
export async function runSchedules(db: Db, schedules: Schedule[], signal?: AbortSignal): Promise<void> {
  if (schedules.length === 0) {
    await sleep(2 ** 31 - 1, signal);
    return;
  }
  while (!signal?.aborted) {
    try {
      await enqueueDueSchedules(db, schedules);
    } catch (err) {
      console.error("[queue] schedule tick error:", err instanceof Error ? err.message : String(err));
    }
    await sleep(SCHEDULE_TICK_MS, signal);
  }
}
