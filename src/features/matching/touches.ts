import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { Requirement } from "@/contracts";
import { rowsOf } from "@/lib/sql";
import { TOUCH_TRIGRAM_THRESHOLD } from "./constants";

/** The part of a requirement that `touches` reads. */
export type TouchRequirement = Pick<Requirement, "id" | "text" | "category" | "escoSkillUris" | "languageCode">;

export type TouchRow = { talentId: string; signalId: string | null };

export function textArray(values: string[]): SQL {
  return sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;
}

/**
 * The one SQL behind `touches`: which approved signals (or, for a language requirement, which
 * language rows) speak to a requirement. Returns one row per (person, signal).
 *
 * - skill, experience, education: the signal's ESCO URI is one of the requirement's URIs, or
 *   is an essential skill of an occupation the requirement is grounded to, or the signal
 *   phrase is trigram-similar to the requirement text at `TOUCH_TRIGRAM_THRESHOLD`.
 *   `word_similarity(phrase, text)` asks how well the short phrase fits inside the longer
 *   requirement, so "Java" touches "5 years of Java development". Years and levels are never
 *   assessed.
 * - language: the person has the language (evidenced or declared). No signal is involved.
 * - authorisation, other: trigram only.
 *
 * Only approved signals are read. Nothing else about a person (transcript, handle, interview
 * language) is read.
 */
export async function touchingSignals(
  db: Db,
  requirement: TouchRequirement,
  opts: { talentIds?: string[] } = {},
): Promise<TouchRow[]> {
  if (opts.talentIds && opts.talentIds.length === 0) return [];

  if (requirement.category === "language") {
    if (!requirement.languageCode) return [];
    const filter = opts.talentIds ? sql`AND talent_id = ANY(${textArray(opts.talentIds)})` : sql``;
    const result = await db.execute(sql`
      SELECT DISTINCT talent_id FROM talent_language WHERE code = ${requirement.languageCode} ${filter}
    `);
    return rowsOf<{ talent_id: string }>(result).map((r) => ({ talentId: r.talent_id, signalId: null }));
  }

  const talentFilter = opts.talentIds ? sql`AND s.talent_id = ANY(${textArray(opts.talentIds)})` : sql``;
  const phraseHit = sql`word_similarity(lower(s.phrase), lower(${requirement.text})) >= ${TOUCH_TRIGRAM_THRESHOLD}`;
  const usesUris =
    (requirement.category === "skill" ||
      requirement.category === "experience" ||
      requirement.category === "education") &&
    requirement.escoSkillUris.length > 0;
  const uris = textArray(requirement.escoSkillUris);
  const condition = usesUris
    ? sql`(
        s.esco_uri = ANY(${uris})
        OR EXISTS (
          SELECT 1 FROM esco_occupation_skill eos
          WHERE eos.occupation_uri = ANY(${uris})
            AND eos.skill_uri = s.esco_uri
            AND eos.relation = 'essential'
        )
        OR ${phraseHit}
      )`
    : phraseHit;

  const result = await db.execute(sql`
    SELECT DISTINCT s.talent_id, s.id AS signal_id
    FROM signal s
    WHERE s.status = 'approved' ${talentFilter} AND ${condition}
    ORDER BY s.talent_id, s.id
  `);
  return rowsOf<{ talent_id: string; signal_id: string }>(result).map((r) => ({
    talentId: r.talent_id,
    signalId: r.signal_id,
  }));
}

/** `touches(person, requirement)` of docs/specs/matching.md 3.1. */
export async function touches(db: Db, talentId: string, requirement: TouchRequirement): Promise<boolean> {
  return (await touchingSignals(db, requirement, { talentIds: [talentId] })).length > 0;
}

/** The ids of the requirements one person touches, in the order given. A set, never a count. */
export async function touchedRequirementIds(
  db: Db,
  talentId: string,
  requirements: TouchRequirement[],
): Promise<string[]> {
  const out: string[] = [];
  for (const r of requirements) if (await touches(db, talentId, r)) out.push(r.id);
  return out;
}
