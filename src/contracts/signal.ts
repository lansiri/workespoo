import { z } from "zod";
import { EvidenceRef, Id, IsoDateTime } from "./common";

export const SignalKind = z.enum(["skill", "tool", "knowledge", "domain"]);
export type SignalKind = z.infer<typeof SignalKind>;

export const SignalStatus = z.enum(["proposed", "approved", "removed"]);
export type SignalStatus = z.infer<typeof SignalStatus>;

/** A grounding of a phrase in the ESCO taxonomy. Finnish labels come from ESCO, never from a model. */
export const EscoRef = z.object({
  uri: z.string().min(1),
  labelEn: z.string(),
  labelFi: z.string().nullable(),
});
export type EscoRef = z.infer<typeof EscoRef>;

/**
 * One thing the person can do or knows, backed by pointers into what they said.
 * There is deliberately no level, score or strength field. `hasExample` is internal:
 * it only tells the interviewer whether asking once for a concrete example is still worthwhile.
 */
export const Signal = z.object({
  id: Id,
  phrase: z.string().min(1).max(80),
  kind: SignalKind,
  esco: EscoRef.nullable(),
  evidence: z.array(EvidenceRef),
  hasExample: z.boolean(),
  status: SignalStatus,
  addedBy: z.enum(["agent", "person"]),
});
export type Signal = z.infer<typeof Signal>;

/** What the person says they want next. Everything is self-declared and optional. */
export const LookingFor = z.object({
  roles: z.array(z.string().max(80)).max(5),
  workMode: z.enum(["onsite", "hybrid", "remote"]).nullable(),
  startFrom: z.string().max(80).nullable(),
  /** Languages the person says they are comfortable working in. Never inferred. */
  workLanguages: z.array(z.string().max(40)).max(6),
});
export type LookingFor = z.infer<typeof LookingFor>;

/**
 * What a company sees before a mutual opt-in: a neutral English rendering, labelled as a
 * rendering in the UI. It must carry no name, no original quote, no hint of interview
 * language, fluency or input mode.
 */
export const CompanyView = z.object({
  summary: z.string().max(400),
  signals: z.array(z.object({ signalId: Id, rendering: z.string().max(300) })),
});
export type CompanyView = z.infer<typeof CompanyView>;

/** Stored as validated jsonb. Additive changes need no migration; bump `version` on edits. */
export const SignalCard = z.object({
  version: z.number().int().min(1),
  handle: z.string().min(1).max(40),
  headline: z.string().max(140),
  signals: z.array(Signal),
  lookingFor: LookingFor,
  companyView: CompanyView,
  approvedAt: IsoDateTime.nullable(),
});
export type SignalCard = z.infer<typeof SignalCard>;

export const EMPTY_LOOKING_FOR: LookingFor = {
  roles: [],
  workMode: null,
  startFrom: null,
  workLanguages: [],
};
