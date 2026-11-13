import { z } from "zod";
import { Id, IsoDateTime, Lang } from "./common";

export const JobSource = z.enum(["tmt", "thehub", "kuntarekry", "workinfinland"]);
export type JobSource = z.infer<typeof JobSource>;

/** Attribution text that must be shown wherever postings from a source appear. */
export const JOB_SOURCE_ATTRIBUTION: Record<JobSource, string> = {
  tmt: "Lähde: Työmarkkinatorin asiakastietojärjestelmä (Job Market Finland)",
  thehub: "Source: The Hub",
  kuntarekry: "Lähde: Kuntarekry",
  workinfinland: "Source: Work in Finland",
};

/** Whether the employer is a public body. Drives the statutory language rule on Need Cards. */
export const EmployerSector = z.enum(["public", "private", "unknown"]);
export type EmployerSector = z.infer<typeof EmployerSector>;

/**
 * A public job posting, normalised. Recruiter names, emails and phone numbers are dropped
 * at ingestion, including those inside `description`.
 */
export const Job = z.object({
  id: Id,
  source: JobSource,
  sourceId: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1),
  employerName: z.string(),
  employerBusinessId: z.string().nullable(),
  sector: EmployerSector,
  municipality: z.string().nullable(),
  municipalityCode: z.string().nullable(),
  region: z.string().nullable(),
  lang: Lang,
  /** Working languages the posting states, ISO 639-1. Empty when it does not say. */
  workLanguages: z.array(z.string()),
  description: z.string(),
  /**
   * `description` split into sentences after redaction. Need Card requirements and match
   * reasons point at these by plain 0-based index (shown to models as `P0`, `P1`, ...).
   */
  sentences: z.array(z.string()),
  postedAt: IsoDateTime.nullable(),
  expiresAt: IsoDateTime.nullable(),
  escoOccupationUris: z.array(z.string()),
  escoSkillUris: z.array(z.string()),
  active: z.boolean(),
});
export type Job = z.infer<typeof Job>;

/** The small shape used in lists and in the "jobs light up" event. */
export const JobTeaser = z.object({
  id: Id,
  title: z.string(),
  employerName: z.string(),
  municipality: z.string().nullable(),
  url: z.string(),
  source: JobSource,
});
export type JobTeaser = z.infer<typeof JobTeaser>;

export const EscoConceptType = z.enum(["skill", "occupation"]);
export type EscoConceptType = z.infer<typeof EscoConceptType>;

export const EscoConcept = z.object({
  uri: z.string().min(1),
  type: EscoConceptType,
  labelEn: z.string(),
  labelFi: z.string().nullable(),
  labelSv: z.string().nullable(),
  isco: z.string().nullable(),
  retired: z.boolean(),
});
export type EscoConcept = z.infer<typeof EscoConcept>;

export const EscoRelation = z.enum(["essential", "optional"]);
export type EscoRelation = z.infer<typeof EscoRelation>;

/** Finnish municipality codes used in filters. */
export const MUNICIPALITY_CODES = {
  espoo: "049",
  helsinki: "091",
  vantaa: "092",
  kauniainen: "235",
} as const;

export const REGION_UUSIMAA = "01";
