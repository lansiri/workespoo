import { z } from "zod";
import { EvidenceRef, Id, IsoDateTime, SentenceLabel } from "./common";
import { Actor } from "./trust";

/**
 * One plain-language reason. It may point at what the person said and at the posting
 * sentence it relates to. It never praises, grades or compares the person.
 */
export const Reason = z.object({
  text: z.string().min(1).max(280),
  evidence: EvidenceRef.nullable(),
  requirementId: Id.nullable(),
  postingSentence: z.number().int().min(0).nullable(),
});
export type Reason = z.infer<typeof Reason>;

/**
 * A posting suggested to a person in their own job feed. Postings may be ordered for the
 * person; that ranks postings, not people. There is no score field by design.
 */
export const JobMatch = z.object({
  id: Id,
  talentId: Id,
  jobId: Id,
  reasons: z.array(Reason).max(4),
  /** Things the posting asks for that the conversation did not cover. Shown as "not mentioned". */
  notMentioned: z.array(z.string().max(160)).max(6),
  createdAt: IsoDateTime,
});
export type JobMatch = z.infer<typeof JobMatch>;

export const DigestStatus = z.enum(["draft", "published"]);
export type DigestStatus = z.infer<typeof DigestStatus>;

/** One day's suggestions for one company. Published only by an organiser. */
export const Digest = z.object({
  id: Id,
  companyId: Id,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: DigestStatus,
  publishedBy: Actor.nullable(),
  publishedAt: IsoDateTime.nullable(),
});
export type Digest = z.infer<typeof Digest>;

export const PickStatus = z.enum(["suggested", "approved", "removed"]);
export type PickStatus = z.infer<typeof PickStatus>;

/**
 * A person suggested to a company for one need. Picks have no score and no order.
 * Each one is approved or removed individually by an organiser.
 */
export const Pick = z.object({
  id: Id,
  digestId: Id,
  companyId: Id,
  needCardId: Id,
  talentId: Id,
  origin: z.enum(["agent", "organiser", "talent_request"]),
  reasons: z.array(Reason).max(4),
  notMentioned: z.array(z.string().max(160)).max(6),
  status: PickStatus,
  decidedBy: Actor.nullable(),
  decidedAt: IsoDateTime.nullable(),
  decisionNote: z.string().max(400).nullable(),
});
export type Pick = z.infer<typeof Pick>;

export const IntroStatus = z.enum(["requested", "accepted", "declined", "withdrawn"]);
export type IntroStatus = z.infer<typeof IntroStatus>;

/** The mutual opt-in. Identity and original quotes are revealed only once `status` is `accepted`. */
export const Intro = z.object({
  id: Id,
  talentId: Id,
  companyId: Id,
  needCardId: Id.nullable(),
  pickId: Id.nullable(),
  initiatedBy: z.enum(["company", "talent"]),
  status: IntroStatus,
  requestedAt: IsoDateTime,
  respondedAt: IsoDateTime.nullable(),
  revealedAt: IsoDateTime.nullable(),
  agendaItemId: Id.nullable(),
});
export type Intro = z.infer<typeof Intro>;

export const MatchEvent = z.object({
  id: Id,
  name: z.string().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(["online", "in_person", "hybrid"]),
  place: z.string().max(160).nullable(),
});
export type MatchEvent = z.infer<typeof MatchEvent>;

export const AgendaItem = z.object({
  id: Id,
  eventId: Id,
  introId: Id,
  talentId: Id,
  companyId: Id,
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  place: z.string().max(160).nullable(),
  status: z.enum(["scheduled", "met", "missed", "cancelled"]),
});
export type AgendaItem = z.infer<typeof AgendaItem>;

/**
 * JSON the analyst model returns when writing reasons for a batch of candidate postings.
 * `jobRef` is the short label the prompt gave each posting (for example `J3`).
 */
export const MatchReasonsOutput = z.object({
  matches: z
    .array(
      z.object({
        jobRef: z.string().regex(/^J\d{1,2}$/),
        relevant: z.boolean(),
        reasons: z
          .array(
            z.object({
              text: z.string().min(1).max(280),
              ref: SentenceLabel.nullable(),
              postingSentence: z.number().int().min(0).nullable(),
            }),
          )
          .max(3),
        notMentioned: z.array(z.string().max(160)).max(6),
      }),
    )
    .max(20),
});
export type MatchReasonsOutput = z.infer<typeof MatchReasonsOutput>;
