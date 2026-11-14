import { and, asc, eq, inArray } from "drizzle-orm";
import {
  PublishedRanking as PublishedRankingSchema,
  RATING_MAX_LEVEL,
  RATING_WEIGHT,
  type ApplicationTurn,
  type LocalText,
  type MoveApplicantRequest,
  type NeedCard,
  type PinnedPosition,
  type PublishedApplicant,
  type PublishedRanking,
  type RequirementKind,
  type RequirementRating,
} from "@/contracts";
import type { Db } from "@/db/client";
import { applicantRanking, application, applicationTurn, company, job, needCard, talent, talentIdentity } from "@/db/schema";
import { createIntroRequest, latestIntroForPair } from "@/features/intros";
import { audit } from "@/lib/audit";
import { HttpError } from "@/lib/http";
import { screenAnswerSentence } from "./assess-protected";
import { employerTerms, maskEmployer } from "@/lib/mask";
import { companyFromToken } from "@/lib/session";
import { LEFT_OUT, answersAbout, expandRefs, questionsAbout, toApplicationTurn } from "./assess-turns";
import { CLOSE_POINTS } from "./levels";
import { currentRequirementKinds } from "./requirements";
import { applicantsSignature as signature, rankedListSignature } from "./signature";

export { rankedListSignature };

/**
 * Points, order, the organiser's moves and approval, and what each side sees of a job's
 * applicants (docs/specs/job-interview.md sections 7 and 8). Nothing here calls a model: the
 * order is arithmetic on stored levels.
 */

/**
 * `points` = sum of weight × level over the ratings whose requirement is still on the card
 * (`kinds` has it); `maxPoints` = sum of weight × 3 over the same; `mustAtExample` = how many
 * must-haves are at level 2 or 3. Pure.
 */
export function applicationPoints(
  ratings: ReadonlyArray<Pick<RequirementRating, "requirementId" | "level">>,
  kinds: ReadonlyMap<string, RequirementKind>,
): { points: number; maxPoints: number; mustAtExample: number } {
  let points = 0;
  let maxPoints = 0;
  let mustAtExample = 0;
  for (const r of ratings) {
    const kind = kinds.get(r.requirementId);
    if (!kind) continue;
    const weight = RATING_WEIGHT[kind];
    points += weight * r.level;
    maxPoints += weight * RATING_MAX_LEVEL;
    if (kind === "must" && r.level >= 2) mustAtExample += 1;
  }
  return { points, maxPoints, mustAtExample };
}

/**
 * The order of a job's applicants: by points (highest first), then `mustAtExample`, then the
 * earlier `submittedAt`; then pins are applied, lowest position first, a position past the
 * end meaning last, a pin for an unknown application ignored. Returns application ids. Pure.
 *
 * Two pins at the same position: the later one holds the position and the earlier one moves
 * down by one. A person with two pins keeps the later one.
 */
export function orderApplicants(
  applicants: ReadonlyArray<{ applicationId: string; points: number; mustAtExample: number; submittedAt: string }>,
  pins: ReadonlyArray<PinnedPosition>,
): string[] {
  const time = (iso: string): number => {
    const t = Date.parse(iso);
    return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
  };
  const drafted = [...applicants].sort(
    (a, b) =>
      b.points - a.points ||
      b.mustAtExample - a.mustAtExample ||
      time(a.submittedAt) - time(b.submittedAt) ||
      a.applicationId.localeCompare(b.applicationId),
  );
  const known = new Set(applicants.map((a) => a.applicationId));
  const latest = new Map<string, PinnedPosition>();
  for (const p of pins) {
    if (!known.has(p.applicationId)) continue;
    const earlier = latest.get(p.applicationId);
    if (!earlier || time(p.at) >= time(earlier.at)) latest.set(p.applicationId, p);
  }
  const pinned = [...latest.values()].sort((a, b) => a.position - b.position || time(a.at) - time(b.at));
  const result = drafted.map((a) => a.applicationId).filter((id) => !latest.has(id));
  for (const p of pinned) result.splice(Math.min(Math.max(p.position, 1) - 1, result.length), 0, p.applicationId);
  return result;
}

/** The points between two neighbours when they are close enough to be read as level, else null. */
export function closeTo(above: number, own: number): number | null {
  const apart = Math.abs(above - own);
  return apart <= CLOSE_POINTS ? apart : null;
}

/** One applicant on the organiser's list. */
export interface RankedApplicant {
  applicationId: string;
  talentId: string;
  handle: string;
  synthetic: boolean;
  liveDemo: boolean;
  /** 1-based, after pins. */
  position: number;
  /** Where the points alone would put them. */
  computedPosition: number;
  /** Points between this applicant and the one above when they are within `CLOSE_POINTS` (0 = the same points); null when they are further apart or there is nobody above. */
  closeToAbove: number | null;
  points: number;
  maxPoints: number;
  pin: PinnedPosition | null;
  /** One per covered requirement still on the card, in the plan's order. */
  ratings: RequirementRating[];
  summary: LocalText;
  submittedAt: string;
}

/** The organiser's view of one job's applicants. */
export interface RankedList {
  jobId: string;
  companyId: string;
  companyName: string;
  masked: boolean;
  /** The Need Card's title, employer masked. */
  title: string;
  needCardVersion: number;
  requirements: Array<{ requirementId: string; text: string; kind: RequirementKind }>;
  /** Assessed applications, in order. */
  applicants: RankedApplicant[];
  /** Sent but not rated yet: they are not on the list. */
  pendingAssessment: number;
  /** The list as last approved, or null. */
  published: PublishedRanking | null;
  /** True when the order, the people or the points differ from the approved list. */
  changedSincePublished: boolean;
  /** The company's private page with the approved list, for the organiser to open. Null before the first approval. */
  companyPath: string | null;
}

/* ------------------------------------------------------------------------------------------
 * Loading
 * ---------------------------------------------------------------------------------------- */

type EventJob = {
  job: typeof job.$inferSelect;
  company: typeof company.$inferSelect;
  card: NeedCard;
  needCardId: string;
};

/** A posting with a Need Card whose company takes part in the event; null for any other job. */
async function loadEventJob(db: Db, jobId: string): Promise<EventJob | null> {
  const [row] = await db
    .select({ job, company, card: needCard.body, needCardId: needCard.id })
    .from(needCard)
    .innerJoin(job, eq(job.id, needCard.jobId))
    .innerJoin(company, eq(company.id, needCard.companyId))
    .where(and(eq(needCard.jobId, jobId), eq(company.participating, true)))
    .limit(1);
  return row ?? null;
}

const maskTitle = (ev: EventJob): string =>
  ev.company.masked ? maskEmployer(ev.card.title, employerTerms(ev.company.realName, ev.job.employerName)) : ev.card.title;

const iso = (d: Date): string => d.toISOString();

async function loadList(db: Db, jobId: string): Promise<RankedList | null> {
  const ev = await loadEventJob(db, jobId);
  if (!ev) return null;
  const kinds = await currentRequirementKinds(db, jobId);

  const rows = await db
    .select({ app: application, handle: talent.handle, synthetic: talent.synthetic, liveDemo: talent.liveDemo })
    .from(application)
    .innerJoin(talent, eq(talent.id, application.talentId))
    .where(and(eq(application.jobId, jobId), inArray(application.status, ["assessed", "submitted"])));
  const assessed = rows.filter((r) => r.app.status === "assessed" && r.app.assessment !== null);
  const pendingAssessment = rows.filter((r) => r.app.status === "submitted").length;

  const [ranking = null] = await db.select().from(applicantRanking).where(eq(applicantRanking.jobId, jobId)).limit(1);
  const pins = ranking?.pins ?? [];

  const scored = assessed.map((r) => {
    const ratings = (r.app.assessment?.ratings ?? []).filter((x) => kinds.has(x.requirementId));
    return { r, ratings, ...applicationPoints(ratings, kinds), submittedAt: iso(r.app.submittedAt ?? r.app.createdAt) };
  });
  const sortable = scored.map((s) => ({ applicationId: s.r.app.id, points: s.points, mustAtExample: s.mustAtExample, submittedAt: s.submittedAt }));
  const order = orderApplicants(sortable, pins);
  const computed = orderApplicants(sortable, []);
  const pinOf = new Map<string, PinnedPosition>();
  for (const p of pins) {
    const prev = pinOf.get(p.applicationId);
    if (!prev || p.at >= prev.at) pinOf.set(p.applicationId, p);
  }
  const byId = new Map(scored.map((s) => [s.r.app.id, s]));

  const applicants: RankedApplicant[] = order.map((id, i) => {
    const s = byId.get(id)!;
    const above = i > 0 ? byId.get(order[i - 1]!)! : null;
    return {
      applicationId: id,
      talentId: s.r.app.talentId,
      handle: s.r.handle,
      synthetic: s.r.synthetic,
      liveDemo: s.r.liveDemo,
      position: i + 1,
      computedPosition: computed.indexOf(id) + 1,
      closeToAbove: above ? closeTo(above.points, s.points) : null,
      points: s.points,
      maxPoints: s.maxPoints,
      pin: pinOf.get(id) ?? null,
      ratings: s.ratings,
      summary: s.r.app.assessment!.summary,
      submittedAt: s.submittedAt,
    };
  });

  const cardText = new Map(ev.card.requirements.map((r) => [r.id, r.text]));
  const requirements: RankedList["requirements"] = [];
  const seen = new Set<string>();
  for (const s of scored) {
    for (const req of s.r.app.plan.requirements) {
      const kind = kinds.get(req.requirementId);
      if (!kind || seen.has(req.requirementId)) continue;
      seen.add(req.requirementId);
      requirements.push({ requirementId: req.requirementId, text: cardText.get(req.requirementId) ?? req.text, kind });
    }
  }

  const published = ranking?.published ? (PublishedRankingSchema.safeParse(ranking.published).data ?? null) : null;
  const changedSincePublished = published ? signature(applicants) !== signature(published.applicants) : applicants.length > 0;

  return {
    jobId,
    companyId: ev.company.id,
    companyName: ev.company.displayName,
    masked: ev.company.masked,
    title: maskTitle(ev),
    needCardVersion: ev.card.version,
    requirements,
    applicants,
    pendingAssessment,
    published,
    changedSincePublished,
    companyPath: published ? `/c/${ev.company.digestToken}/applicants` : null,
  };
}

/** The list for one job, or null when the job is not one of the event's. Organiser only. */
export function rankedListForJob(db: Db, jobId: string): Promise<RankedList | null> {
  return loadList(db, jobId);
}

/** Every event job, with its applicant counts, for the organiser's overview. */
export async function listJobsWithApplicants(db: Db): Promise<
  Array<{
    jobId: string;
    companyName: string;
    title: string;
    applicants: number;
    pendingAssessment: number;
    approvedAt: string | null;
    changedSincePublished: boolean;
  }>
> {
  const jobs = await db
    .select({ jobId: needCard.jobId, name: company.displayName })
    .from(needCard)
    .innerJoin(company, eq(company.id, needCard.companyId))
    .where(eq(company.participating, true))
    .orderBy(asc(company.displayName), asc(needCard.jobId));
  const out = [];
  for (const j of jobs) {
    const list = await loadList(db, j.jobId);
    if (!list) continue;
    out.push({
      jobId: list.jobId,
      companyName: list.companyName,
      title: list.title,
      applicants: list.applicants.length,
      pendingAssessment: list.pendingAssessment,
      approvedAt: list.published ? list.published.publishedAt : null,
      changedSincePublished: list.changedSincePublished,
    });
  }
  return out;
}

/* ------------------------------------------------------------------------------------------
 * The organiser's moves and approval
 * ---------------------------------------------------------------------------------------- */

const ACTOR = "organiser" as const;

/** Runs `fn` with the job's ranking row locked, made on first use. */
async function withRanking<T>(db: Db, jobId: string, fn: (tx: Db, pins: PinnedPosition[]) => Promise<T>): Promise<T> {
  const ev = await loadEventJob(db, jobId);
  if (!ev) throw new HttpError(404, "unknown_job", "No such job");
  return db.transaction(async (tx) => {
    await tx.insert(applicantRanking).values({ jobId, companyId: ev.company.id, pins: [] }).onConflictDoNothing();
    const [row] = await tx.select().from(applicantRanking).where(eq(applicantRanking.jobId, jobId)).for("update");
    return fn(tx, row?.pins ?? []);
  });
}

async function savePins(tx: Db, jobId: string, pins: PinnedPosition[], now: Date): Promise<void> {
  await tx.update(applicantRanking).set({ pins, updatedAt: now }).where(eq(applicantRanking.jobId, jobId));
}

/** Pins one applicant at a position, with a reason, replacing an earlier pin of theirs. Audits `ranking.moved` with from, to and the reason. 404 when the application is not an assessed applicant of this job. */
export function moveApplicant(db: Db, jobId: string, request: MoveApplicantRequest, options?: { now?: () => Date }): Promise<void> {
  const now = (options?.now ?? (() => new Date()))();
  return withRanking(db, jobId, async (tx, pins) => {
    const before = await loadList(tx, jobId);
    const current = before?.applicants.find((a) => a.applicationId === request.applicationId);
    if (!before || !current) throw new HttpError(404, "unknown_applicant", "No such applicant for this job");
    const pin: PinnedPosition = { applicationId: request.applicationId, position: request.position, reason: request.reason.trim(), at: iso(now) };
    await savePins(tx, jobId, [...pins.filter((p) => p.applicationId !== request.applicationId), pin], now);
    const after = await loadList(tx, jobId);
    const to = after?.applicants.find((a) => a.applicationId === request.applicationId)?.position ?? request.position;
    await audit(tx, {
      actor: ACTOR,
      action: "ranking.moved",
      subjectType: "job",
      subjectId: jobId,
      detail: { applicationId: request.applicationId, talentId: current.talentId, from: current.position, to, reason: pin.reason },
    });
  });
}

/** Removes the pin of one applicant. Audits `ranking.unpinned`. */
export function unpinApplicant(db: Db, jobId: string, applicationId: string, options?: { now?: () => Date }): Promise<void> {
  const now = (options?.now ?? (() => new Date()))();
  return withRanking(db, jobId, async (tx, pins) => {
    if (!pins.some((p) => p.applicationId === applicationId)) return;
    const before = await loadList(tx, jobId);
    const from = before?.applicants.find((a) => a.applicationId === applicationId);
    await savePins(tx, jobId, pins.filter((p) => p.applicationId !== applicationId), now);
    const after = await loadList(tx, jobId);
    const to = after?.applicants.find((a) => a.applicationId === applicationId);
    await audit(tx, {
      actor: ACTOR,
      action: "ranking.unpinned",
      subjectType: "job",
      subjectId: jobId,
      detail: { applicationId, ...(from ? { talentId: from.talentId, from: from.position } : {}), ...(to ? { to: to.position } : {}) },
    });
  });
}

/** Stores the list exactly as it stands as the approved one. Audits `ranking.approved` with the count. 409 `nothing_to_approve` when there is no assessed applicant. */
export function approveRanking(db: Db, jobId: string, options?: { now?: () => Date; seen?: string }): Promise<PublishedRanking> {
  const now = (options?.now ?? (() => new Date()))();
  return withRanking(db, jobId, async (tx) => {
    const list = await loadList(tx, jobId);
    if (!list || list.applicants.length === 0) throw new HttpError(409, "nothing_to_approve", "There is no rated applicant to approve");
    // The organiser approves what they looked at: when `seen` is given and the list has moved on (a new rating, a new Need Card), refuse so the page reloads.
    if (options?.seen !== undefined && options.seen !== rankedListSignature(list)) {
      throw new HttpError(409, "list_changed", "The list changed while you were looking at it. Reload and check it again.");
    }
    const published: PublishedRanking = {
      needCardVersion: list.needCardVersion,
      requirements: list.requirements,
      applicants: list.applicants.map((a) => ({
        applicationId: a.applicationId,
        talentId: a.talentId,
        handle: a.handle,
        position: a.position,
        points: a.points,
        maxPoints: a.maxPoints,
        moved: a.pin !== null,
        ratings: a.ratings.map((r) => ({ requirementId: r.requirementId, level: r.level, reason: r.reason })),
        summary: a.summary,
      })),
      publishedAt: iso(now),
    };
    await tx.update(applicantRanking).set({ published, publishedAt: now, updatedAt: now }).where(eq(applicantRanking.jobId, jobId));
    await audit(tx, { actor: ACTOR, action: "ranking.approved", subjectType: "job", subjectId: jobId, detail: { count: published.applicants.length } });
    return published;
  });
}

/* ------------------------------------------------------------------------------------------
 * Evidence
 * ---------------------------------------------------------------------------------------- */

/** The person's own words behind an application's ratings, for the organiser: per covered requirement the questions and the answers, with the sentence numbers each rating cites. */
export interface ApplicationEvidence {
  applicationId: string;
  requirements: Array<{
    requirementId: string;
    text: string;
    questions: string[];
    answers: Array<Pick<ApplicationTurn, "index" | "sentences">>;
    /** Cited sentences as `{ turnIndex, sentence }`, sentence 1-based. */
    cited: Array<{ turnIndex: number; sentence: number }>;
  }>;
}

type ApplicationRow = typeof application.$inferSelect;

async function buildEvidence(db: Db, app: ApplicationRow): Promise<ApplicationEvidence> {
  const turns = (await db.select().from(applicationTurn).where(eq(applicationTurn.applicationId, app.id)).orderBy(asc(applicationTurn.index))).map(toApplicationTurn);
  return {
    applicationId: app.id,
    requirements: app.plan.requirements.map((req) => {
      const rating = app.assessment?.ratings.find((r) => r.requirementId === req.requirementId);
      return {
        requirementId: req.requirementId,
        text: req.text,
        questions: questionsAbout(app.plan, turns, req.requirementId),
        // A sentence with a protected detail is never shown, here as for the assessor.
        answers: answersAbout(turns, req.requirementId).map((t) => ({
          index: t.index,
          sentences: t.sentences.map((s) => {
            const screened = screenAnswerSentence(s);
            return screened.leftOut ? LEFT_OUT : screened.text;
          }),
        })),
        cited: expandRefs(rating?.evidence ?? []),
      };
    }),
  };
}

/** Organiser only. 404 when the application is not assessed. Never includes the input mode or a language field. */
export async function evidenceForOrganiser(db: Db, applicationId: string): Promise<ApplicationEvidence> {
  const [app] = await db.select().from(application).where(eq(application.id, applicationId)).limit(1);
  if (!app || app.status !== "assessed") throw new HttpError(404, "unknown_application", "No such rated application");
  return buildEvidence(db, app);
}

/* ------------------------------------------------------------------------------------------
 * What the company and the person see
 * ---------------------------------------------------------------------------------------- */

/** One applicant as the company's page shows them. `revealed` is filled only after both sides agreed to meet. */
export interface CompanyApplicant extends PublishedApplicant {
  /** As on the organiser's list: points to the one above when within `CLOSE_POINTS`, else null. */
  closeToAbove: number | null;
  intro: { id: string; status: string } | null;
  /** True when the company may ask to meet this person now. */
  canAsk: boolean;
  revealed: { displayName: string; contact: string | null; evidence: ApplicationEvidence["requirements"] } | null;
}

/** What a company sees: nothing before the first approval, then the approved list without anyone whose application is gone. */
export interface CompanyApplicants {
  companyName: string;
  masked: boolean;
  jobs: Array<{
    jobId: string;
    title: string;
    approvedAt: string | null;
    requirements: Array<{ requirementId: string; text: string; kind: RequirementKind }>;
    applicants: CompanyApplicant[];
  }>;
}

/**
 * The approved list of a job minus anyone whose application is gone, numbered 1..n again so
 * that nobody sees a gap. Null before the first approval.
 */
async function approvedList(db: Db, jobId: string): Promise<{ published: PublishedRanking; applicants: PublishedApplicant[] } | null> {
  const [row] = await db.select({ published: applicantRanking.published }).from(applicantRanking).where(eq(applicantRanking.jobId, jobId)).limit(1);
  const published = row?.published ? PublishedRankingSchema.safeParse(row.published).data : undefined;
  if (!published) return null;
  const ids = published.applicants.map((a) => a.applicationId);
  const alive = ids.length
    ? new Set((await db.select({ id: application.id }).from(application).where(and(eq(application.jobId, jobId), inArray(application.id, ids)))).map((r) => r.id))
    : new Set<string>();
  const applicants = [...published.applicants]
    .sort((a, b) => a.position - b.position)
    .filter((a) => alive.has(a.applicationId))
    .map((a, i) => ({ ...a, position: i + 1 }));
  return { published, applicants };
}

const OPEN_AGAIN = new Set(["withdrawn", "expired", "not_approved", "cancelled"]);

/** By the company's private link. Null when the link is unknown. */
export async function applicantsForCompany(db: Db, token: string): Promise<CompanyApplicants | null> {
  const co = await companyFromToken(db, token);
  if (!co) return null;
  const [coRow] = await db.select({ masked: company.masked }).from(company).where(eq(company.id, co.id)).limit(1);

  const rankings = await db.select({ jobId: applicantRanking.jobId }).from(applicantRanking).where(and(eq(applicantRanking.companyId, co.id)));
  const jobs: CompanyApplicants["jobs"] = [];
  for (const { jobId } of rankings) {
    const approved = await approvedList(db, jobId);
    const ev = approved ? await loadEventJob(db, jobId) : null;
    if (!approved || !ev || ev.company.id !== co.id) continue;

    const applications = approved.applicants.length
      ? await db.select().from(application).where(inArray(application.id, approved.applicants.map((a) => a.applicationId)))
      : [];
    const appById = new Map(applications.map((a) => [a.id, a]));

    const applicants: CompanyApplicant[] = [];
    for (const [i, a] of approved.applicants.entries()) {
      const above = i > 0 ? approved.applicants[i - 1]! : null;
      const intro = await latestIntroForPair(db, co.id, a.talentId);
      let revealed: CompanyApplicant["revealed"] = null;
      const app = appById.get(a.applicationId);
      if (intro?.status === "accepted" && app) {
        const [identity] = await db.select().from(talentIdentity).where(eq(talentIdentity.talentId, a.talentId)).limit(1);
        if (identity) {
          revealed = { displayName: identity.displayName, contact: identity.contact, evidence: (await buildEvidence(db, app)).requirements };
        }
      }
      // Field by field: nothing of the stored row is passed on that is not listed here.
      applicants.push({
        applicationId: a.applicationId,
        talentId: a.talentId,
        handle: a.handle,
        position: a.position,
        points: a.points,
        maxPoints: a.maxPoints,
        moved: a.moved,
        ratings: a.ratings.map((r) => ({ requirementId: r.requirementId, level: r.level, reason: { en: r.reason.en, fi: r.reason.fi, sv: r.reason.sv } })),
        summary: { en: a.summary.en, fi: a.summary.fi, sv: a.summary.sv },
        closeToAbove: above ? closeTo(above.points, a.points) : null,
        intro: intro ? { id: intro.id, status: intro.status } : null,
        canAsk: !intro || OPEN_AGAIN.has(intro.status),
        revealed,
      });
    }
    jobs.push({
      jobId,
      title: maskTitle(ev),
      approvedAt: approved.published.publishedAt,
      requirements: approved.published.requirements.map((r) => ({ requirementId: r.requirementId, text: r.text, kind: r.kind })),
      applicants,
    });
  }
  return { companyName: co.displayName, masked: coRow?.masked ?? true, jobs };
}

/** The company asks to meet an applicant on its approved list: creates the introduction through the intros feature. 403 `not_available` when the person is not on the approved list. */
export async function askToMeetApplicant(db: Db, args: { token: string; applicationId: string; now?: Date }): Promise<{ id: string; status: string; expiresAt: string | null }> {
  const co = await companyFromToken(db, args.token);
  if (!co) throw new HttpError(404, "unknown_link", "This link has expired");
  const [app] = await db.select().from(application).where(eq(application.id, args.applicationId)).limit(1);
  const approved = app && app.companyId === co.id ? await approvedList(db, app.jobId) : null;
  if (!app || !approved || !approved.applicants.some((a) => a.applicationId === app.id)) {
    throw new HttpError(403, "not_available", "You can only ask to meet someone on your approved list");
  }
  const [card] = await db.select({ id: needCard.id }).from(needCard).where(eq(needCard.jobId, app.jobId)).limit(1);
  return createIntroRequest(db, { companyId: co.id, talentId: app.talentId, needCardId: card?.id ?? null, pickId: null, now: args.now });
}

/** A person's place on the list a company sees, with whether a neighbour is level with them on points. */
export interface OwnPosition {
  position: number;
  of: number;
  approvedAt: string;
  /** Which neighbours are within `CLOSE_POINTS` of this person's points. Their points are never given. */
  levelWith: "above" | "below" | "both" | null;
}

/** The person's place on the approved list of a job, or null when there is none or they are not on it. */
export async function ownPosition(db: Db, applicationId: string): Promise<OwnPosition | null> {
  const [app] = await db.select({ jobId: application.jobId }).from(application).where(eq(application.id, applicationId)).limit(1);
  if (!app) return null;
  const approved = await approvedList(db, app.jobId);
  const mine = approved?.applicants.find((a) => a.applicationId === applicationId);
  if (!approved || !mine) return null;
  const at = approved.applicants.indexOf(mine);
  const close = (other: PublishedApplicant | undefined): boolean => other !== undefined && closeTo(other.points, mine.points) !== null;
  const above = close(approved.applicants[at - 1]);
  const below = close(approved.applicants[at + 1]);
  return {
    position: mine.position,
    of: approved.applicants.length,
    approvedAt: approved.published.publishedAt,
    levelWith: above && below ? "both" : above ? "above" : below ? "below" : null,
  };
}
