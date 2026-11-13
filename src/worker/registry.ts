import type { JobDefinition, Schedule } from "@/lib/queue";
import { jobs as cardJobs, schedules as cardSchedules } from "@/features/card/jobs";
import { jobs as ingestJobs, schedules as ingestSchedules } from "@/features/jobs/jobs";
import { jobs as matchingJobs, schedules as matchingSchedules } from "@/features/matching/jobs";
import { jobs as needsJobs, schedules as needsSchedules } from "@/features/needs/jobs";
import { jobs as picksJobs, schedules as picksSchedules } from "@/features/picks/jobs";

/**
 * Every feature's background work is registered here. Lead-owned: a feature exports `jobs`
 * and `schedules` from `src/features/<name>/jobs.ts`, and the lead adds them at merge time.
 * A job whose handler is not registered yet simply stays queued.
 */
export const allJobs: JobDefinition[] = [...cardJobs, ...ingestJobs, ...needsJobs, ...matchingJobs, ...picksJobs];
export const allSchedules: Schedule[] = [
  ...cardSchedules,
  ...ingestSchedules,
  ...needsSchedules,
  ...matchingSchedules,
  ...picksSchedules,
];
