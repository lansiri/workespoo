import { sql, type SQL } from "drizzle-orm";
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
import type { EmployerSector, JobSource, Lang, NeedCard, NeedCardStatus } from "@/contracts";
import { createdAt, timestamptz, tsvector } from "./shared";

/**
 * Public job postings, normalised. Recruiter contact data is dropped before a row is
 * written, including from `raw`.
 */
export const job = pgTable(
  "job",
  {
    id: text("id").primaryKey(),
    source: text("source").$type<JobSource>().notNull(),
    sourceId: text("source_id").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    employerName: text("employer_name").notNull().default(""),
    employerBusinessId: text("employer_business_id"),
    sector: text("sector").$type<EmployerSector>().notNull().default("unknown"),
    municipality: text("municipality"),
    municipalityCode: text("municipality_code"),
    region: text("region"),
    lang: text("lang").$type<Lang>().notNull().default("other"),
    workLanguages: text("work_languages")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    description: text("description").notNull().default(""),
    /** `description` split into sentences after redaction. Referenced by 0-based index. */
    sentences: jsonb("sentences").$type<string[]>().notNull().default([]),
    postedAt: timestamptz("posted_at"),
    expiresAt: timestamptz("expires_at"),
    /** ESCO URIs exactly as the posting carried them. `job_skill` is the queryable index. */
    escoOccupationUris: text("esco_occupation_uris")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    escoSkillUris: text("esco_skill_uris")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    active: boolean("active").notNull().default(true),
    raw: jsonb("raw"),
    firstSeenAt: timestamptz("first_seen_at").notNull().defaultNow(),
    lastSeenAt: timestamptz("last_seen_at").notNull().defaultNow(),
    /** Full-text vector over title and description. `simple` config: postings mix Finnish and English. */
    search: tsvector("search").generatedAlwaysAs(
      (): SQL =>
        sql`to_tsvector('simple', coalesce(${job.title}, '') || ' ' || coalesce(${job.description}, ''))`,
    ),
  },
  (t) => [
    uniqueIndex("job_source_uq").on(t.source, t.sourceId),
    index("job_active_idx").on(t.active),
    index("job_municipality_idx").on(t.municipalityCode),
    index("job_occupation_gin").using("gin", t.escoOccupationUris),
    index("job_skill_gin").using("gin", t.escoSkillUris),
    index("job_search_gin").using("gin", t.search),
    index("job_title_trgm").using("gin", t.title.op("gin_trgm_ops")),
  ],
);

/**
 * Skills linked to a posting, as rows for joins. `posting`: the posting carried the ESCO
 * skill itself. `needcard`: a drafted requirement was grounded to it.
 */
export const jobSkill = pgTable(
  "job_skill",
  {
    jobId: text("job_id")
      .notNull()
      .references(() => job.id, { onDelete: "cascade" }),
    skillUri: text("skill_uri").notNull(),
    origin: text("origin").$type<"posting" | "needcard">().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.jobId, t.skillUri, t.origin] }),
    index("job_skill_skill_idx").on(t.skillUri),
  ],
);

/**
 * An organisation on the demand side. `realName` comes from the posting and is never
 * shown on company-side screens while `masked` is true.
 */
export const company = pgTable("company", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  realName: text("real_name"),
  businessId: text("business_id"),
  source: text("source").$type<"posting" | "synthetic">().notNull(),
  masked: boolean("masked").notNull().default(true),
  participating: boolean("participating").notNull().default(false),
  /** Secret in the signed link a company opens its digest with. */
  digestToken: text("digest_token").notNull().unique(),
  createdAt: createdAt(),
});

/**
 * One Need Card per posting. `companyId` is null when the card was drafted only to explain
 * a posting in a person's own job feed. A posting that has a card with a masked company is
 * a demo-company posting and is left out of the public feed.
 */
export const needCard = pgTable(
  "need_card",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => job.id, { onDelete: "cascade" }),
    companyId: text("company_id").references(() => company.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    body: jsonb("body").$type<NeedCard>().notNull(),
    status: text("status").$type<NeedCardStatus>().notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    confirmedAt: timestamptz("confirmed_at"),
  },
  (t) => [uniqueIndex("need_card_job_uq").on(t.jobId), index("need_card_company_idx").on(t.companyId)],
);
