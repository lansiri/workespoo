import { boolean, index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { createdAt, timestamptz } from "./shared";

/** ESCO skills and occupations with Finnish, Swedish and English preferred labels. */
export const escoConcept = pgTable(
  "esco_concept",
  {
    uri: text("uri").primaryKey(),
    type: text("type").$type<"skill" | "occupation">().notNull(),
    labelEn: text("label_en").notNull(),
    labelFi: text("label_fi"),
    labelSv: text("label_sv"),
    isco: text("isco"),
    retired: boolean("retired").notNull().default(false),
  },
  (t) => [
    index("esco_concept_type_idx").on(t.type),
    index("esco_concept_label_en_trgm").using("gin", t.labelEn.op("gin_trgm_ops")),
    index("esco_concept_label_fi_trgm").using("gin", t.labelFi.op("gin_trgm_ops")),
  ],
);

/** Which skills an occupation needs, from the live ESCO API. Filled lazily per occupation. */
export const escoOccupationSkill = pgTable(
  "esco_occupation_skill",
  {
    occupationUri: text("occupation_uri").notNull(),
    skillUri: text("skill_uri").notNull(),
    relation: text("relation").$type<"essential" | "optional">().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.occupationUri, t.skillUri] }),
    index("esco_occupation_skill_skill_idx").on(t.skillUri),
  ],
);

/** Bookkeeping for the occupation-to-skill crawl, so an occupation is fetched once. */
export const escoOccupationFetch = pgTable("esco_occupation_fetch", {
  occupationUri: text("occupation_uri").primaryKey(),
  ok: boolean("ok").notNull(),
  skillCount: integer("skill_count").notNull().default(0),
  fetchedAt: timestamptz("fetched_at").notNull().defaultNow(),
});

/** Cache of free-text phrase to ESCO skill decisions. A null `uri` means "no good match". */
export const escoPhraseCache = pgTable("esco_phrase_cache", {
  phrase: text("phrase").primaryKey(),
  uri: text("uri"),
  decidedBy: text("decided_by").$type<"exact" | "model" | "none">().notNull(),
  createdAt: createdAt(),
});
