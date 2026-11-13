import { z } from "zod";
import { Id } from "./common";
import { JobSource } from "./jobs";

/**
 * Background work. Rows live in the `job_queue` table and are claimed with
 * `FOR UPDATE SKIP LOCKED`. Each kind has one payload schema and one handler,
 * registered in `src/worker/index.ts`.
 */
export const QueuePayloads = {
  "ingest.source": z.object({ source: JobSource, maxPages: z.number().int().min(1).optional() }),
  "esco.occupation_skills": z.object({ occupationUris: z.array(z.string()).min(1).max(50) }),
  "interview.extract_turn": z.object({ interviewId: Id, turnIndex: z.number().int().min(0) }),
  "card.synthesise": z.object({ interviewId: Id }),
  "match.talent_jobs": z.object({ talentId: Id }),
  "need_card.draft": z.object({ jobId: Id, companyId: Id }),
  "picks.draft_daily": z.object({ date: z.string(), companyId: Id.optional() }),
  "purge.live_sessions": z.object({}),
} as const;

export type QueueKind = keyof typeof QueuePayloads;

export type QueuePayload<K extends QueueKind> = z.infer<(typeof QueuePayloads)[K]>;

export const QUEUE_KINDS = Object.keys(QueuePayloads) as QueueKind[];

export function isQueueKind(value: string): value is QueueKind {
  return (QUEUE_KINDS as string[]).includes(value);
}
