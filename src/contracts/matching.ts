import { z } from "zod";
import { EvidenceRef, Id, IsoDateTime } from "./common";
import { SignalId } from "./signal";
import { Actor } from "./trust";

/* ------------------------------------------------------------------------------------------
 * Person to jobs: the person's own feed. Postings may be ordered for the person; that ranks
 * postings, not people. There is no score field anywhere in this file, by design.
 * ---------------------------------------------------------------------------------------- */

/** How a posting was found for a person. */
export const MatchBasis = z.enum(["direct", "occupation", "text", "role"]);
export type MatchBasis = z.infer<typeof MatchBasis>;

/**
 * One plain-language reason. The model only writes `text`; code decides which signal and
 * posting sentence it may cite, and rejects praise, pronouns, percentages and counts.
 */
export const JobMatchReason = z.object({
  text: z.string().min(1).max(200),
  signalId: SignalId,
  /** The signal's first evidence reference. Null for a signal the person added without words. */
  evidence: EvidenceRef.nullable(),
  /** 0-based index into `Job.sentences`. */
  postingSentence: z.number().int().min(0).nullable(),
  escoUri: z.string().optional(),
});
export type JobMatchReason = z.infer<typeof JobMatchReason>;

export const JobMatch = z.object({
  id: Id,
  talentId: Id,
  jobId: Id,
  cardVersion: z.number().int().min(1),
  /** Order of this posting in the person's feed. */
  feedPosition: z.number().int().min(0),
  basis: z.array(MatchBasis),
  reasonsSource: z.enum(["model", "code"]),
  reasons: z.array(JobMatchReason).max(3),
  /** Things the posting asks for that the conversation did not cover. Computed by code. */
  notMentioned: z.array(z.string().max(200)).max(8),
  computedAt: IsoDateTime,
});
export type JobMatch = z.infer<typeof JobMatch>;

/** Model output for a person's feed reasons. `S<n>` and `P<n>` are the labels the prompt gave. */
export const MatchReasonsOutput = z.object({
  reasons: z
    .array(
      z.object({
        signal: z.string().regex(/^S\d+$/),
        sentence: z
          .string()
          .regex(/^P\d+$/)
          .nullable(),
        text: z.string().min(1).max(160),
      }),
    )
    .min(1)
    .max(3),
});
export type MatchReasonsOutput = z.infer<typeof MatchReasonsOutput>;

/* ------------------------------------------------------------------------------------------
 * Need to people: eligibility, digests and picks.
 * ---------------------------------------------------------------------------------------- */

/**
 * Whether a person counts for a need at all: a yes or no plus the set of requirements their
 * card speaks to. Never a count, never an order. Must-haves play no part in it.
 */
export const Eligibility = z.object({
  needCardId: Id,
  needCardVersion: z.number().int().min(1),
  talentId: Id,
  cardVersion: z.number().int().min(1),
  eligible: z.boolean(),
  touchedRequirementIds: z.array(Id),
  /** Why a person is not suggested right now (for example a rotation rule), or null. */
  exclusion: z.string().max(60).nullable(),
  computedAt: IsoDateTime,
});
export type Eligibility = z.infer<typeof Eligibility>;

export const DigestStatus = z.enum(["draft", "published"]);
export type DigestStatus = z.infer<typeof DigestStatus>;

/** One day's suggestions for one company. Published only by an organiser. */
export const Digest = z.object({
  id: Id,
  companyId: Id,
  eventId: Id.nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: DigestStatus,
  /** Seed for the selection tie-break and the display shuffle, kept for reproducibility. */
  seed: z.string(),
  /** Need Cards for which nobody was eligible. */
  emptyNeeds: z.array(Id),
  publishedBy: Actor.nullable(),
  publishedAt: IsoDateTime.nullable(),
});
export type Digest = z.infer<typeof Digest>;

export const PickStatus = z.enum(["suggested", "approved", "removed"]);
export type PickStatus = z.infer<typeof PickStatus>;

export const PickReason = z.object({
  text: z.string().min(1).max(200),
  requirementId: Id,
  signalId: SignalId,
  evidence: EvidenceRef.nullable(),
  postingSentence: z.number().int().min(0).nullable(),
});
export type PickReason = z.infer<typeof PickReason>;

/** How a pick came to be selected, for the audit trail. */
export const PickSelection = z.object({
  seed: z.string(),
  lastDraftedBefore: IsoDateTime.nullable(),
  pass: z.number().int().min(0),
});
export type PickSelection = z.infer<typeof PickSelection>;

/**
 * A person suggested to a company for one need. Picks have no score and no order. Each one
 * is approved or removed individually by an organiser; removals and manual additions carry
 * a reason.
 */
export const Pick = z.object({
  id: Id,
  digestId: Id,
  companyId: Id,
  needCardId: Id,
  needCardVersion: z.number().int().min(1),
  talentId: Id,
  cardVersion: z.number().int().min(1),
  origin: z.enum(["agent", "organiser", "talent_request"]),
  reasons: z.array(PickReason).max(3),
  /** Ids of the need's requirements the card does not speak to. Shown as "not mentioned". */
  notMentioned: z.array(Id),
  status: PickStatus,
  selection: PickSelection.nullable(),
  reasonCode: z.string().max(40).nullable(),
  decidedBy: Actor.nullable(),
  decidedAt: IsoDateTime.nullable(),
  decisionNote: z.string().max(400).nullable(),
});
export type Pick = z.infer<typeof Pick>;

/** Model output for pick reasons. `R<n>` and `S<n>` are the labels the prompt gave. */
export const PicksDraftOutput = z.object({
  reasons: z
    .array(
      z.object({
        req: z.string().regex(/^R\d+$/),
        signal: z.string().regex(/^S\d+$/),
        text: z.string().min(1).max(160),
      }),
    )
    .min(1)
    .max(3),
});
export type PicksDraftOutput = z.infer<typeof PicksDraftOutput>;

/* ------------------------------------------------------------------------------------------
 * Introductions: the mutual opt-in.
 * ---------------------------------------------------------------------------------------- */

/**
 * Says whose turn it is. Identity and original quotes are revealed only at `accepted`.
 * Allowed transitions are listed in docs/specs/picks-and-intros.md; anything else is a 409.
 */
export const IntroStatus = z.enum([
  "pending_review",
  "awaiting_talent",
  "awaiting_company",
  "accepted",
  "declined",
  "withdrawn",
  "not_approved",
  "expired",
  "cancelled",
]);
export type IntroStatus = z.infer<typeof IntroStatus>;

export const Intro = z.object({
  id: Id,
  talentId: Id,
  companyId: Id,
  needCardId: Id.nullable(),
  pickId: Id.nullable(),
  initiatedBy: z.enum(["company", "talent"]),
  status: IntroStatus,
  /** For a request the person made: which of their signals speaks to which requirement. */
  requestPairs: z.array(z.object({ signalId: SignalId, requirementId: Id })),
  requestNote: z.string().max(400).nullable(),
  organiserDecision: z
    .object({
      by: Actor,
      at: IsoDateTime,
      reasonCode: z.string().max(40).nullable(),
      note: z.string().max(400).nullable(),
    })
    .nullable(),
  requestedAt: IsoDateTime,
  respondedAt: IsoDateTime.nullable(),
  acceptedAt: IsoDateTime.nullable(),
  revealedAt: IsoDateTime.nullable(),
  expiresAt: IsoDateTime.nullable(),
});
export type Intro = z.infer<typeof Intro>;

/* ------------------------------------------------------------------------------------------
 * The event day.
 * ---------------------------------------------------------------------------------------- */

export const MatchEvent = z.object({
  id: Id,
  name: z.string().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(["online", "in_person", "hybrid"]),
  place: z.string().max(160).nullable(),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  slotMinutes: z.number().int().min(5),
  bufferMinutes: z.number().int().min(0),
  maxMeetingsPerTalent: z.number().int().min(1),
});
export type MatchEvent = z.infer<typeof MatchEvent>;

export const EventCompany = z.object({
  eventId: Id,
  companyId: Id,
  /** Table or room number at the event. */
  number: z.number().int().min(1),
  format: z.enum(["online", "in_person"]),
});
export type EventCompany = z.infer<typeof EventCompany>;

export const AgendaItem = z.object({
  id: Id,
  eventId: Id,
  introId: Id,
  talentId: Id,
  companyId: Id,
  /** Null while on the waitlist. */
  startsAt: IsoDateTime.nullable(),
  endsAt: IsoDateTime.nullable(),
  place: z.string().max(160).nullable(),
  status: z.enum(["scheduled", "waitlist", "cancelled"]),
});
export type AgendaItem = z.infer<typeof AgendaItem>;

/** An in-product message. There is no real email in the prototype. */
export const Notification = z.object({
  id: Id,
  recipientType: z.enum(["talent", "company", "organiser"]),
  recipientId: z.string().min(1),
  kind: z.string().min(1).max(60),
  payload: z.record(z.string(), z.unknown()),
  createdAt: IsoDateTime,
  readAt: IsoDateTime.nullable(),
});
export type Notification = z.infer<typeof Notification>;

/** A note an organiser leaves from the unmatched queue: a gap in demand, or a snooze. */
export const PoolNote = z.object({
  id: Id,
  talentId: Id.nullable(),
  kind: z.enum(["gap", "snooze"]),
  text: z.string().max(400),
  escoUri: z.string().nullable(),
  until: IsoDateTime.nullable(),
  by: Actor,
  at: IsoDateTime,
});
export type PoolNote = z.infer<typeof PoolNote>;

/** Organiser-tunable settings, stored in `app_meta` under `settings:<eventId>:<key>`. */
export const MATCHING_SETTINGS_DEFAULTS = {
  digestSize: 5,
  rotationDays: 7,
  maxPicksPerDay: 3,
  talentRequestCap: 3,
  dailyRunAt: "06:00",
} as const;
