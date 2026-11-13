import { inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { escoConcept } from "@/db/schema";
import type { EscoRef } from "@/contracts";

export type EscoCandidate = { uri: string; labelEn: string; labelFi: string | null; similarity: number };

/**
 * Minimum score for `escoTopMatch`. Tuned on the full ESCO list (14 Nov): at 0.45 trigrams gave
 * confident nonsense ("Excel" to "demand excellence from performers", "React" to "react to
 * mining emergencies", "data pipelines" to "clear pipelines"); at 0.75 every accepted match in
 * a 46-phrase probe was right. Looser but correct matches ("order picking" to "pick orders for
 * dispatching") need a model to choose among `escoCandidates`, not a lower threshold.
 */
export const ESCO_TOP_MATCH_MIN_SIMILARITY = 0.75;
/** Candidates scoring below this are noise and never returned. */
const CANDIDATE_FLOOR = 0.15;

/** Raw `db.execute` returns an array with postgres.js and `{ rows }` with PGlite. */
function unwrapRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return (result as { rows: T[] }).rows;
}

/**
 * Trigram candidates over English and Finnish labels of non-retired concepts, best first.
 *
 * The score of a label is the mean of `similarity` (whole-string overlap, with a qualifier in
 * brackets at the end of the label left out) and `word_similarity` (the phrase against the
 * best-matching part of the label), so that "python" scores 1 against "Python (computer
 * programming)" while a vague phrase still ranks short, close labels above long ones. The
 * better of the English and Finnish scores is used.
 */
export async function escoCandidates(
  db: Db,
  phrase: string,
  opts: { type?: "skill" | "occupation"; limit?: number } = {},
): Promise<EscoCandidate[]> {
  const p = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  if (p.length < 2) return [];
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 100);
  const typeFilter = opts.type ? sql`AND type = ${opts.type}` : sql``;
  const result = await db.execute(sql`
    SELECT uri, label_en, label_fi, score FROM (
      SELECT uri, label_en, label_fi,
        GREATEST(
          (similarity(regexp_replace(lower(label_en), '\\s*\\([^)]*\\)\\s*$', ''), ${p}) + word_similarity(${p}, lower(label_en))) / 2,
          CASE WHEN label_fi IS NULL THEN 0
               ELSE (similarity(regexp_replace(lower(label_fi), '\\s*\\([^)]*\\)\\s*$', ''), ${p}) + word_similarity(${p}, lower(label_fi))) / 2 END
        ) AS score
      FROM esco_concept
      WHERE NOT retired ${typeFilter}
    ) scored
    WHERE score >= ${CANDIDATE_FLOOR}
    ORDER BY score DESC, length(label_en), uri
    LIMIT ${limit}
  `);
  return unwrapRows<{ uri: string; label_en: string; label_fi: string | null; score: number | string }>(
    result,
  ).map((r) => ({
    uri: r.uri,
    labelEn: r.label_en,
    labelFi: r.label_fi,
    similarity: Number(r.score),
  }));
}

/** The best skill match at or above `minSimilarity` (default 0.75), or null. */
export async function escoTopMatch(
  db: Db,
  phrase: string,
  minSimilarity: number = ESCO_TOP_MATCH_MIN_SIMILARITY,
): Promise<EscoRef | null> {
  const [best] = await escoCandidates(db, phrase, { type: "skill", limit: 1 });
  if (!best || best.similarity < minSimilarity) return null;
  return { uri: best.uri, labelEn: best.labelEn, labelFi: best.labelFi };
}

/** Concepts for these URIs (retired ones included, so old cards still resolve). */
export async function escoByUris(db: Db, uris: string[]): Promise<Map<string, EscoRef>> {
  const out = new Map<string, EscoRef>();
  const unique = [...new Set(uris)];
  for (let i = 0; i < unique.length; i += 1000) {
    const rows = await db
      .select({ uri: escoConcept.uri, labelEn: escoConcept.labelEn, labelFi: escoConcept.labelFi })
      .from(escoConcept)
      .where(inArray(escoConcept.uri, unique.slice(i, i + 1000)));
    for (const r of rows) out.set(r.uri, r);
  }
  return out;
}
