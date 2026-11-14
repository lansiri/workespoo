import type {
  ApplicationTurn,
  LocalText,
  MoveApplicantRequest,
  PinnedPosition,
  PublishedApplicant,
  PublishedRanking,
  RequirementKind,
  RequirementRating,
} from "@/contracts";
import type { Db } from "@/db/client";

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
  void ratings;
  void kinds;
  throw new Error("not built yet");
}

/**
 * The order of a job's applicants: by points (highest first), then `mustAtExample`, then the
 * earlier `submittedAt`; then pins are applied, lowest position first, a position past the
 * end meaning last, a pin for an unknown application ignored. Returns application ids. Pure.
 */
export function orderApplicants(
  applicants: ReadonlyArray<{ applicationId: string; points: number; mustAtExample: number; submittedAt: string }>,
  pins: ReadonlyArray<PinnedPosition>,
): string[] {
  void applicants;
  void pins;
  throw new Error("not built yet");
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
}

/** The list for one job, or null when the job is not one of the event's. Organiser only. */
export function rankedListForJob(db: Db, jobId: string): Promise<RankedList | null> {
  void db;
  void jobId;
  throw new Error("not built yet");
}

/** Every event job, with its applicant counts, for the organiser's overview. */
export function listJobsWithApplicants(db: Db): Promise<
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
  void db;
  throw new Error("not built yet");
}

/** Pins one applicant at a position, with a reason, replacing an earlier pin of theirs. Audits `ranking.moved` with from, to and the reason. 404 when the application is not an assessed applicant of this job. */
export function moveApplicant(db: Db, jobId: string, request: MoveApplicantRequest, options?: { now?: () => Date }): Promise<void> {
  void db;
  void jobId;
  void request;
  void options;
  throw new Error("not built yet");
}

/** Removes the pin of one applicant. Audits `ranking.unpinned`. */
export function unpinApplicant(db: Db, jobId: string, applicationId: string, options?: { now?: () => Date }): Promise<void> {
  void db;
  void jobId;
  void applicationId;
  void options;
  throw new Error("not built yet");
}

/** Stores the list exactly as it stands as the approved one. Audits `ranking.approved` with the count. 409 `nothing_to_approve` when there is no assessed applicant. */
export function approveRanking(db: Db, jobId: string, options?: { now?: () => Date }): Promise<PublishedRanking> {
  void db;
  void jobId;
  void options;
  throw new Error("not built yet");
}

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

/** Organiser only. 404 when the application is not assessed. Never includes the input mode or a language field. */
export function evidenceForOrganiser(db: Db, applicationId: string): Promise<ApplicationEvidence> {
  void db;
  void applicationId;
  throw new Error("not built yet");
}

/** One applicant as the company's page shows them. `revealed` is filled only after both sides agreed to meet. */
export interface CompanyApplicant extends PublishedApplicant {
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

/** By the company's private link. Null when the link is unknown. */
export function applicantsForCompany(db: Db, token: string): Promise<CompanyApplicants | null> {
  void db;
  void token;
  throw new Error("not built yet");
}

/** The company asks to meet an applicant on its approved list: creates the introduction through the intros feature. 403 `not_available` when the person is not on the approved list. */
export function askToMeetApplicant(db: Db, args: { token: string; applicationId: string; now?: Date }): Promise<{ id: string; status: string; expiresAt: string | null }> {
  void db;
  void args;
  throw new Error("not built yet");
}

/** The person's place on the approved list of a job, or null when there is none or they are not on it. */
export function ownPosition(db: Db, applicationId: string): Promise<{ position: number; of: number; approvedAt: string } | null> {
  void db;
  void applicationId;
  throw new Error("not built yet");
}
