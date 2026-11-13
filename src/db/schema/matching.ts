import {
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
  DigestStatus,
  Intro,
  IntroStatus,
  JobMatch,
  PickReason,
  PickSelection,
  PickStatus,
} from "@/contracts";
import { company, job, needCard } from "./jobs";
import { talent } from "./people";
import { createdAt, timestamptz } from "./shared";

/** A matchmaking event. Table name is `event`; the constant is `matchEvent` to avoid DOM `Event`. */
export const matchEvent = pgTable("event", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  date: text("date").notNull(),
  format: text("format").$type<"online" | "in_person" | "hybrid">().notNull(),
  place: text("place"),
  startsAt: timestamptz("starts_at").notNull(),
  endsAt: timestamptz("ends_at").notNull(),
  slotMinutes: integer("slot_minutes").notNull().default(15),
  bufferMinutes: integer("buffer_minutes").notNull().default(5),
  maxMeetingsPerTalent: integer("max_meetings_per_talent").notNull().default(4),
  createdAt: createdAt(),
});

/** A company taking part in an event, with its table or room number and agenda link. */
export const eventCompany = pgTable(
  "event_company",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => matchEvent.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    format: text("format").$type<"online" | "in_person">().notNull().default("in_person"),
    /** Secret in the URL of the company's static event agenda. */
    agendaToken: text("agenda_token").notNull().unique(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.companyId] })],
);

/** The parts of a `JobMatch` kept in jsonb. */
export type JobMatchBody = Pick<JobMatch, "basis" | "reasonsSource" | "reasons" | "notMentioned">;

/**
 * A posting suggested to a person in their own feed. `feedPosition` orders postings for
 * that person; it ranks postings, not people.
 */
export const jobMatch = pgTable(
  "job_match",
  {
    id: text("id").primaryKey(),
    talentId: text("talent_id")
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => job.id, { onDelete: "cascade" }),
    cardVersion: integer("card_version").notNull(),
    feedPosition: integer("feed_position").notNull().default(0),
    body: jsonb("body").$type<JobMatchBody>().notNull(),
    computedAt: timestamptz("computed_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("job_match_talent_job_uq").on(t.talentId, t.jobId)],
);

/**
 * Whether a person counts for a need at all: a yes or no and the set of requirements their
 * card speaks to. There is deliberately no count or score column.
 */
export const eligibility = pgTable(
  "eligibility",
  {
    needCardId: text("need_card_id")
      .notNull()
      .references(() => needCard.id, { onDelete: "cascade" }),
    needCardVersion: integer("need_card_version").notNull(),
    talentId: text("talent_id")
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    cardVersion: integer("card_version").notNull(),
    eligible: boolean("eligible").notNull(),
    touchedRequirementIds: jsonb("touched_requirement_ids").$type<string[]>().notNull().default([]),
    exclusion: text("exclusion"),
    computedAt: timestamptz("computed_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.needCardId, t.needCardVersion, t.talentId] }),
    index("eligibility_talent_idx").on(t.talentId),
  ],
);

export const digest = pgTable(
  "digest",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "cascade" }),
    eventId: text("event_id").references(() => matchEvent.id, { onDelete: "set null" }),
    /** Calendar day, `YYYY-MM-DD`, Helsinki time. */
    date: text("date").notNull(),
    status: text("status").$type<DigestStatus>().notNull().default("draft"),
    /** Seed for the selection tie-break and the display shuffle. */
    seed: text("seed").notNull(),
    emptyNeeds: jsonb("empty_needs").$type<string[]>().notNull().default([]),
    publishedBy: text("published_by"),
    publishedAt: timestamptz("published_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("digest_company_date_uq").on(t.companyId, t.date)],
);

/** The parts of a `Pick` kept in jsonb. */
export type PickBody = { reasons: PickReason[]; notMentioned: string[] };

/**
 * A person suggested to a company for one need. No score, no order. Each row is decided
 * individually by an organiser; removals and manual additions carry a reason.
 */
export const pick = pgTable(
  "pick",
  {
    id: text("id").primaryKey(),
    digestId: text("digest_id")
      .notNull()
      .references(() => digest.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "cascade" }),
    needCardId: text("need_card_id")
      .notNull()
      .references(() => needCard.id, { onDelete: "cascade" }),
    needCardVersion: integer("need_card_version").notNull(),
    talentId: text("talent_id")
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    cardVersion: integer("card_version").notNull(),
    origin: text("origin").$type<"agent" | "organiser" | "talent_request">().notNull().default("agent"),
    body: jsonb("body").$type<PickBody>().notNull(),
    status: text("status").$type<PickStatus>().notNull().default("suggested"),
    selection: jsonb("selection").$type<PickSelection>(),
    reasonCode: text("reason_code"),
    decidedBy: text("decided_by"),
    decidedAt: timestamptz("decided_at"),
    decisionNote: text("decision_note"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("pick_digest_need_talent_uq").on(t.digestId, t.needCardId, t.talentId),
    index("pick_talent_idx").on(t.talentId),
    index("pick_status_idx").on(t.status),
  ],
);

/** The mutual opt-in. Identity is revealed only when `status` becomes `accepted`. */
export const intro = pgTable(
  "intro",
  {
    id: text("id").primaryKey(),
    talentId: text("talent_id")
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "cascade" }),
    needCardId: text("need_card_id").references(() => needCard.id, { onDelete: "set null" }),
    pickId: text("pick_id").references(() => pick.id, { onDelete: "set null" }),
    initiatedBy: text("initiated_by").$type<"company" | "talent">().notNull(),
    status: text("status").$type<IntroStatus>().notNull(),
    requestPairs: jsonb("request_pairs").$type<Intro["requestPairs"]>().notNull().default([]),
    requestNote: text("request_note"),
    organiserDecision: jsonb("organiser_decision").$type<Intro["organiserDecision"]>(),
    requestedAt: timestamptz("requested_at").notNull().defaultNow(),
    respondedAt: timestamptz("responded_at"),
    acceptedAt: timestamptz("accepted_at"),
    revealedAt: timestamptz("revealed_at"),
    expiresAt: timestamptz("expires_at"),
  },
  (t) => [
    index("intro_talent_idx").on(t.talentId),
    index("intro_company_idx").on(t.companyId),
    index("intro_status_idx").on(t.status),
  ],
);

export const agendaItem = pgTable(
  "agenda_item",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => matchEvent.id, { onDelete: "cascade" }),
    introId: text("intro_id")
      .notNull()
      .references(() => intro.id, { onDelete: "cascade" }),
    talentId: text("talent_id")
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "cascade" }),
    /** Null while on the waitlist. */
    startsAt: timestamptz("starts_at"),
    endsAt: timestamptz("ends_at"),
    place: text("place"),
    status: text("status").$type<"scheduled" | "waitlist" | "cancelled">().notNull().default("scheduled"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("agenda_item_intro_uq").on(t.introId),
    index("agenda_item_talent_idx").on(t.talentId),
    index("agenda_item_company_idx").on(t.companyId),
  ],
);

/** In-product messages. There is no real email in the prototype. */
export const notification = pgTable(
  "notification",
  {
    id: text("id").primaryKey(),
    recipientType: text("recipient_type").$type<"talent" | "company" | "organiser">().notNull(),
    recipientId: text("recipient_id").notNull(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    readAt: timestamptz("read_at"),
  },
  (t) => [index("notification_recipient_idx").on(t.recipientType, t.recipientId)],
);

/** Notes an organiser leaves from the unmatched queue: a gap in demand, or a snooze. */
export const poolNote = pgTable(
  "pool_note",
  {
    id: text("id").primaryKey(),
    talentId: text("talent_id").references(() => talent.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"gap" | "snooze">().notNull(),
    text: text("text").notNull().default(""),
    escoUri: text("esco_uri"),
    until: timestamptz("until"),
    by: text("by").notNull(),
    at: timestamptz("at").notNull().defaultNow(),
  },
  (t) => [index("pool_note_talent_idx").on(t.talentId)],
);
