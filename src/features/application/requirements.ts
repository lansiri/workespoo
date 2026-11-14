import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import {
  APPLICATION_MAX_REQUIREMENTS,
  NeedCard,
  type ApplicationStatus,
  type CoveredRequirement,
  type Requirement,
  type RequirementKind,
} from "@/contracts";
import type { Db } from "@/db/client";
import { application, company, eventCompany, job, matchEvent, needCard } from "@/db/schema";
import { employerTerms, maskEmployer } from "@/lib/mask";

/**
 * Which jobs a person can apply to, and which of an ad's requirements a job interview covers
 * (docs/specs/job-interview.md sections 3 and 4). The choice of requirements is made by code
 * and is the same for every applicant of a job: that is what makes the interviews comparable.
 */

/**
 * The requirements a job interview covers, in the order they are asked: every requirement
 * with `statutory === "none"` and a category other than `authorisation`, must-haves first,
 * then nice-to-haves, keeping the card's order within each group, at most
 * `APPLICATION_MAX_REQUIREMENTS`. Pure.
 */
export function coveredRequirements(card: Pick<NeedCard, "requirements">): Requirement[] {
  const askable = card.requirements.filter((r) => r.statutory === "none" && r.category !== "authorisation");
  const musts = askable.filter((r) => r.kind === "must");
  const nices = askable.filter((r) => r.kind !== "must");
  return [...musts, ...nices].slice(0, APPLICATION_MAX_REQUIREMENTS);
}

/** A job of the event as the person sees it. Nothing here can name a masked employer. */
export interface ApplyJob {
  jobId: string;
  /** The company's display name ("Demo company 03"). */
  companyName: string;
  /** True when the employer's real name is hidden: the page then shows the masked-demo banner. */
  masked: boolean;
  /** The Need Card's title and summary, with the employer's name masked. */
  title: string;
  summary: string;
  /** What the job interview will ask about, in order. Texts are the Need Card's (English). */
  requirements: Array<{ requirementId: string; text: string; kind: RequirementKind }>;
  /** The person's own application to this job, if there is one. */
  application: { id: string; status: ApplicationStatus } | null;
}

/** Everything the engine needs to know about one job, read once. Internal to this feature. */
export interface JobContext {
  card: NeedCard;
  companyId: string;
  companyName: string;
  masked: boolean;
  /** Posting sentences, raw: always pass them through `mask` before they leave. */
  sentences: string[];
  /** The employer's terms when the company is masked, otherwise empty. */
  terms: string[];
  mask: (text: string) => string;
  covered: Requirement[];
}

/** The id of the current event (the one with the latest date), or null. */
async function currentEventId(db: Db): Promise<string | null> {
  const [row] = await db.select({ id: matchEvent.id }).from(matchEvent).orderBy(desc(matchEvent.date), desc(matchEvent.id)).limit(1);
  return row?.id ?? null;
}

type Row = {
  card: NeedCard;
  companyId: string;
  companyName: string;
  masked: boolean;
  realName: string | null;
  employerName: string;
  sentences: string[];
};

function toContext(r: Row): JobContext {
  const terms = r.masked ? employerTerms(r.realName, r.employerName) : [];
  const mask = (text: string) => (terms.length ? maskEmployer(text, terms) : text);
  return {
    card: r.card,
    companyId: r.companyId,
    companyName: r.companyName,
    masked: r.masked,
    sentences: r.sentences,
    terms,
    mask,
    covered: coveredRequirements(r.card),
  };
}

function selectRows(db: Db) {
  return db
    .select({
      body: needCard.body,
      companyId: company.id,
      companyName: company.displayName,
      masked: company.masked,
      realName: company.realName,
      employerName: job.employerName,
      sentences: job.sentences,
      jobId: needCard.jobId,
    })
    .from(needCard)
    .innerJoin(company, eq(company.id, needCard.companyId))
    .innerJoin(job, eq(job.id, needCard.jobId));
}

function rowOf(r: {
  body: unknown;
  companyId: string;
  companyName: string;
  masked: boolean;
  realName: string | null;
  employerName: string;
  sentences: string[] | null;
}): Row {
  return {
    card: NeedCard.parse(r.body),
    companyId: r.companyId,
    companyName: r.companyName,
    masked: r.masked,
    realName: r.realName,
    employerName: r.employerName,
    sentences: r.sentences ?? [],
  };
}

/**
 * The context of a job a person may apply to (a Need Card that is not stale, a participating
 * company of the current event, at least one requirement to cover), or null.
 */
export async function loadApplyContext(db: Db, jobId: string): Promise<JobContext | null> {
  const eventId = await currentEventId(db);
  if (!eventId) return null;
  const rows = await selectRows(db)
    .innerJoin(eventCompany, and(eq(eventCompany.companyId, company.id), eq(eventCompany.eventId, eventId)))
    .where(and(eq(needCard.jobId, jobId), ne(needCard.status, "stale"), eq(company.participating, true)));
  const first = rows[0];
  if (!first) return null;
  const ctx = toContext(rowOf(first));
  return ctx.covered.length > 0 ? ctx : null;
}

/** The context of a job's Need Card whatever its status, for pages about an application that already exists. Null when the card is gone. */
export async function loadJobContext(db: Db, jobId: string): Promise<JobContext | null> {
  const [first] = await selectRows(db).where(eq(needCard.jobId, jobId));
  return first ? toContext(rowOf(first)) : null;
}

function toApplyJob(ctx: JobContext, own: { id: string; status: ApplicationStatus } | null): ApplyJob {
  return {
    jobId: ctx.card.jobId,
    companyName: ctx.companyName,
    masked: ctx.masked,
    title: ctx.mask(ctx.card.title),
    summary: ctx.mask(ctx.card.summary),
    requirements: ctx.covered.map((r) => ({ requirementId: r.id, text: ctx.mask(r.text), kind: r.kind })),
    application: own,
  };
}

async function ownApplications(db: Db, talentId: string, jobIds: string[]) {
  const map = new Map<string, { id: string; status: ApplicationStatus }>();
  if (jobIds.length === 0) return map;
  const rows = await db
    .select({ id: application.id, status: application.status, jobId: application.jobId })
    .from(application)
    .where(and(eq(application.talentId, talentId), inArray(application.jobId, jobIds)));
  for (const r of rows) map.set(r.jobId, { id: r.id, status: r.status });
  return map;
}

/**
 * The event's jobs for this person: postings with a Need Card whose company takes part in the
 * current event, that have at least one requirement to cover. Ordered by company name.
 */
export async function listApplyJobs(db: Db, talentId: string): Promise<ApplyJob[]> {
  const eventId = await currentEventId(db);
  if (!eventId) return [];
  const rows = await selectRows(db)
    .innerJoin(eventCompany, and(eq(eventCompany.companyId, company.id), eq(eventCompany.eventId, eventId)))
    .where(and(ne(needCard.status, "stale"), eq(company.participating, true)))
    .orderBy(asc(company.displayName), asc(needCard.jobId));
  const contexts = rows.map((r) => toContext(rowOf(r))).filter((c) => c.covered.length > 0);
  const own = await ownApplications(db, talentId, contexts.map((c) => c.card.jobId));
  return contexts.map((c) => toApplyJob(c, own.get(c.card.jobId) ?? null));
}

/** One of those jobs, or null when the job is not one a person can apply to. */
export async function getApplyJob(db: Db, talentId: string, jobId: string): Promise<ApplyJob | null> {
  const ctx = await loadApplyContext(db, jobId);
  if (!ctx) return null;
  const own = await ownApplications(db, talentId, [jobId]);
  return toApplyJob(ctx, own.get(jobId) ?? null);
}

/** The kind each requirement has on the job's Need Card now, by requirement id. Requirements no longer on the card are absent. */
export async function currentRequirementKinds(db: Db, jobId: string): Promise<Map<string, RequirementKind>> {
  const [row] = await db.select({ body: needCard.body }).from(needCard).where(eq(needCard.jobId, jobId));
  const kinds = new Map<string, RequirementKind>();
  if (!row) return kinds;
  for (const r of NeedCard.parse(row.body).requirements) kinds.set(r.id, r.kind);
  return kinds;
}

export type { CoveredRequirement };
