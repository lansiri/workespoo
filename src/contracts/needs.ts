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

/** A question put to the company about one of its own requirements. Never a verdict. */
export const RequirementQuestion = z.object({
  text: z.string().min(1).max(240),
  why: z.string().max(240),
});
export type RequirementQuestion = z.infer<typeof RequirementQuestion>;

/**
 * Anonymous counts over people who opted in to the pool. Shown to the company and the
 * organiser. `hardFilterWouldExclude` describes what a strict filter would do; the system
 * never applies one.
 */
export const PoolEvidence = z.object({
  poolSize: z.number().int().min(0),
  speakTo: z.number().int().min(0),
  hardFilterWouldExclude: z.number().int().min(0),
  computedAt: IsoDateTime,
});
export type PoolEvidence = z.infer<typeof PoolEvidence>;

export const Requirement = z.object({
  id: Id,
  text: z.string().min(1).max(200),
  kind: RequirementKind,
  category: RequirementCategory,
  escoSkillUris: z.array(z.string()),
  /** Index into the posting's sentences that this requirement came from. */
  postingSentence: z.number().int().min(0).nullable(),
  /** Set by law or regulation (public-sector language rules, licences, clearance). Never questioned. */
  statutory: z.boolean(),
  question: RequirementQuestion.nullable(),
  pool: PoolEvidence.nullable(),
});
export type Requirement = z.infer<typeof Requirement>;

export const NeedCardStatus = z.enum(["draft", "confirmed"]);
export type NeedCardStatus = z.infer<typeof NeedCardStatus>;

/** Stored as validated jsonb. Drafted by the agent from a posting, confirmed or edited by the company. */
export const NeedCard = z.object({
  version: z.number().int().min(1),
  jobId: Id,
  companyId: Id,
  title: z.string().min(1).max(140),
  summary: z.string().max(400),
  requirements: z.array(Requirement).max(12),
  status: NeedCardStatus,
  confirmedAt: IsoDateTime.nullable(),
});
export type NeedCard = z.infer<typeof NeedCard>;

/** JSON the analyst model returns when drafting a Need Card. Code adds ids, ESCO URIs and pool counts. */
export const NeedCardDraft = z.object({
  title: z.string().min(1).max(140),
  summary: z.string().max(400),
  requirements: z
    .array(
      z.object({
        text: z.string().min(1).max(200),
        kind: RequirementKind,
        category: RequirementCategory,
        postingSentence: z.number().int().min(0).nullable(),
        statutory: z.boolean(),
        /** Short English skill phrases to ground in ESCO. Empty for non-skill requirements. */
        skillPhrases: z.array(z.string().max(80)).max(4),
        question: RequirementQuestion.nullable(),
      }),
    )
    .max(12),
});
export type NeedCardDraft = z.infer<typeof NeedCardDraft>;

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
