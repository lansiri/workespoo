import { z } from "zod";
import { IsoDateTime } from "./common";

/**
 * Background work. Rows live in the `job_queue` table and are claimed with
 * `FOR UPDATE SKIP LOCKED`.
 *
 * The set of kinds is open: each feature defines its own kinds, payload schemas and
 * handlers in its `jobs.ts` and registers them through `src/lib/queue`. Kinds are
 * namespaced by feature, for example `jobs.ingest_source`, `interview.extract_turn`,
 * `needs.draft`, `matching.feed`, `picks.draft_daily`, `trust.purge_live_sessions`.
 */
export const QueueJob = z.object({
  id: z.number().int(),
  kind: z.string().regex(/^[a-z_]+\.[a-z_]+$/),
  payload: z.unknown(),
  /** One open row per key: enqueueing the same key twice is a no-op. */
  dedupeKey: z.string().nullable(),
  runAfter: IsoDateTime,
  attempts: z.number().int().min(0),
  maxAttempts: z.number().int().min(1),
  doneAt: IsoDateTime.nullable(),
  error: z.string().nullable(),
});
export type QueueJob = z.infer<typeof QueueJob>;
