import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { company, job, needCard } from "@/db/schema";

export type DevPosting = {
  jobId: string;
  title: string;
  employerName: string;
  municipality: string | null;
  card: { id: string; version: number; status: string; companyToken: string | null } | null;
};

/** For the organiser's test page: recent postings (masked-company ones included) and their cards. */
export async function devPostings(db: Db, limit = 30): Promise<DevPosting[]> {
  const rows = await db
    .select({
      jobId: job.id,
      title: job.title,
      employerName: job.employerName,
      municipality: job.municipality,
      cardId: needCard.id,
      cardVersion: needCard.version,
      cardStatus: needCard.status,
      companyToken: company.digestToken,
    })
    .from(job)
    .leftJoin(needCard, eq(needCard.jobId, job.id))
    .leftJoin(company, eq(company.id, needCard.companyId))
    .where(eq(job.active, true))
    .orderBy(sql`${job.postedAt} DESC NULLS LAST`, desc(job.id))
    .limit(Math.min(Math.max(limit, 1), 200));
  return rows.map((r) => ({
    jobId: r.jobId,
    title: r.title,
    employerName: r.employerName,
    municipality: r.municipality,
    card: r.cardId
      ? { id: r.cardId, version: r.cardVersion ?? 1, status: r.cardStatus ?? "draft", companyToken: r.companyToken }
      : null,
  }));
}

export async function devCompanies(db: Db): Promise<Array<{ id: string; displayName: string }>> {
  return db.select({ id: company.id, displayName: company.displayName }).from(company).orderBy(company.displayName);
}
