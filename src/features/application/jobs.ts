import { AssessApplicationPayload } from "@/contracts";
import { defineJob, type JobDefinition, type Schedule } from "@/lib/queue";
import { assessApplication } from "./assess";

/** Background work of the application feature. Registered in src/worker/registry.ts. */
export const ASSESS_KIND = "application.assess";

export const jobs: JobDefinition[] = [
  defineJob(ASSESS_KIND, AssessApplicationPayload, async (payload, ctx) => {
    await assessApplication(ctx.db, payload.applicationId);
  }),
];

export const schedules: Schedule[] = [];
