import { index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import type {
  ApplicationAssessment,
  ApplicationPlan,
  ApplicationState,
  ApplicationStatus,
  ApplicationTurnKind,
  InputMode,
  PinnedPosition,
  PublishedRanking,
  TurnRole,
} from "@/contracts";
import { company, job } from "./jobs";
import { talent } from "./people";
import { createdAt, timestamptz } from "./shared";

/**
 * A person's job interview for one job of the event (docs/specs/job-interview.md). One row per
 * person and job. It goes with the person (delete my data, the 24-hour purge of live sessions)
 * and with the company (a demo reset).
 */
export const application = pgTable(
  "application",
  {
    id: text("id").primaryKey(),
    talentId: text("talent_id")
      .notNull()
      .references(() => talent.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => job.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "cascade" }),
    status: text("status").$type<ApplicationStatus>().notNull().default("interviewing"),
    /** Which requirements are covered and the question for each. Made once, at the start. */
    plan: jsonb("plan").$type<ApplicationPlan>().notNull(),
    state: jsonb("state").$type<ApplicationState>().notNull(),
    /** Null until the assessment has come back. */
    assessment: jsonb("assessment").$type<ApplicationAssessment>(),
    createdAt: createdAt(),
    submittedAt: timestamptz("submitted_at"),
    assessedAt: timestamptz("assessed_at"),
  },
  (t) => [
    uniqueIndex("application_talent_job_uq").on(t.talentId, t.jobId),
    index("application_job_idx").on(t.jobId),
  ],
);

/** One turn of a job interview. Evidence of an application points at these by index and sentence. */
export const applicationTurn = pgTable(
  "application_turn",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
    /** 0-based over all turns of the application: 0 is the opening. */
    index: integer("index").notNull(),
    role: text("role").$type<TurnRole>().notNull(),
    kind: text("kind").$type<ApplicationTurnKind>().notNull(),
    /** `Requirement.id` the turn asks about or answers. */
    requirementId: text("requirement_id"),
    text: text("text").notNull(),
    /** `text` split into sentences once, at storage time. Evidence refers to these, 1-based. */
    sentences: jsonb("sentences").$type<string[]>().notNull().default([]),
    /** Whether the person spoke or typed. Never shown to an organiser or a company. */
    inputMode: text("input_mode").$type<InputMode>(),
    /** The browser's id for an answer, so a retry is stored once. */
    clientTurnId: text("client_turn_id"),
    /** Set when the person removed the answer; its text and sentences are blanked then. */
    removedAt: timestamptz("removed_at"),
    at: timestamptz("at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("application_turn_index_uq").on(t.applicationId, t.index),
    uniqueIndex("application_turn_client_uq").on(t.applicationId, t.clientTurnId),
  ],
);

/**
 * What an organiser has decided about the order of one job's applicants: the positions they
 * set by hand, and the list as they last approved it. The order itself is computed from the
 * assessments each time; nothing here is a rating.
 */
export const applicantRanking = pgTable("applicant_ranking", {
  jobId: text("job_id")
    .primaryKey()
    .references(() => job.id, { onDelete: "cascade" }),
  companyId: text("company_id")
    .notNull()
    .references(() => company.id, { onDelete: "cascade" }),
  pins: jsonb("pins").$type<PinnedPosition[]>().notNull().default([]),
  /** The list as approved, exactly as the company sees it. Null until the first approval. */
  published: jsonb("published").$type<PublishedRanking>(),
  publishedAt: timestamptz("published_at"),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});
