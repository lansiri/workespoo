import { z } from "zod";
import { EvidenceRef, Id, InputMode, IsoDateTime, UiLang } from "./common";
import { TurnRole } from "./interview";
import { RequirementCategory, RequirementKind } from "./needs";

/**
 * A job application: a person chooses one job of the event, takes a job interview whose
 * questions come from that job's ad, sends it, and the answers are rated against the ad's
 * requirements. Applicants to the same job are then put in order for an organiser, who can
 * move people and must approve the list before the company sees it.
 *
 * This is the one place where something about a person is rated (CLAUDE.md rule 4, changed by
 * the owner on 14 November 2026). What keeps it fair is part of these shapes:
 * - every applicant to a job is asked about the same requirements (`ApplicationPlan`);
 * - a rating is about the evidence for one requirement, on a short scale with written
 *   anchors (`RATING_LEVELS`), and points at the person's own sentences (`EvidenceRef`);
 * - each application is rated by itself; the order is computed by code from the ratings.
 *
 * Spec: docs/specs/job-interview.md.
 */

/** At most this many requirements of an ad are covered. The same ones for every applicant. */
export const APPLICATION_MAX_REQUIREMENTS = 6;
/** At most this many follow-up questions per requirement. */
export const APPLICATION_MAX_FOLLOW_UPS = 1;
/** Bump when the scale, its anchors or the assessment prompt change. Stored with every assessment. */
export const APPLICATION_RUBRIC_VERSION = "2026-11-14";

/**
 * - `interviewing`: the job interview is running.
 * - `review`: every question has been asked (or the person stopped); the person is looking
 *   through the answers. Nothing has been sent and nobody else sees anything.
 * - `submitted`: the person sent it; the assessment has not come back yet.
 * - `assessed`: rated. Only now does it appear in the organiser's list.
 * A withdrawn application is deleted, not kept with a status.
 */
export const ApplicationStatus = z.enum(["interviewing", "review", "submitted", "assessed"]);
export type ApplicationStatus = z.infer<typeof ApplicationStatus>;

/* ------------------------------------------------------------------------------------------
 * The plan: which requirements are covered, and the question for each
 * ---------------------------------------------------------------------------------------- */

/**
 * One requirement of the ad as this job interview covers it: a copy taken from the Need Card
 * when the application starts, with the question that is asked about it.
 */
export const CoveredRequirement = z.object({
  /** `Requirement.id` in the Need Card. */
  requirementId: Id,
  text: z.string().min(1).max(200),
  /** As it was when the application started. The order uses the card's kind at the time it is computed. */
  kind: RequirementKind,
  category: RequirementCategory,
  /** 0-based index into `Job.sentences`: the sentence of the ad this requirement came from, when there is one. */
  postingSentence: z.number().int().min(0).nullable(),
  /** The question asked about it, in the interview's language. */
  question: z.string().min(1).max(300),
  /** A question the checks refused, or that the model did not deliver, is worded by code. */
  wording: z.enum(["model", "code"]),
});
export type CoveredRequirement = z.infer<typeof CoveredRequirement>;

/** Stored as jsonb in `application.plan`. Made once, when the application starts. */
export const ApplicationPlan = z.object({
  needCardId: Id,
  needCardVersion: z.number().int().min(1),
  /** Language of the questions and the scripted lines. */
  lang: UiLang,
  requirements: z.array(CoveredRequirement).min(1).max(APPLICATION_MAX_REQUIREMENTS),
});
export type ApplicationPlan = z.infer<typeof ApplicationPlan>;

/* ------------------------------------------------------------------------------------------
 * The interview's state and turns
 * ---------------------------------------------------------------------------------------- */

/** Where one requirement stands in the interview. `skipped`: the person passed on the question. */
export const RequirementProgress = z.enum(["waiting", "asked", "answered", "skipped"]);
export type RequirementProgress = z.infer<typeof RequirementProgress>;

/** Stored as jsonb in `application.state`. */
export const ApplicationState = z.object({
  /** Position in `plan.requirements` of the requirement being asked about; the length when all are done. */
  cursor: z.number().int().min(0),
  /** Follow-up questions asked so far, by requirement id. */
  followUps: z.record(z.string(), z.number().int().min(0)),
  progress: z.record(z.string(), RequirementProgress),
  /**
   * Sentences of the person's answers that were noted for a requirement while the interview
   * ran, by requirement id. They only mark the words on screen; the assessment reads the
   * answers again and decides for itself.
   */
  noted: z.record(z.string(), z.array(EvidenceRef)),
});
export type ApplicationState = z.infer<typeof ApplicationState>;

/** `follow_up`: one more question on the same requirement. `repair`: the answer could not be used (empty, or a request to delete). */
export const ApplicationTurnKind = z.enum(["opening", "question", "follow_up", "repair", "closing", "answer"]);
export type ApplicationTurnKind = z.infer<typeof ApplicationTurnKind>;

/**
 * One turn of a job interview. Numbering is the same as in the general interview: turn
 * indexes are 0-based over all turns (T0 is the opening), sentence numbers are 1-based, and
 * an `EvidenceRef` of an application points into these turns.
 */
export const ApplicationTurn = z.object({
  id: Id,
  applicationId: Id,
  index: z.number().int().min(0),
  role: TurnRole,
  kind: ApplicationTurnKind,
  /** The requirement an interviewer turn asks about, or a participant turn answers. Null for the opening's greeting part and the closing. */
  requirementId: Id.nullable(),
  text: z.string(),
  /** `text` split into sentences when the turn is stored. */
  sentences: z.array(z.string()),
  /** Whether the person spoke or typed. Never shown to an organiser or a company, never given to a model. */
  inputMode: InputMode.nullable(),
  /** Set when the person removed this answer. Its text is blanked and nothing rests on it. */
  removedAt: IsoDateTime.nullable(),
  at: IsoDateTime,
});
export type ApplicationTurn = z.infer<typeof ApplicationTurn>;

/* ------------------------------------------------------------------------------------------
 * The assessment
 * ---------------------------------------------------------------------------------------- */

/**
 * The scale. A level describes the evidence in the answers for one requirement, never the
 * person. The anchors are shown to the person, the organiser and the company as written here
 * (through the feature's translated text), and are given to the model word for word.
 */
export const RATING_LEVELS = [
  { level: 0, key: "none", anchor: "Nothing in the answers speaks to this requirement." },
  { level: 1, key: "stated", anchor: "The person says they have this, without an example from their own work." },
  { level: 2, key: "example", anchor: "A concrete example from the person's own work that involves this." },
  {
    level: 3,
    key: "strong_example",
    anchor: "A concrete example from their own work, with what they did and what came of it, in a setting like the one the ad describes.",
  },
] as const;
export const RATING_MAX_LEVEL = 3;
export const RatingLevel = z.number().int().min(0).max(RATING_MAX_LEVEL);
export type RatingLevel = z.infer<typeof RatingLevel>;

/** What a requirement counts for in the order. Taken from the Need Card's kind at the time the order is computed. */
export const RATING_WEIGHT: Record<RequirementKind, number> = { must: 2, nice: 1 };

/** The same short text in the three interface languages. Model-written unless marked otherwise. */
export const LocalText = z.object({
  en: z.string().max(500),
  fi: z.string().max(500),
  sv: z.string().max(500),
});
export type LocalText = z.infer<typeof LocalText>;

export const RequirementRating = z.object({
  requirementId: Id,
  level: RatingLevel,
  /** The person's own sentences the level rests on. Empty only at level 0. */
  evidence: z.array(EvidenceRef).max(4),
  /** Why this level: a description of the evidence, never of the person. */
  reason: LocalText,
  /** `code`: the model's reason failed a check (or its reference did not resolve) and code worded it. */
  wording: z.enum(["model", "code"]),
});
export type RequirementRating = z.infer<typeof RequirementRating>;

/** Stored as jsonb in `application.assessment`. One rating per covered requirement, in the plan's order. */
export const ApplicationAssessment = z.object({
  rubricVersion: z.string(),
  ratings: z.array(RequirementRating).max(APPLICATION_MAX_REQUIREMENTS),
  /** Two sentences at most on what the answers gave evidence for and what they did not. */
  summary: LocalText,
  assessedAt: IsoDateTime,
});
export type ApplicationAssessment = z.infer<typeof ApplicationAssessment>;

/* ------------------------------------------------------------------------------------------
 * What the models return (docs/specs/prompts/application.md)
 * ---------------------------------------------------------------------------------------- */

/** Requirements are labelled R1, R2, ... for models, in the plan's order. */
export const RequirementLabel = z.string().regex(/^R\d+$/);

/*
 * These schemas describe the shape of what a model returns and are deliberately wider than
 * what is used. Code then keeps what holds (a question of 10 to 300 characters, the first four
 * references that resolve, a follow-up of 8 to 240 characters) and replaces the rest one by
 * one. A schema as tight as the rule would throw away a whole answer, and with it a person's
 * assessment, for one sentence that ran a few characters long.
 */

/** `application.plan`: the wording of the question for each covered requirement. */
export const ApplicationPlanOutput = z.object({
  questions: z.array(z.object({ requirement: RequirementLabel, question: z.string().max(1000) })).max(24),
});
export type ApplicationPlanOutput = z.infer<typeof ApplicationPlanOutput>;

/** `application.turn`: read one answer, decide whether one more question is worth asking. */
export const ApplicationTurnOutput = z.object({
  /** Sentence numbers (1-based) of this answer that speak to the requirement. */
  evidence: z.array(z.number().int().min(1)).max(80),
  /** True when the answer holds a concrete example of the person's own work for this requirement. */
  concrete: z.boolean(),
  /** What a follow-up could still bring out. */
  missing: z.enum(["none", "example", "own_part", "result"]),
  /** One follow-up question in the interview's language, or null when nothing more is needed. */
  followUp: z.string().max(1000).nullable(),
});
export type ApplicationTurnOutput = z.infer<typeof ApplicationTurnOutput>;

/** `application.assess`: one rating per requirement, with reasons in three languages. */
export const ApplicationAssessOutput = z.object({
  ratings: z
    .array(
      z.object({
        requirement: RequirementLabel,
        level: RatingLevel,
        /** Labels of the person's sentences, like `T3.S2`. Code keeps the first four that resolve. */
        evidence: z.array(z.string().max(40)).max(40),
        reason_en: z.string().max(2000),
        reason_fi: z.string().max(2000),
        reason_sv: z.string().max(2000),
      }),
    )
    .max(24),
  summary_en: z.string().max(3000),
  summary_fi: z.string().max(3000),
  summary_sv: z.string().max(3000),
});
export type ApplicationAssessOutput = z.infer<typeof ApplicationAssessOutput>;

/* ------------------------------------------------------------------------------------------
 * The ranked list
 * ---------------------------------------------------------------------------------------- */

/** An organiser's decision to put one applicant at a position, whatever the points say. Stored in `applicant_ranking.pins`. */
export const PinnedPosition = z.object({
  applicationId: Id,
  /** 1-based position in the list. */
  position: z.number().int().min(1),
  reason: z.string().min(3).max(300),
  at: IsoDateTime,
});
export type PinnedPosition = z.infer<typeof PinnedPosition>;

/** One applicant as the company sees them: no name, no own words. */
export const PublishedApplicant = z.object({
  applicationId: Id,
  talentId: Id,
  handle: z.string(),
  position: z.number().int().min(1),
  points: z.number().int().min(0),
  maxPoints: z.number().int().min(0),
  /** True when an organiser set this position. The reason stays with the organiser. */
  moved: z.boolean(),
  ratings: z.array(z.object({ requirementId: Id, level: RatingLevel, reason: LocalText })),
  summary: LocalText,
});
export type PublishedApplicant = z.infer<typeof PublishedApplicant>;

/** The list as an organiser approved it. Stored in `applicant_ranking.published`; the company sees exactly this. */
export const PublishedRanking = z.object({
  needCardVersion: z.number().int().min(1),
  requirements: z.array(z.object({ requirementId: Id, text: z.string(), kind: RequirementKind })),
  applicants: z.array(PublishedApplicant),
  publishedAt: IsoDateTime,
});
export type PublishedRanking = z.infer<typeof PublishedRanking>;

/* ------------------------------------------------------------------------------------------
 * API requests, responses and events
 * ---------------------------------------------------------------------------------------- */

/** `POST /api/application`. The person agrees to the rating and ranking before anything starts. */
export const StartApplicationRequest = z.object({
  jobId: Id,
  uiLang: UiLang,
  consent: z.object({ assessment: z.literal(true) }),
});
export type StartApplicationRequest = z.infer<typeof StartApplicationRequest>;

export const StartApplicationResponse = z.object({
  applicationId: Id,
  opening: ApplicationTurn,
});
export type StartApplicationResponse = z.infer<typeof StartApplicationResponse>;

/** `POST /api/application/{id}/turn`. The response is a server-sent event stream of `ApplicationEvent`. */
export const ApplicationTurnRequest = z.object({
  text: z.string().min(1).max(4000),
  inputMode: InputMode,
  /** An id the browser makes up for this answer, so a retry after a network error is stored once. */
  clientTurnId: z.string().min(8).max(64).optional(),
});
export type ApplicationTurnRequest = z.infer<typeof ApplicationTurnRequest>;

/** What the server streams back on a turn. One JSON object per server-sent event; `type` discriminates. */
export const ApplicationEvent = z.discriminatedUnion("type", [
  /** One sentence of the interviewer's next line, for the screen and the voice. */
  z.object({ type: z.literal("turn.delta"), text: z.string() }),
  /** The person's answer as stored. */
  z.object({ type: z.literal("answer.stored"), turn: ApplicationTurn }),
  /** Words of that answer were noted for a requirement. */
  z.object({
    type: z.literal("requirement.noted"),
    requirementId: Id,
    evidence: z.array(EvidenceRef),
    progress: RequirementProgress,
  }),
  /** The interviewer's line as stored. `ended` is true on the closing line: the application is now in `review`. */
  z.object({ type: z.literal("turn.done"), turn: ApplicationTurn, ended: z.boolean() }),
  z.object({ type: z.literal("error"), message: z.string(), retryable: z.boolean() }),
]);
export type ApplicationEvent = z.infer<typeof ApplicationEvent>;

/** `POST /api/organiser/applicants/{jobId}/move`. A move always carries a reason. */
export const MoveApplicantRequest = z.object({
  applicationId: Id,
  position: z.number().int().min(1),
  reason: z.string().min(3).max(300),
});
export type MoveApplicantRequest = z.infer<typeof MoveApplicantRequest>;

/** Payload of the `application.assess` queue job. */
export const AssessApplicationPayload = z.object({ applicationId: Id });
export type AssessApplicationPayload = z.infer<typeof AssessApplicationPayload>;
