import type { JobDefinition, Schedule } from "@/lib/queue";

/**
 * Every feature's background work is registered here. To add a feature, export `jobs` and
 * `schedules` from `src/features/<name>/jobs.ts` and spread them in:
 *
 *   import { jobs as jobsJobs, schedules as jobsSchedules } from "@/features/jobs/jobs";
 *   export const allJobs: JobDefinition[] = [...jobsJobs];
 *   export const allSchedules: Schedule[] = [...jobsSchedules];
 */
export const allJobs: JobDefinition[] = [];
export const allSchedules: Schedule[] = [];
