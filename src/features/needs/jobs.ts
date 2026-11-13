import { z } from "zod";
import { defineJob, type JobDefinition, type Schedule } from "@/lib/queue";
import { draftNeedCard, isDraftCurrent } from "./draft";
import { recomputePoolEvidence } from "./pool";

/**
 * `needs.draft` drafts a card in the background (feed explanations, seeding). A posting that
 * has a card and has not changed since is not sent to the model again.
 */
export const draftJob = defineJob(
  "needs.draft",
  z.object({ jobId: z.string().min(1), companyId: z.string().nullable() }),
  async ({ jobId, companyId }, { db }) => {
    if (await isDraftCurrent(db, jobId)) return;
    await draftNeedCard(db, jobId, companyId);
  },
);

/** `needs.recompute_pool`, enqueued by matching once eligibility rows are written. */
export const recomputePoolJob = defineJob(
  "needs.recompute_pool",
  z.object({ needCardId: z.string().min(1) }),
  async ({ needCardId }, { db }) => {
    await recomputePoolEvidence(db, needCardId);
  },
);

export const jobs: JobDefinition[] = [draftJob, recomputePoolJob];
export const schedules: Schedule[] = [];
