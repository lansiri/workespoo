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
  const skills = [...new Set(skillUris)];
  if (skills.length === 0) return { count: 0, sample: [] };
  const sampleSize = Math.max(0, opts.sampleSize ?? DEFAULT_SAMPLE_SIZE);
  const municipalityFilter =
    opts.municipalityCodes && opts.municipalityCodes.length > 0
      ? sql`AND j.municipality_code = ANY(${textArray(opts.municipalityCodes)})`
      : sql``;
  const skillArray = textArray(skills);

  const matched = sql`
    SELECT j.id, j.title, j.employer_name, j.municipality, j.url, j.source, j.posted_at
    FROM job j
    WHERE j.active
      AND (
        EXISTS (SELECT 1 FROM job_skill js WHERE js.job_id = j.id AND js.skill_uri = ANY(${skillArray}))
        OR j.esco_occupation_uris && ARRAY(
          SELECT eos.occupation_uri FROM esco_occupation_skill eos WHERE eos.skill_uri = ANY(${skillArray})
        )
      )
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
          SELECT id, title, employer_name, municipality, url, source FROM (${matched}) m
          ORDER BY posted_at DESC NULLS LAST, id
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
  }>(sampleResult).map((r) => ({
    id: r.id,
    title: r.title,
    employerName: r.employer_name,
    municipality: r.municipality,
    url: r.url,
    source: r.source,
  }));
  return { count, sample };
}
