import { z } from "zod";
import { defineJob, type JobDefinition, type Schedule } from "@/lib/queue";
import { MUNICIPALITY_CODES } from "@/contracts";
import { crawlOccupationSkills } from "./esco-occupations";
import { ingestTmt, rescrubStoredPostings } from "./tmt";

/** Työmarkkinatori ingestion for the given municipality codes (all of Espoo by default). */
export const ingestTmtJob = defineJob(
  "jobs.ingest_tmt",
  z.object({ municipalities: z.array(z.string()).default([MUNICIPALITY_CODES.espoo]) }),
  async ({ municipalities }, { db }) => {
    await ingestTmt(db, { municipalities });
  },
);

/** Fetch ESCO skills for occupations that active postings use and that were not fetched yet. */
export const crawlOccupationsJob = defineJob(
  "jobs.crawl_occupations",
  z.object({ limit: z.number().int().min(1).max(1000).default(100) }),
  async ({ limit }, { db }) => {
    await crawlOccupationSkills(db, { limit });
  },
);

/** One-time removal of contact sentences from postings stored before the rule existed. */
export const rescrubJob = defineJob("jobs.rescrub", z.object({}), async (_payload, { db }) => {
  await rescrubStoredPostings(db);
});

export const jobs: JobDefinition[] = [ingestTmtJob, crawlOccupationsJob, rescrubJob];

export const schedules: Schedule[] = [
  { kind: "jobs.ingest_tmt", everyMinutes: 6 * 60, payload: { municipalities: [MUNICIPALITY_CODES.espoo] } },
  { kind: "jobs.crawl_occupations", everyMinutes: 30, payload: { limit: 100 } },
];
