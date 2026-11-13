import { z } from "zod";
import { Id, IsoDateTime } from "./common";

/**
 * Who did something. One of: `system`, `agent:<role>` (for example `agent:analyst`),
 * `organiser`, `talent:<id>`, `company:<id>`.
 */
export const Actor = z.string().regex(/^(system|organiser|agent:[a-z_]+|talent:[\w-]+|company:[\w-]+)$/);
export type Actor = z.infer<typeof Actor>;

export const SubjectType = z.enum([
  "talent",
  "interview",
  "signal_card",
  "job",
  "company",
  "need_card",
  "digest",
  "pick",
  "intro",
  "agenda_item",
  "consent",
  "pool",
  "system",
]);
export type SubjectType = z.infer<typeof SubjectType>;

/**
 * An append-only record of something that matters to a person or to oversight:
 * an AI output that was shown or stored, a human decision, a disclosure of identity.
 * `detail` holds ids and counts only: never transcript text, names or contact details.
 */
export const AuditEvent = z.object({
  id: Id,
  at: IsoDateTime,
  actor: Actor,
  action: z.string().min(1).max(80),
  subjectType: SubjectType,
  subjectId: z.string().min(1),
  detail: z.record(z.string(), z.unknown()),
});
export type AuditEvent = z.infer<typeof AuditEvent>;

/**
 * The agreed action names. The organiser console and data export rely on them. A stream
 * that needs a new action adds it here through the lead rather than inventing a spelling.
 */
export const AUDIT_ACTIONS = [
  // interview and card (stream S1)
  "interview.started",
  "interview.turn",
  "interview.turn_redacted",
  "interview.completed",
  "cv.seeded",
  "card.synthesised",
  "card.synthesis_fallback",
  "card.protected_dropped",
  "card.signal_edited",
  "card.signal_removed",
  "card.signal_added",
  "card.looking_for_edited",
  "transcript.corrected",
  "card.approved",
  "card.draft_discarded",
  "pool.opted_in",
  "pool.opted_out",
  "data.exported",
  "talent.deleted",
  "talent.purged",
  // demand side (stream S2)
  "needcard.drafted",
  "needcard.edited",
  "needcard.confirmed",
  "needcard.stale",
  "needcard.question_answered",
  // matching, picks and introductions (stream S3)
  "eligibility.computed",
  "digest.drafted",
  "digest.published",
  "pick.drafted",
  "pick.approved",
  "pick.removed",
  "pick.added_manual",
  "pick.reason_edited",
  "pick.decision_undone",
  "pool.gap_noted",
  "pool.snoozed",
  "intro.requested",
  "intro.reviewed",
  "intro.accepted",
  "intro.declined",
  "intro.withdrawn",
  "intro.cancelled",
  "intro.expired",
  "identity.revealed",
  "agenda.assigned",
  "agenda.manual_assigned",
  "organiser.quotes_viewed",
  "settings.changed",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const ConsentKind = z.enum(["interview", "pool", "voice_vendor", "live_demo"]);
export type ConsentKind = z.infer<typeof ConsentKind>;

export const Consent = z.object({
  id: Id,
  subjectType: z.enum(["talent", "company"]),
  subjectId: Id,
  kind: ConsentKind,
  textVersion: z.string().min(1),
  grantedAt: IsoDateTime,
  withdrawnAt: IsoDateTime.nullable(),
});
export type Consent = z.infer<typeof Consent>;

/** The three model roles. Every model call names one. */
export const LlmRole = z.enum(["live", "analyst", "bulk"]);
export type LlmRole = z.infer<typeof LlmRole>;

/** One row per model call. Prompts and outputs are not stored here. */
export const LlmCall = z.object({
  id: Id,
  at: IsoDateTime,
  role: LlmRole,
  provider: z.string(),
  model: z.string(),
  purpose: z.string().max(80),
  latencyMs: z.number().int().min(0),
  firstTokenMs: z.number().int().min(0).nullable(),
  tokensIn: z.number().int().min(0).nullable(),
  tokensOut: z.number().int().min(0).nullable(),
  ok: z.boolean(),
  error: z.string().nullable(),
  /** What an output guard did to this call's output, if anything (for example `dropped_praise`). */
  guard: z.string().max(120).nullable(),
});
export type LlmCall = z.infer<typeof LlmCall>;

/** Attributes and proxies that must never be stored on a card or shown to a company. */
export const PROTECTED_ATTRIBUTES = [
  "age",
  "date of birth",
  "gender",
  "nationality",
  "ethnicity",
  "religion",
  "health or disability",
  "family or marital status",
  "pregnancy",
  "sexual orientation",
  "political opinion",
  "residence permit status",
  "native language",
  "photo",
] as const;
