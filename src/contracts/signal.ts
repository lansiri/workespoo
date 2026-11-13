import { z } from "zod";
import { EvidenceRef, Id, InputMode, IsoDateTime } from "./common";

export const SignalKind = z.enum(["skill", "tool", "knowledge", "domain"]);
export type SignalKind = z.infer<typeof SignalKind>;

export const SignalStatus = z.enum(["proposed", "approved", "removed"]);
export type SignalStatus = z.infer<typeof SignalStatus>;

/** Short id, stable within one person's signals: `s1`, `s2`, ... */
export const SignalId = z.string().regex(/^s\d+$/);
export type SignalId = z.infer<typeof SignalId>;

/** A grounding of a phrase in the ESCO taxonomy. Finnish labels come from ESCO, never from a model. */
export const EscoRef = z.object({
  uri: z.string().min(1),
  labelEn: z.string(),
  labelFi: z.string().nullable(),
});
export type EscoRef = z.infer<typeof EscoRef>;

/**
 * One thing the person can do or knows, backed by pointers into what they said.
 *
 * There is deliberately no level, score or strength field. `hasExample` is internal: it only
 * tells the interviewer whether asking once for a concrete example is still worthwhile, and it
 * never leaves the server (see `SignalPublic`).
 *
 * `evidence` may be empty only when `addedBy` is `person`; use `signalEvidenceIsValid`.
 */
export const Signal = z.object({
  id: SignalId,
  /** English, 2 to 6 words, no quality words and no year counts. */
  phrase: z.string().min(2).max(60),
  /** The person's own wording, when they wrote the phrase themselves or in another language. */
  phraseOwn: z.string().max(80).nullable(),
  kind: SignalKind,
  esco: EscoRef.nullable(),
  evidence: z.array(EvidenceRef),
  hasExample: z.boolean(),
  status: SignalStatus,
  addedBy: z.enum(["agent", "person"]),
});
export type Signal = z.infer<typeof Signal>;

export function signalEvidenceIsValid(signal: Pick<Signal, "addedBy" | "evidence">): boolean {
  return signal.addedBy === "person" || signal.evidence.length > 0;
}

/** A signal as it may be sent to a browser: everything except the internal `hasExample`. */
export const SignalPublic = Signal.omit({ hasExample: true });
export type SignalPublic = z.infer<typeof SignalPublic>;

export function toSignalPublic(signal: Signal): SignalPublic {
  const { hasExample: _internal, ...rest } = signal;
  void _internal;
  return rest;
}

/** What the person says they want next. Everything is self-declared and optional. */
export const LookingFor = z.object({
  roles: z.array(z.string().max(60)).max(3),
  workMode: z.enum(["onsite", "hybrid", "remote", "any"]).nullable(),
  startFrom: z.enum(["now", "within_1_month", "within_3_months", "later"]).nullable(),
  /** Languages the person says they are comfortable working in. Never inferred. */
  workLanguages: z.array(z.string().max(40)).max(5),
});
export type LookingFor = z.infer<typeof LookingFor>;

export const EMPTY_LOOKING_FOR: LookingFor = {
  roles: [],
  workMode: null,
  startFrom: null,
  workLanguages: [],
};

/**
 * What companies and organisers see before a mutual opt-in: neutral English renderings,
 * labelled as renderings. They carry no name, no quote, and no hint of interview language,
 * fluency or input mode. `stale` marks a rendering that must be rewritten after an edit;
 * a card cannot be approved while any item is stale.
 */
export const CompanyView = z.object({
  label: z.string().max(140),
  summary: z.string().max(300),
  items: z.array(z.object({ signalId: SignalId, text: z.string().max(220), stale: z.boolean() })),
});
export type CompanyView = z.infer<typeof CompanyView>;

export const SignalCardStatus = z.enum(["draft", "approved"]);
export type SignalCardStatus = z.infer<typeof SignalCardStatus>;

/**
 * Stored as validated jsonb. A person has at most one `approved` card and one `draft`.
 * Additive changes need no migration.
 */
export const SignalCard = z.object({
  version: z.number().int().min(1),
  status: SignalCardStatus,
  handle: z.string().min(1).max(40),
  headline: z.string().max(90),
  signals: z.array(Signal).max(14),
  lookingFor: LookingFor,
  companyView: CompanyView,
  approvedAt: IsoDateTime.nullable(),
});
export type SignalCard = z.infer<typeof SignalCard>;

export const MAX_SIGNALS = { express: 8, full: 14 } as const;

/* ------------------------------------------------------------------------------------------
 * Projections: one payload shape per audience. A field an audience may not see is absent from
 * the payload, not merely hidden in the UI.
 * ---------------------------------------------------------------------------------------- */

/** The company-safe view of one signal. */
export const CardSignalView = z.object({
  id: SignalId,
  phrase: z.string(),
  kind: SignalKind,
  esco: EscoRef.nullable(),
  /** The labelled English rendering, or null when none exists yet. */
  rendering: z.string().nullable(),
});
export type CardSignalView = z.infer<typeof CardSignalView>;

/** A company before a mutual opt-in. */
export const CardForCompany = z.object({
  handle: z.string(),
  synthetic: z.boolean(),
  headline: z.string(),
  summary: z.string(),
  renderingLabel: z.string(),
  signals: z.array(CardSignalView),
  lookingFor: LookingFor,
});
export type CardForCompany = z.infer<typeof CardForCompany>;

/**
 * The organiser sees the company-level view on purpose, plus pool bookkeeping: the person
 * approving picks must not see fluency or language cues either.
 */
export const CardForOrganiser = CardForCompany.extend({
  talentId: Id,
  inPool: z.boolean(),
  version: z.number().int(),
  approvedAt: IsoDateTime.nullable(),
});
export type CardForOrganiser = z.infer<typeof CardForOrganiser>;

/** A company after both sides accepted an introduction. */
export const CardForCompanyRevealed = CardForCompany.extend({
  signals: z.array(
    CardSignalView.extend({ phraseOwn: z.string().nullable(), quotes: z.array(z.string()) }),
  ),
  identity: z.object({ displayName: z.string(), contact: z.string().nullable() }),
  interviewLang: z.string().nullable(),
  inputModes: z.array(InputMode),
});
export type CardForCompanyRevealed = z.infer<typeof CardForCompanyRevealed>;

/** The person's own view: everything about their card except internal fields. */
export const CardForPerson = z.object({
  talentId: Id,
  handle: z.string(),
  synthetic: z.boolean(),
  inPool: z.boolean(),
  status: SignalCardStatus,
  version: z.number().int(),
  /** True when an approved version exists besides this one (this one is then a draft edit). */
  hasApprovedVersion: z.boolean(),
  headline: z.string(),
  summary: z.string(),
  renderingLabel: z.string(),
  signals: z.array(
    SignalPublic.extend({
      /** The person's words, rendered by code from the transcript. */
      quotes: z.array(z.string()),
      rendering: z.string().nullable(),
      stale: z.boolean(),
    }),
  ),
  lookingFor: LookingFor,
  approvedAt: IsoDateTime.nullable(),
  /** True for a real person trying the product live; their data is purged at `purgeAfter`. */
  liveDemo: z.boolean().optional(),
  purgeAfter: IsoDateTime.nullable().optional(),
});
export type CardForPerson = z.infer<typeof CardForPerson>;
