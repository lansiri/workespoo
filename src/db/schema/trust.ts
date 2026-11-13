import { bigserial, boolean, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import type { ConsentKind, LlmRole, SubjectType } from "@/contracts";
import { timestamptz } from "./shared";

export const consent = pgTable(
  "consent",
  {
    id: text("id").primaryKey(),
    subjectType: text("subject_type").$type<"talent" | "company">().notNull(),
    subjectId: text("subject_id").notNull(),
    kind: text("kind").$type<ConsentKind>().notNull(),
    textVersion: text("text_version").notNull(),
    grantedAt: timestamptz("granted_at").notNull().defaultNow(),
    withdrawnAt: timestamptz("withdrawn_at"),
  },
  (t) => [index("consent_subject_idx").on(t.subjectType, t.subjectId)],
);

/**
 * Append-only. Rows outlive the people they refer to, so `detail` must never hold
 * transcript text or contact details.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: timestamptz("at").notNull().defaultNow(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    subjectType: text("subject_type").$type<SubjectType>().notNull(),
    subjectId: text("subject_id").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("audit_log_subject_idx").on(t.subjectType, t.subjectId), index("audit_log_at_idx").on(t.at)],
);

/** One row per model call. Prompts and outputs are not stored here. */
export const llmCall = pgTable(
  "llm_call",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: timestamptz("at").notNull().defaultNow(),
    role: text("role").$type<LlmRole>().notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    purpose: text("purpose").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    firstTokenMs: integer("first_token_ms"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    ok: boolean("ok").notNull(),
    error: text("error"),
    /** What an output guard did to this call's output, if anything. */
    guard: text("guard"),
  },
  (t) => [index("llm_call_at_idx").on(t.at)],
);
