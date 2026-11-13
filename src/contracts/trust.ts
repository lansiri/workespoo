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
  "system",
]);
export type SubjectType = z.infer<typeof SubjectType>;

/**
 * An append-only record of something that matters to a person or to oversight:
 * an AI output that was shown or stored, a human decision, a disclosure of identity.
 * `detail` must not contain raw transcript text or contact details.
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
