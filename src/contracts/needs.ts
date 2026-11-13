import { z } from "zod";
import { Id, IsoDateTime } from "./common";

export const RequirementKind = z.enum(["must", "nice"]);
export type RequirementKind = z.infer<typeof RequirementKind>;

export const RequirementCategory = z.enum([
  "skill",
  "language",
  "education",
  "experience",
  "authorisation",
  "other",
]);
export type RequirementCategory = z.infer<typeof RequirementCategory>;

/**
 * Whether a requirement is set by law or regulation. Anything other than `none` is never
 * questioned and its exclusion count is hidden.
 */
export const Statutory = z.enum(["none", "language_act", "licence", "clearance", "other_law"]);
export type Statutory = z.infer<typeof Statutory>;

export const QuestionType = z.enum(["language", "years", "degree", "tool", "vague"]);
export type QuestionType = z.infer<typeof QuestionType>;

export const QuestionAnswer = z.object({
  choice: z.enum(["keep", "make_nice", "reworded", "remove"]),
  note: z.string().max(300).optional(),
  at: IsoDateTime,
});
export type QuestionAnswer = z.infer<typeof QuestionAnswer>;

/** A question put to the company about one of its own requirements. Never a verdict. */
export const RequirementQuestion = z.object({
  type: QuestionType,
  text: z.string().min(1).max(240),
  why: z.string().max(200),
  answer: QuestionAnswer.nullable(),
});
export type RequirementQuestion = z.infer<typeof RequirementQuestion>;

/**
 * Anonymous counts over people who opted in to the pool, shown to the company and the
 * organiser. `relevant` is the number of people who count for this need at all; `speakTo`
 * is how many of them have a card that speaks to this requirement.
 * `hardFilterWouldExclude` describes what a strict filter would do ("did not mention it",
 * never "lacks it"); the system never applies one. It is null for statutory requirements.
 * `selfDeclaredOnly` applies to languages: people counted only because they named it as a
 * work language.
 */
export const PoolEvidence = z.object({
  scope: z.enum(["relevant", "whole_pool"]),
  relevant: z.number().int().min(0),
  speakTo: z.number().int().min(0),
  hardFilterWouldExclude: z.number().int().min(0).nullable(),
  selfDeclaredOnly: z.number().int().min(0).nullable(),
  computedAt: IsoDateTime,
});
export type PoolEvidence = z.infer<typeof PoolEvidence>;

export const Requirement = z.object({
  id: Id,
  text: z.string().min(1).max(200),
  kind: RequirementKind,
  category: RequirementCategory,
  escoSkillUris: z.array(z.string()),
  /** 0-based index into `Job.sentences`. Null for requirements the company added. */
  postingSentence: z.number().int().min(0).nullable(),
  source: z.enum(["agent", "company"]),
  /** ISO 639-1, for `language` requirements. */
  languageCode: z
    .string()
    .regex(/^[a-z]{2}$/)
    .nullable(),
  statutory: Statutory,
  question: RequirementQuestion.nullable(),
  pool: PoolEvidence.nullable(),
});
export type Requirement = z.infer<typeof Requirement>;

export const NeedCardStatus = z.enum(["draft", "confirmed", "stale"]);
export type NeedCardStatus = z.infer<typeof NeedCardStatus>;

/**
 * Stored as validated jsonb. Drafted by the agent from a posting, then confirmed or edited
 * by the company. `companyId` is null for a card drafted only to explain a posting in a
 * person's own job feed.
 */
export const NeedCard = z.object({
  id: Id,
  jobId: Id,
  companyId: Id.nullable(),
  version: z.number().int().min(1),
  title: z.string().min(1).max(140),
  summary: z.string().max(400),
  /** Language of the source posting. */
  lang: z.string().max(8),
  status: NeedCardStatus,
  /** Posting sentences left out because they held protected or personal content. */
  droppedSentences: z.array(z.number().int().min(0)),
  requirements: z.array(Requirement).max(12),
  confirmedAt: IsoDateTime.nullable(),
});
export type NeedCard = z.infer<typeof NeedCard>;

/**
 * JSON the analyst model returns when drafting a Need Card. Shape follows
 * docs/specs/prompts/need-card-draft.md. Code maps `sentence` to `postingSentence`, the
 * `K<n>` candidate labels in `esco` to URIs, `language` to `languageCode`, decides the exact
 * statutory class, and adds ids and pool counts.
 */
export const NeedCardDraftOutput = z.object({
  title: z.string().min(1).max(60),
  summary: z.string().max(300),
  requirements: z
    .array(
      z.object({
        text: z.string().min(1).max(80),
        kind: RequirementKind,
        category: RequirementCategory,
        sentence: z.number().int().min(0),
        esco: z.array(z.string().regex(/^K\d+$/)).max(3),
        language: z
          .string()
          .regex(/^[a-z]{2}$/)
          .nullable(),
        years: z.number().int().nullable(),
        statutory: z.enum(["law", "none"]),
        questionType: z.enum(["none", "language", "years", "degree", "tool", "vague"]),
        question: z.string().nullable(),
        why: z.string().nullable(),
      }),
    )
    .max(12),
  dropped: z.array(z.number().int().min(0)),
});
export type NeedCardDraftOutput = z.infer<typeof NeedCardDraftOutput>;

/**
 * An organisation on the demand side. In the demo, companies derived from real postings
 * are masked: `displayName` is something like "Demo company 07" and the real employer
 * name is never shown on company-side screens.
 */
export const Company = z.object({
  id: Id,
  displayName: z.string().min(1).max(80),
  source: z.enum(["posting", "synthetic"]),
  masked: z.boolean(),
  participating: z.boolean(),
});
export type Company = z.infer<typeof Company>;
