import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { MatchBasis, SignalKind } from "@/contracts";
import { phraseQuery } from "@/lib/jobs-lit";
import { rowsOf } from "@/lib/sql";
import {
  ESPOO_CODE,
  FEED_CANDIDATES,
  FEED_FRESH_DAYS,
  FEED_MUNICIPALITY_CODES,
  FEED_REGION_CODE,
  GATE_SIGNALS_ALONE,
  GENERIC_MIN_POSTINGS,
  GENERIC_SHARE,
  ROLE_TITLE_HIT_SIMILARITY,
} from "./constants";
import { textArray } from "./touches";

/** One approved signal of the person, as retrieval needs it. */
export type RetrievalSignal = { phrase: string; kind: SignalKind; escoUri: string | null };

/** How a signal links to a posting, strongest first: direct skill, essential occupation skill, text mention, optional occupation skill. */
export type LinkType = "direct" | "essential" | "mention" | "optional";

export type Candidate = {
  jobId: string;
  basis: MatchBasis[];
  /** The strongest link of each signal that relates to the posting. `signal` indexes the list passed in. Not stored. */
  links: Array<{ signal: number; link: LinkType }>;
};

const STRENGTH: Record<LinkType, number> = { direct: 4, essential: 3, mention: 2, optional: 1 };
/** Strength from which one non-tool signal brings a posting in on its own (direct, essential or mention). */
const STRONG_FROM = STRENGTH.mention;

/** A label without a bracketed qualifier: "Python (computer programming)" is said "Python" in a posting. */
const bare = (label: string) => label.replace(/\s*\([^)]*\)/g, "").trim();

/**
 * Retrieval for one person's signals. A posting is linked to a signal when it lists the skill,
 * when an occupation it is classed under needs the skill, or when its text holds the person's
 * phrase or the skill's ESCO label (English or Finnish) as adjacent words. Per posting and
 * signal only the strongest link counts.
 *
 * Gate: two different signals linked, or one signal that is not a tool linked directly,
 * essentially or by a mention, or a declared role close to the title. A signal whose strong
 * links reach a large share of all postings ("customer service") does not count as "one signal
 * on its own", and one tool (SAP, Excel) never does.
 *
 * Order: more non-tool signals with a strong link, then more different signals (all tools
 * count once together: SAP and Excel are the same kind of evidence), then stronger links, then
 * Espoo, then newer. It orders postings for this one person and is never stored as a number.
 */
export async function retrieveForSignals(
  db: Db,
  signals: RetrievalSignal[],
  roles: string[],
  now: Date,
): Promise<Candidate[]> {
  const cleanRoles = roles.map((r) => r.trim()).filter((r) => r.length > 0);
  if (signals.length === 0 && cleanRoles.length === 0) return [];

  const uris = [...new Set(signals.map((s) => s.escoUri).filter((u): u is string => !!u))];
  const labelRows =
    uris.length === 0
      ? []
      : rowsOf<{ uri: string; label_en: string; label_fi: string | null }>(
          await db.execute(sql`SELECT uri, label_en, label_fi FROM esco_concept WHERE uri = ANY(${textArray(uris)})`),
        );
  const labelsOf = new Map(labelRows.map((l) => [l.uri, [l.label_en, l.label_fi ?? ""]]));

  const queryIdx: string[] = [];
  const queries: string[] = [];
  signals.forEach((s, i) => {
    const texts = [s.phrase, ...(s.escoUri ? (labelsOf.get(s.escoUri) ?? []) : [])];
    const seen = new Set<string>();
    for (const text of texts.flatMap((t) => [t, bare(t)])) {
      const q = phraseQuery(text);
      if (q === null || seen.has(q)) continue;
      seen.add(q);
      queryIdx.push(String(i));
      queries.push(q);
    }
  });

  const nowIso = now.toISOString();
  const roleHit =
    cleanRoles.length > 0
      ? sql`EXISTS (SELECT 1 FROM unnest(${textArray(cleanRoles)}) r WHERE word_similarity(lower(r), lower(j.title)) >= ${ROLE_TITLE_HIT_SIMILARITY})`
      : sql`false`;

  const result = await db.execute(sql`
    WITH sig AS (
      SELECT idx::int AS idx, kind, nullif(uri, '') AS uri
      FROM unnest(${textArray(signals.map((_, i) => String(i)))}, ${textArray(signals.map((s) => s.kind))}, ${textArray(signals.map((s) => s.escoUri ?? ""))}) AS t(idx, kind, uri)
    ),
    q AS (
      SELECT idx::int AS idx, query FROM unnest(${textArray(queryIdx)}, ${textArray(queries)}) AS t(idx, query)
    ),
    ej AS (
      SELECT j.* FROM job j
      WHERE j.active
        AND (j.expires_at IS NULL OR j.expires_at > ${nowIso}::timestamptz)
        AND coalesce(j.posted_at, j.first_seen_at) > ${nowIso}::timestamptz - make_interval(days => ${FEED_FRESH_DAYS}::int)
        AND (j.municipality_code = ANY(${textArray([...FEED_MUNICIPALITY_CODES])}) OR j.region = ${FEED_REGION_CODE})
        AND NOT EXISTS (
          SELECT 1 FROM need_card nc JOIN company c ON c.id = nc.company_id
          WHERE nc.job_id = j.id AND c.masked
        )
    ),
    links AS (
      SELECT js.job_id, s.idx, 'direct' AS link, ${STRENGTH.direct}::int AS strength
      FROM job_skill js JOIN sig s ON s.uri = js.skill_uri
      WHERE js.job_id IN (SELECT id FROM ej)
      UNION ALL
      SELECT j.id, s.idx,
             CASE os.relation WHEN 'essential' THEN 'essential' ELSE 'optional' END,
             CASE os.relation WHEN 'essential' THEN ${STRENGTH.essential}::int ELSE ${STRENGTH.optional}::int END
      FROM ej j
      JOIN esco_occupation_skill os ON os.occupation_uri = ANY(j.esco_occupation_uris)
      JOIN sig s ON s.uri = os.skill_uri
      UNION ALL
      SELECT j.id, q.idx, 'mention', ${STRENGTH.mention}::int
      FROM ej j JOIN q ON j.search @@ to_tsquery('simple', q.query)
    ),
    best AS (
      SELECT job_id, idx, max(strength) AS strength, (array_agg(link ORDER BY strength DESC))[1] AS link
      FROM links GROUP BY job_id, idx
    ),
    pool AS (SELECT count(*) AS n FROM ej),
    spread AS (
      SELECT idx, count(*) AS n FROM best WHERE strength >= ${STRONG_FROM}::int GROUP BY idx
    ),
    agg AS (
      SELECT b.job_id,
             count(*) AS n,
             count(*) FILTER (WHERE s.kind <> 'tool') + (count(*) FILTER (WHERE s.kind = 'tool') > 0)::int AS n_eff,
             coalesce(sum(b.strength) FILTER (WHERE s.kind <> 'tool'), 0) + coalesce(max(b.strength) FILTER (WHERE s.kind = 'tool'), 0) AS strength_eff,
             count(*) FILTER (WHERE b.strength >= ${STRONG_FROM}::int AND s.kind <> 'tool'
                     AND coalesce(sp.n, 0) <= greatest(${GENERIC_MIN_POSTINGS}::int, ${GENERIC_SHARE}::float8 * (SELECT n FROM pool))) AS n_alone,
             json_agg(json_build_object('signal', b.idx, 'link', b.link) ORDER BY b.idx) AS links
      FROM best b JOIN sig s ON s.idx = b.idx LEFT JOIN spread sp ON sp.idx = b.idx
      GROUP BY b.job_id
    ),
    basis AS (
      SELECT job_id, bool_or(link = 'direct') AS direct, bool_or(link IN ('essential', 'optional')) AS occupation,
             bool_or(link = 'mention') AS text
      FROM links GROUP BY job_id
    ),
    scored AS (
      SELECT j.id, j.municipality_code, j.posted_at, j.first_seen_at,
             coalesce(a.n, 0) AS n, coalesce(a.n_eff, 0) AS n_eff, coalesce(a.strength_eff, 0) AS strength_eff,
             coalesce(a.n_alone, 0) AS n_alone,
             a.links, coalesce(b.direct, false) AS b_direct, coalesce(b.occupation, false) AS b_occ, coalesce(b.text, false) AS b_text,
             ${roleHit} AS role_hit
      FROM ej j LEFT JOIN agg a ON a.job_id = j.id LEFT JOIN basis b ON b.job_id = j.id
    )
    SELECT id, links, b_direct, b_occ, b_text, role_hit
    FROM scored
    WHERE n >= ${GATE_SIGNALS_ALONE}::int OR n_alone >= 1 OR role_hit
    ORDER BY n_alone + (role_hit)::int DESC,
             n_eff + (role_hit)::int DESC,
             strength_eff + (CASE WHEN role_hit THEN ${STRENGTH.essential}::int ELSE 0 END) DESC,
             (municipality_code = ${ESPOO_CODE}) DESC, coalesce(posted_at, first_seen_at) DESC NULLS LAST, id
    LIMIT ${FEED_CANDIDATES}
  `);
  return rowsOf<{
    id: string;
    links: Array<{ signal: number; link: LinkType }> | null;
    b_direct: boolean;
    b_occ: boolean;
    b_text: boolean;
    role_hit: boolean;
  }>(result).map((r) => {
    const basis: MatchBasis[] = [];
    if (r.b_direct) basis.push("direct");
    if (r.b_occ) basis.push("occupation");
    if (r.b_text) basis.push("text");
    if (r.role_hit) basis.push("role");
    return { jobId: r.id, basis, links: r.links ?? [] };
  });
}
