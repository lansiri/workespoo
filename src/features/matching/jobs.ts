import { eq } from "drizzle-orm";
import { z } from "zod";
import { needCard } from "@/db/schema";
import { defineJob, enqueue, type JobDefinition, type Schedule } from "@/lib/queue";
import type { Db } from "@/db/client";
import { computeEligibilityDetailed } from "./eligibility";
import { computeFeed, refineFeed, refreshNotMentioned } from "./feed";

/** The queue kind of step two. */
export const REFINE_FEED_KIND = "matching.refine_feed";
const CardApproved = z.object({ talentId: z.string().min(1), cardVersion: z.number().int().min(1) });
const RefineFeed = z.object({ talentId: z.string().min(1), cardVersion: z.number().int().min(1) });
const NeedChanged = z.object({ needCardId: z.string().min(1), version: z.number().int().min(1) });

async function recomputePool(db: Db, needCardId: string): Promise<void> {
  await enqueue(db, "needs.recompute_pool", { needCardId }, { dedupeKey: `needs.recompute_pool:${needCardId}` });
}

/**
 * A card was approved, or the person joined or left the pool: store the feed with code-written
 * reasons and queue step two (`matching.refine_feed`), then compute eligibility for the person
 * (a person outside the pool loses every eligibility row), then ask the needs feature to
 * recompute pool evidence for each need whose rows changed. A failed feed does not stop
 * eligibility from being computed; the job still fails afterwards so it retries.
 */
export const matchingCardApproved = defineJob("matching.card_approved", CardApproved, async (payload, { db }) => {
  let feedError: unknown = null;
  try {
    const { matches } = await computeFeed(db, payload.talentId);
    if (matches > 0) {
      await enqueue(
        db,
        REFINE_FEED_KIND,
        { talentId: payload.talentId, cardVersion: payload.cardVersion },
        { dedupeKey: `${REFINE_FEED_KIND}:${payload.talentId}:${payload.cardVersion}` },
      );
    }
  } catch (error) {
    feedError = error;
  }
  const { changedNeedCardIds } = await computeEligibilityDetailed(db, { talentId: payload.talentId });
  for (const id of changedNeedCardIds) await recomputePool(db, id);
  if (feedError) throw feedError;
});

/** Step two of the feed: model wording for the reasons of the top postings. Never fails on a model error. */
export const matchingRefineFeed = defineJob(REFINE_FEED_KIND, RefineFeed, async (payload, { db }) => {
  await refineFeed(db, payload.talentId);
});

/**
 * A Need Card changed: refresh "not mentioned" for the people who have its posting in their
 * feed (no model call), then eligibility for it against the pool, then pool evidence.
 */
export const matchingNeedChanged = defineJob("matching.need_changed", NeedChanged, async (payload, { db }) => {
  const [row] = await db.select({ jobId: needCard.jobId }).from(needCard).where(eq(needCard.id, payload.needCardId));
  if (row) await refreshNotMentioned(db, row.jobId);
  await computeEligibilityDetailed(db, { needCardId: payload.needCardId });
  await recomputePool(db, payload.needCardId);
});

export const jobs: JobDefinition[] = [matchingCardApproved, matchingRefineFeed, matchingNeedChanged];
export const schedules: Schedule[] = [];
