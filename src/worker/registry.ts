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
/**
 * Work nobody is waiting on: slow, and often a long model call. The worker takes these only
 * when nothing else is ready, and keeps one of its loops free of them altogether, so a person's
 * feed, their eligibility and the organiser's picks never wait behind a Need Card draft.
 */
export const backgroundKinds: string[] = ["needs.draft", "jobs.ingest_tmt", "jobs.crawl_occupations", "jobs.rescrub"];

export const allSchedules: Schedule[] = [
  ...cardSchedules,
  ...ingestSchedules,
  ...needsSchedules,
  ...matchingSchedules,
  ...picksSchedules,
];
