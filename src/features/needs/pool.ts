import { eq, sql, type SQL } from "drizzle-orm";
import type { NeedCard, PoolEvidence, Requirement } from "@/contracts";
import type { Db } from "@/db/client";
import { job } from "@/db/schema";
import { rowsOf } from "@/lib/sql";
import { TOUCH_MIN_WORD_SIMILARITY } from "./constants";
import { isWorkPermitText } from "./rules";
import { getNeedCard, saveNeedCard } from "./store";

/**
 * Pool evidence (docs/specs/need-card.md section 5). Two anonymous counts per requirement,
 * pure SQL, no model. Nothing here reads interview language, input mode, names or anything
 * outside the approved card, so twins with the same card rows always get the same numbers.
 */

function textArray(values: string[]): SQL {
  return sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;
}

/** `P`: in the pool, with a current approved card, not past `purge_after`. Column `id`. */
function poolSet(now: Date): SQL {
  return sql`
    SELECT t.id FROM talent t
    WHERE t.in_pool
      AND EXISTS (SELECT 1 FROM signal_card sc WHERE sc.talent_id = t.id AND sc.status = 'approved')
      AND (t.purge_after IS NULL OR t.purge_after > ${now.toISOString()}::timestamptz)`;
}

/** `R(N)`: the people matching found eligible for this need and version, still in the pool. Column `id`. */
function relevantSet(needCardId: string, version: number, now: Date): SQL {
  return sql`
    SELECT e.talent_id AS id FROM eligibility e
    WHERE e.need_card_id = ${needCardId} AND e.need_card_version = ${version} AND e.eligible
      AND e.talent_id IN (${poolSet(now)})`;
}

async function countOf(db: Db, set: SQL): Promise<number> {
  const [row] = rowsOf<{ n: number | string }>(await db.execute(sql`SELECT count(*)::int AS n FROM (${set}) s`));
  return Number(row?.n ?? 0);
}

/**
 * `touches(p, r)` over a set of people (matching.md 3.1), counted. Languages use
 * `talent_language` (evidenced or declared); everything else uses approved signals, by ESCO
 * URI when the requirement has some, and by phrase similarity. Years, degree level and
 * language level are never assessed.
 */
export async function countTouching(
  db: Db,
  r: Pick<Requirement, "category" | "text" | "escoSkillUris" | "languageCode">,
  set: SQL,
): Promise<{ speakTo: number; selfDeclaredOnly: number }> {
  if (r.category === "language") {
    if (!r.languageCode) return { speakTo: 0, selfDeclaredOnly: 0 };
    const [row] = rowsOf<{ speak_to: number | string; declared_only: number | string }>(
      await db.execute(sql`
        SELECT count(*) FILTER (WHERE b IS NOT NULL)::int AS speak_to,
               count(*) FILTER (WHERE b = 1)::int AS declared_only
        FROM (
          SELECT (SELECT max(CASE l.basis WHEN 'evidenced' THEN 2 ELSE 1 END)
                    FROM talent_language l WHERE l.talent_id = s.id AND l.code = ${r.languageCode}) AS b
          FROM (${set}) s
        ) x`),
    );
    return { speakTo: Number(row?.speak_to ?? 0), selfDeclaredOnly: Number(row?.declared_only ?? 0) };
  }
  const byUri = r.escoSkillUris.length > 0 ? sql`g.esco_uri = ANY(${textArray(r.escoSkillUris)}) OR ` : sql``;
  const [row] = rowsOf<{ speak_to: number | string }>(
    await db.execute(sql`
      SELECT count(*) FILTER (WHERE touched)::int AS speak_to
      FROM (
        SELECT EXISTS (
          SELECT 1 FROM signal g
          WHERE g.talent_id = s.id AND g.status = 'approved'
            AND (${byUri} word_similarity(lower(${r.text}::text), lower(g.phrase)) >= ${TOUCH_MIN_WORD_SIMILARITY})
        ) AS touched
        FROM (${set}) s
      ) x`),
  );
  return { speakTo: Number(row?.speak_to ?? 0), selfDeclaredOnly: 0 };
}

/**
 * The evidence for every requirement of a card, without storing it. A work-permit
 * requirement is never counted: nobody's card covers it, and asking touches
 * nationality. When nobody is eligible yet, counts are over the whole pool and
 * `hardFilterWouldExclude` is null.
 */
export async function computePoolEvidence(
  db: Db,
  card: Pick<NeedCard, "id" | "version" | "requirements">,
  now: Date,
  postingSentences: string[] = [],
): Promise<Map<string, PoolEvidence | null>> {
  const relevantCount = await countOf(db, relevantSet(card.id, card.version, now));
  const wholePool = relevantCount === 0;
  const poolCount = wholePool ? await countOf(db, poolSet(now)) : 0;
  const set = wholePool ? poolSet(now) : relevantSet(card.id, card.version, now);
  const computedAt = now.toISOString();

  const out = new Map<string, PoolEvidence | null>();
  for (const r of card.requirements) {
    const cited = r.postingSentence === null ? "" : (postingSentences[r.postingSentence] ?? "");
    if (r.statutory === "other_law" && isWorkPermitText(`${r.text}\n${cited}`)) {
      out.set(r.id, null);
      continue;
    }
    const { speakTo, selfDeclaredOnly } = await countTouching(db, r, set);
    const relevant = wholePool ? poolCount : relevantCount;
    out.set(r.id, {
      scope: wholePool ? "whole_pool" : "relevant",
      relevant,
      speakTo,
      // Never shown next to a legal duty, and meaningless without a relevant set.
      hardFilterWouldExclude: wholePool || r.statutory !== "none" ? null : relevant - speakTo,
      selfDeclaredOnly: r.category === "language" ? selfDeclaredOnly : null,
      computedAt,
    });
  }
  return out;
}

/**
 * Recomputes `pool` on every requirement from the `eligibility`, `signal` and
 * `talent_language` tables and stores it with `computedAt`. Not an edit: the version does
 * not change. `opts.now` is the clock, for tests.
 */
export async function recomputePoolEvidence(
  db: Db,
  needCardId: string,
  opts: { now?: Date } = {},
): Promise<void> {
  const now = opts.now ?? new Date();
  const card = await getNeedCard(db, needCardId);
  if (!card) return;
  const [jobRow] = await db.select({ sentences: job.sentences }).from(job).where(eq(job.id, card.jobId));
  const evidence = await computePoolEvidence(db, card, now, jobRow?.sentences ?? []);

  // Re-read before writing: a company edit may have landed while the counts were computed.
  const latest = await getNeedCard(db, needCardId);
  if (!latest) return;
  const requirements = latest.requirements.map((r) =>
    evidence.has(r.id) ? { ...r, pool: evidence.get(r.id) ?? null } : r,
  );
  await saveNeedCard(db, { ...latest, requirements }, now);
}
