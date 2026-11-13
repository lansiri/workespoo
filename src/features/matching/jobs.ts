import { z } from "zod";
import { defineJob, enqueue, type JobDefinition, type Schedule } from "@/lib/queue";
import type { Db } from "@/db/client";
import { computeEligibilityDetailed } from "./eligibility";
import { computeFeed } from "./feed";

const CardApproved = z.object({ talentId: z.string().min(1), cardVersion: z.number().int().min(1) });
const NeedChanged = z.object({ needCardId: z.string().min(1), version: z.number().int().min(1) });

async function recomputePool(db: Db, needCardId: string): Promise<void> {
  await enqueue(db, "needs.recompute_pool", { needCardId }, { dedupeKey: `needs.recompute_pool:${needCardId}` });
}

/**
 * A card was approved: compute the feed, then eligibility for the person, then ask the needs
 * feature to recompute pool evidence for each need whose rows changed. A failed feed does not
 * stop eligibility from being computed; the job still fails afterwards so it retries.
 */
export const matchingCardApproved = defineJob("matching.card_approved", CardApproved, async (payload, { db }) => {
  let feedError: unknown = null;
  try {
    await computeFeed(db, payload.talentId);
  } catch (error) {
    feedError = error;
  }
  const { changedNeedCardIds } = await computeEligibilityDetailed(db, { talentId: payload.talentId });
  for (const id of changedNeedCardIds) await recomputePool(db, id);
  if (feedError) throw feedError;
});

/** A Need Card changed: eligibility for it against the pool, then pool evidence. */
export const matchingNeedChanged = defineJob("matching.need_changed", NeedChanged, async (payload, { db }) => {
  await computeEligibilityDetailed(db, { needCardId: payload.needCardId });
  await recomputePool(db, payload.needCardId);
});

export const jobs: JobDefinition[] = [matchingCardApproved, matchingNeedChanged];
export const schedules: Schedule[] = [];
