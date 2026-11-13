import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  CoverageArea,
  EvidenceRef,
  InputMode,
  InterviewMode,
  InterviewState,
  InterviewStatus,
  SignalCard,
  SignalCardStatus,
  SignalKind,
  SignalStatus,
  TurnKind,
  TurnRole,
} from "@/contracts";
import { createdAt, timestamptz } from "./shared";

/**
 * A person in the pool, known by a pseudonymous handle. Anything identifying lives in
 * `talent_identity`. Deleting a talent cascades to everything derived from them.
 */
export const talent = pgTable("talent", {
  id: text("id").primaryKey(),
  handle: text("handle").notNull().unique(),
  synthetic: boolean("synthetic").notNull().default(false),
  /** A real person trying the product live. Purged at `purgeAfter`. */
  liveDemo: boolean("live_demo").notNull().default(false),
  /** Opted in to being suggested to companies. */
  inPool: boolean("in_pool").notNull().default(false),
  purgeAfter: timestamptz("purge_after"),
  /** Links counterfactual twins: same substance, different name and interview language. */
  personaKey: text("persona_key"),
  /** Secret in the URL of the person's static event agenda. */
  agendaToken: text("agenda_token").unique(),
  createdAt: createdAt(),
});

/** Collected when the person accepts an introduction; revealed to that company only. */
export const talentIdentity = pgTable("talent_identity", {
  talentId: text("talent_id")
    .primaryKey()
    .references(() => talent.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  contact: text("contact"),
  createdAt: createdAt(),
});

export const interview = pgTable(
  "interview",
  {
    id: text("id").primaryKey(),
    talentId: text("talent_id")
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    mode: text("mode").$type<InterviewMode>().notNull(),
    /** Detected conversation language (`en`, `fi`, `unknown`, ...). Never shown to companies. */
    lang: text("lang").notNull().default("unknown"),
    status: text("status").$type<InterviewStatus>().notNull().default("active"),
    state: jsonb("state").$type<InterviewState>().notNull(),
    startedAt: timestamptz("started_at").notNull().defaultNow(),
    completedAt: timestamptz("completed_at"),
  },
  (t) => [index("interview_talent_idx").on(t.talentId)],
);

export const turn = pgTable(
  "turn",
  {
    id: text("id").primaryKey(),
    interviewId: text("interview_id")
      .notNull()
      .references(() => interview.id, { onDelete: "cascade" }),
    /** 0-based over all turns: 0 is the opening, 1 the first answer. */
    index: integer("index").notNull(),
    role: text("role").$type<TurnRole>().notNull(),
    kind: text("kind").$type<TurnKind>().notNull(),
    target: text("target").$type<CoverageArea>(),
    text: text("text").notNull(),
    /** `text` split into sentences once, at storage time. Evidence refers to these, 1-based. */
    sentences: jsonb("sentences").$type<string[]>().notNull().default([]),
    /** The sentences as first stored, set when the person corrects the transcript. */
    sentencesOriginal: jsonb("sentences_original").$type<string[]>(),
    lang: text("lang"),
    inputMode: text("input_mode").$type<InputMode>(),
    redactedAt: timestamptz("redacted_at"),
    at: timestamptz("at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("turn_interview_index_uq").on(t.interviewId, t.index)],
);

/**
 * Signals as rows, so the live interview, the "jobs light up" join, pool counts and
 * eligibility can use them in SQL. Rows with `status = 'approved'` mirror the approved
 * card and are rebuilt when a card is approved (the specs call this `talent_signal_index`).
 * `id` is the short per-person id (`s1`, `s2`, ...).
 */
export const signal = pgTable(
  "signal",
  {
    talentId: text("talent_id")
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    interviewId: text("interview_id").references(() => interview.id, { onDelete: "set null" }),
    phrase: text("phrase").notNull(),
    phraseOwn: text("phrase_own"),
    kind: text("kind").$type<SignalKind>().notNull(),
    escoUri: text("esco_uri"),
    escoLabelEn: text("esco_label_en"),
    escoLabelFi: text("esco_label_fi"),
    evidence: jsonb("evidence").$type<EvidenceRef[]>().notNull().default([]),
    hasExample: boolean("has_example").notNull().default(false),
    status: text("status").$type<SignalStatus>().notNull().default("proposed"),
    addedBy: text("added_by").$type<"agent" | "person">().notNull().default("agent"),
    createdAt: createdAt(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.talentId, t.id] }),
    index("signal_esco_idx").on(t.escoUri),
    index("signal_status_idx").on(t.status),
    index("signal_phrase_trgm").using("gin", t.phrase.op("gin_trgm_ops")),
  ],
);

/**
 * Languages a person can work in, rebuilt when a card is approved. `evidenced` comes from
 * a language signal on the card, `declared` from `lookingFor.workLanguages`. The interview
 * language is never used.
 */
export const talentLanguage = pgTable(
  "talent_language",
  {
    talentId: text("talent_id")
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    basis: text("basis").$type<"evidenced" | "declared">().notNull(),
  },
  (t) => [primaryKey({ columns: [t.talentId, t.code, t.basis] })],
);

/** At most one `approved` and one `draft` card per person. `body` is the validated `SignalCard`. */
export const signalCard = pgTable(
  "signal_card",
  {
    talentId: text("talent_id")
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    status: text("status").$type<SignalCardStatus>().notNull(),
    version: integer("version").notNull().default(1),
    body: jsonb("body").$type<SignalCard>().notNull(),
    approvedAt: timestamptz("approved_at"),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.talentId, t.status] })],
);

/**
 * Log of events streamed to the browser during an interview, so a reconnecting client
 * can replay what it missed. `payload` is an `InterviewEvent`.
 */
export const interviewEvent = pgTable(
  "interview_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    interviewId: text("interview_id")
      .notNull()
      .references(() => interview.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    at: timestamptz("at").notNull().defaultNow(),
  },
  (t) => [index("interview_event_interview_idx").on(t.interviewId, t.id)],
);
