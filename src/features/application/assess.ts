import type { ApplicationAssessment, ApplicationPlan, ApplicationTurn } from "@/contracts";
import type { Db } from "@/db/client";

/**
 * The assessment of one application (docs/specs/job-interview.md section 6): what the model
 * is given, the call, and the checks that decide what is stored. The model never sees who it
 * is reading, and nothing it returns is stored unchecked.
 */

/** A sentence the assessor may cite, or one that was left out because it carries a protected detail. */
export interface AssessorSentence {
  /** `T<turnIndex>.S<n>`, n 1-based. */
  label: string;
  turnIndex: number;
  sentence: number;
  /** The sentence, or `[left out]`. */
  text: string;
  leftOut: boolean;
}

/** Exactly what the assessor reads about the person: questions and labelled answer sentences per requirement. No name, nickname, language field or input mode. */
export interface AssessorInput {
  jobTitle: string;
  requirements: Array<{
    /** R1, R2, ... in the plan's order. */
    label: string;
    requirementId: string;
    text: string;
    kind: "must" | "nice";
    /** The ad's sentence this requirement came from, employer masked, or null. */
    adSentence: string | null;
    /** The interviewer's questions about it, in order. */
    questions: string[];
    /** The person's answer sentences about it. Empty when skipped, unanswered or removed. */
    sentences: AssessorSentence[];
  }>;
}

/**
 * Builds the assessor's input from the stored plan and turns. Removed answers contribute
 * nothing; a sentence in which the protected-detail check finds something becomes
 * `[left out]` and keeps its label so numbering stays true. Pure.
 */
export function buildAssessorInput(args: {
  jobTitle: string;
  plan: ApplicationPlan;
  turns: ApplicationTurn[];
  /** Posting sentences, already masked, indexed as `Job.sentences`. */
  adSentences: string[];
}): AssessorInput {
  void args;
  throw new Error("not built yet");
}

/**
 * Turns the model's output into the stored assessment, applying every check of section 6:
 * unknown requirements dropped, levels clamped, references resolved against `input` (a level
 * above 0 without a valid reference becomes 0), reasons that judge the person, name a
 * protected detail or name the employer replaced by the code's sentence for that level,
 * requirements the model left out or that have no answer set to level 0. One rating per
 * covered requirement, in the plan's order. `output` null means the call failed: every
 * requirement with answers then gets no rating and the function returns null. Pure.
 */
export function checkAssessment(args: {
  input: AssessorInput;
  output: unknown;
  employerTerms: readonly string[];
  now: Date;
}): ApplicationAssessment | null {
  void args;
  throw new Error("not built yet");
}

/**
 * The body of the `application.assess` job: loads a `submitted` application, builds the
 * input, calls the model (`analyst`, purpose `application.assess`, one attempt of up to
 * 75 s), checks the output, stores the assessment, sets status `assessed` and audits
 * `application.assessed`. An application that is already assessed, or no longer exists, is
 * left alone. Throws when the model did not deliver, so the queue tries again.
 */
export function assessApplication(db: Db, applicationId: string, options?: { now?: () => Date }): Promise<ApplicationAssessment | null> {
  void db;
  void applicationId;
  void options;
  throw new Error("not built yet");
}
