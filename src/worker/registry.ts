import type { JobDefinition, Schedule } from "@/lib/queue";
import { jobs as cardJobs, schedules as cardSchedules } from "@/features/card/jobs";

/**
 * Every feature's background work is registered here. Lead-owned: a feature exports `jobs`
 * and `schedules` from `src/features/<name>/jobs.ts`, and the lead adds them at merge time.
 * A job whose handler is not registered yet simply stays queued.
 */
export const allJobs: JobDefinition[] = [...cardJobs];
export const allSchedules: Schedule[] = [...cardSchedules];
