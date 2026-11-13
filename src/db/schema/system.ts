import { bigserial, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, timestamptz } from "./shared";

/** Small key/value store for operational state, such as the last successful ingestion. */
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updatedAt: timestamptz("updated_at").defaultNow(),
});

/**
 * Background work. A worker claims a row with `FOR UPDATE SKIP LOCKED`, sets
 * `lockedAt`, runs the handler for `kind`, then sets `doneAt` or records `error`
 * and reschedules until `maxAttempts`.
 */
export const jobQueue = pgTable(
  "job_queue",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    /** Optional key that makes enqueueing idempotent: one open row per key. */
    dedupeKey: text("dedupe_key"),
    runAfter: timestamptz("run_after").notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lockedAt: timestamptz("locked_at"),
    lockedBy: text("locked_by"),
    doneAt: timestamptz("done_at"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("job_queue_ready_idx").on(t.doneAt, t.runAfter), index("job_queue_dedupe_idx").on(t.dedupeKey)],
);
