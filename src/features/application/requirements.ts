import type {
  ApplicationStatus,
  CoveredRequirement,
  NeedCard,
  Requirement,
  RequirementKind,
} from "@/contracts";
import type { Db } from "@/db/client";

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
  void card;
  throw new Error("not built yet");
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

/**
 * The event's jobs for this person: postings with a Need Card whose company takes part in the
 * current event, that have at least one requirement to cover. Ordered by company name.
 */
export function listApplyJobs(db: Db, talentId: string): Promise<ApplyJob[]> {
  void db;
  void talentId;
  throw new Error("not built yet");
}

/** One of those jobs, or null when the job is not one a person can apply to. */
export function getApplyJob(db: Db, talentId: string, jobId: string): Promise<ApplyJob | null> {
  void db;
  void talentId;
  void jobId;
  throw new Error("not built yet");
}

/** The kind each requirement has on the job's Need Card now, by requirement id. Requirements no longer on the card are absent. */
export function currentRequirementKinds(db: Db, jobId: string): Promise<Map<string, RequirementKind>> {
  void db;
  void jobId;
  throw new Error("not built yet");
}

export type { CoveredRequirement };
