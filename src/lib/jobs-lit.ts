import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { JobSource, JobTeaser } from "@/contracts";

export const DEFAULT_SAMPLE_SIZE = 3;

function unwrapRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return (result as { rows: T[] }).rows;
}

function textArray(values: string[]): SQL {
  return sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;
}

/** A recognised skill: the person's own short phrase and, when one was found, its ESCO skill. */
export type LitSignal = { phrase: string; escoUri?: string | null };

const MAX_TEXT_QUERIES = 40;
const MAX_PHRASE_WORDS = 5;
/** From this length on, the last word of a phrase also matches longer forms ("python" finds "Pythonia"). */
const PREFIX_MIN_LENGTH = 4;

/**
 * A `simple` tsquery that finds a phrase as adjacent words in posting text, or null when the
 * phrase is too short or too long to search for. Only letters and digits survive, so the
 * result is safe to hand to `to_tsquery`.
 */
export function phraseQuery(text: string): string | null {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
  if (words.length === 0 || words.length > MAX_PHRASE_WORDS || words.join("").length < 3) return null;
  return words
    .map((w, i) => `'${w}'${i === words.length - 1 && w.length >= PREFIX_MIN_LENGTH ? ":*" : ""}`)
    .join(" <-> ");
}

/**
 * Active postings that relate to these skills: postings linked to their ESCO skills (as
 * `jobsLitForSkillUris`), and postings whose text mentions a skill in so many words: the
 * person's own phrase, or the ESCO label in English or Finnish. The Finnish label is what lets
 * someone who said "customer service" light up a posting that says "asiakaspalvelu".
 * Pure SQL, no model call. A sampled posting that mentions a skill says which one (`mention`),
 * and those come first in the sample.
 */
export async function jobsLitForSignals(
  db: Db,
  signals: LitSignal[],
  opts: { municipalityCodes?: string[]; sampleSize?: number } = {},
): Promise<{ count: number; sample: JobTeaser[] }> {
  const uris = [...new Set(signals.map((s) => s.escoUri).filter((u): u is string => !!u))];
  const texts = signals.map((s) => s.phrase);
  if (uris.length > 0) {
    const labels = unwrapRows<{ label_en: string; label_fi: string | null }>(
      await db.execute(sql`SELECT label_en, label_fi FROM esco_concept WHERE uri = ANY(${textArray(uris)})`),
    );
    for (const l of labels) texts.push(l.label_en, l.label_fi ?? "");
  }
  const queries = new Map<string, string>();
  for (const text of texts) {
    const query = phraseQuery(text);
    if (query !== null && !queries.has(query) && queries.size < MAX_TEXT_QUERIES) queries.set(query, text.trim());
  }
  return jobsLit(db, uris, [...queries].map(([query, text]) => ({ query, text })), opts);
}

/**
 * Active postings linked to these ESCO skill URIs: directly through `job_skill`, or through
 * occupations in `esco_occupation_skill`. Postings that belong to a masked demo company are
 * excluded. Pure SQL, no model call. `sample` is the most recently posted few.
 */
export async function jobsLitForSkillUris(
  db: Db,
  skillUris: string[],
  opts: { municipalityCodes?: string[]; sampleSize?: number } = {},
): Promise<{ count: number; sample: JobTeaser[] }> {
  return jobsLit(db, [...new Set(skillUris)], [], opts);
}

async function jobsLit(
  db: Db,
  skills: string[],
  textQueries: Array<{ query: string; text: string }>,
  opts: { municipalityCodes?: string[]; sampleSize?: number },
): Promise<{ count: number; sample: JobTeaser[] }> {
  if (skills.length === 0 && textQueries.length === 0) return { count: 0, sample: [] };
  const sampleSize = Math.max(0, opts.sampleSize ?? DEFAULT_SAMPLE_SIZE);
  const municipalityFilter =
    opts.municipalityCodes && opts.municipalityCodes.length > 0
      ? sql`AND j.municipality_code = ANY(${textArray(opts.municipalityCodes)})`
      : sql``;
  const linked =
    skills.length > 0
      ? sql`(
        EXISTS (SELECT 1 FROM job_skill js WHERE js.job_id = j.id AND js.skill_uri = ANY(${textArray(skills)}))
        OR j.esco_occupation_uris && ARRAY(
          SELECT eos.occupation_uri FROM esco_occupation_skill eos WHERE eos.skill_uri = ANY(${textArray(skills)})
        )
      )`
      : sql`false`;
  const mentioned =
    textQueries.length > 0
      ? sql`j.search @@ to_tsquery('simple', ${textQueries.map((q) => `(${q.query})`).join(" | ")})`
      : sql`false`;
  // Which skill a sampled posting mentions, for the "mentions: ..." line under it.
  const mention =
    textQueries.length > 0
      ? sql`(SELECT t.txt FROM unnest(${textArray(textQueries.map((q) => q.query))}, ${textArray(textQueries.map((q) => q.text))}) WITH ORDINALITY AS t(q, txt, n)
             WHERE m.search @@ to_tsquery('simple', t.q) ORDER BY t.n LIMIT 1)`
      : sql`NULL::text`;

  const matched = sql`
    SELECT j.id, j.title, j.employer_name, j.municipality, j.url, j.source, j.posted_at, j.search
    FROM job j
    WHERE j.active
      AND (${linked} OR ${mentioned})
      AND NOT EXISTS (
        SELECT 1 FROM need_card nc JOIN company c ON c.id = nc.company_id
        WHERE nc.job_id = j.id AND c.masked
      )
      ${municipalityFilter}
  `;

  const [countResult, sampleResult] = await Promise.all([
    db.execute(sql`SELECT count(*)::int AS n FROM (${matched}) m`),
    sampleSize === 0
      ? Promise.resolve([])
      : db.execute(sql`
          SELECT id, title, employer_name, municipality, url, source, ${mention} AS mention FROM (${matched}) m
          ORDER BY (${mention} IS NOT NULL) DESC, posted_at DESC NULLS LAST, id
          LIMIT ${sampleSize}
        `),
  ]);

  const count = Number(unwrapRows<{ n: number | string }>(countResult)[0]?.n ?? 0);
  const sample = unwrapRows<{
    id: string;
    title: string;
    employer_name: string;
    municipality: string | null;
    url: string;
    source: JobSource;
    mention: string | null;
  }>(sampleResult).map((r) => ({
    id: r.id,
    title: r.title,
    employerName: r.employer_name,
    municipality: r.municipality,
    url: r.url,
    source: r.source,
    ...(r.mention ? { mention: r.mention } : {}),
  }));
  return { count, sample };
}
