import { AssessApplicationPayload } from "@/contracts";
import { defineJob, type JobDefinition, type Schedule } from "@/lib/queue";
import { assessApplication } from "./assess";

/** Background work of the application feature. Registered in src/worker/registry.ts. */
export const ASSESS_KIND = "application.assess";
/**
 * How long the queued rating waits before a worker may take it. The page that sends an
 * application starts the rating at once in its own process (`assessSoon`), so that a person
 * never waits behind whatever the worker happens to be doing; the queued job is the safety
 * net. It finds the application already rated, or rates it when the first attempt failed.
 */
export const ASSESS_QUEUE_DELAY_MS = 45_000;

export const jobs: JobDefinition[] = [
  defineJob(ASSESS_KIND, AssessApplicationPayload, async (payload, ctx) => {
    await assessApplication(ctx.db, payload.applicationId);
  }),
];

export const schedules: Schedule[] = [];
