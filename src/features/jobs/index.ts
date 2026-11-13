import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { job } from "@/db/schema";
import { Job } from "@/contracts";

export { importEsco, type EscoImportResult } from "./esco-import";
export { ingestTmt, normaliseTmtPosting, rescrubStoredPostings, type TmtIngestOptions, type TmtIngestResult } from "./tmt";
export { crawlOccupationSkills, type OccupationCrawlResult } from "./esco-occupations";

type JobRow = typeof job.$inferSelect;

function toJob(row: JobRow): Job {
  return Job.parse({
    id: row.id,
    source: row.source,
    sourceId: row.sourceId,
    url: row.url,
    title: row.title,
    employerName: row.employerName,
    employerBusinessId: row.employerBusinessId,
    sector: row.sector,
    municipality: row.municipality,
    municipalityCode: row.municipalityCode,
    region: row.region,
    lang: row.lang,
    workLanguages: row.workLanguages,
    description: row.description,
    sentences: row.sentences,
    postedAt: row.postedAt ? row.postedAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    escoOccupationUris: row.escoOccupationUris,
    escoSkillUris: row.escoSkillUris,
    active: row.active,
  });
}

/** One posting by id (any status, masked or not), or null. */
export async function getJob(db: Db, id: string): Promise<Job | null> {
  const [row] = await db.select().from(job).where(eq(job.id, id));
  return row ? toJob(row) : null;
}

/**
 * Active postings, most recently posted first. Postings that belong to a masked demo company
 * are left out of this public feed (docs/LEAD-DECISIONS.md, open question 3).
 */
export async function listJobs(
  db: Db,
  opts: { municipalityCode?: string; limit?: number; offset?: number } = {},
): Promise<Job[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const rows = await db
    .select()
    .from(job)
    .where(
      and(
        eq(job.active, true),
        opts.municipalityCode ? eq(job.municipalityCode, opts.municipalityCode) : undefined,
        sql`NOT EXISTS (
          SELECT 1 FROM need_card nc JOIN company c ON c.id = nc.company_id
          WHERE nc.job_id = ${job.id} AND c.masked
        )`,
      ),
    )
    .orderBy(sql`${job.postedAt} DESC NULLS LAST`, desc(job.id))
    .limit(limit)
    .offset(offset);
  return rows.map(toJob);
}
