import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { escoConcept } from "@/db/schema";
import { createPoliteFetcher, type PoliteOptions } from "./polite-fetch";

export const ESCO_SKILLS_URL = "https://tyomarkkinatori.fi/api/codes/v1/kopa/ESCO_OSAAMINEN/koodit";
export const ESCO_OCCUPATIONS_URL = "https://tyomarkkinatori.fi/api/codes/v1/kopa/ESCO_AMMATTI/koodit";

type EscoRow = typeof escoConcept.$inferInsert;

export type EscoImportResult = {
  skills: { rows: number; retired: number };
  occupations: { rows: number; retired: number; nationalOccupations: number; iscoGroupsSkipped: number };
  upserted: number;
};

const BATCH = 1000;

function labels(row: unknown): { en: string | null; fi: string | null; sv: string | null } {
  const out = { en: null as string | null, fi: null as string | null, sv: null as string | null };
  const selite = (row as { selite?: unknown }).selite;
  if (!Array.isArray(selite)) return out;
  for (const s of selite) {
    const code = (s as { kielikoodi?: unknown })?.kielikoodi;
    const text = (s as { teksti?: unknown })?.teksti;
    if (typeof text !== "string" || !text.trim()) continue;
    if (code === "en" || code === "fi" || code === "sv") out[code] = text.trim();
  }
  return out;
}

function isRetired(row: unknown, now: number): boolean {
  const end = (row as { loppupaiva?: unknown }).loppupaiva;
  if (typeof end !== "string" || !end) return false;
  const t = Date.parse(end);
  return Number.isNaN(t) ? true : t <= now;
}

function iscoCode(row: unknown): string | null {
  const ext = (row as { laajennus?: unknown }).laajennus;
  if (!Array.isArray(ext)) return null;
  for (const e of ext) {
    if ((e as { tyyppi?: unknown })?.tyyppi === "ISCOKoodi" && typeof (e as { arvo?: unknown }).arvo === "string") {
      return (e as { arvo: string }).arvo;
    }
  }
  return null;
}

/** Map one skills code-list row. Returns null for rows without a usable URI or label. */
export function mapSkillRow(row: unknown, now = Date.now()): EscoRow | null {
  const uri = (row as { uri?: unknown })?.uri;
  if (typeof uri !== "string" || !uri) return null;
  const l = labels(row);
  const labelEn = l.en ?? l.fi ?? l.sv;
  if (!labelEn) return null;
  return {
    uri,
    type: "skill",
    labelEn,
    labelFi: l.fi,
    labelSv: l.sv,
    isco: null,
    retired: isRetired(row, now),
  };
}

/** Map one occupations row. ISCO group rows (`/esco/isco/`) are skipped (null). */
export function mapOccupationRow(row: unknown, now = Date.now()): EscoRow | null {
  const uri = (row as { uri?: unknown })?.uri;
  if (typeof uri !== "string" || !uri) return null;
  if (uri.includes("/esco/isco/")) return null;
  const l = labels(row);
  const labelEn = l.en ?? l.fi ?? l.sv;
  if (!labelEn) return null;
  return {
    uri,
    type: "occupation",
    labelEn,
    labelFi: l.fi,
    labelSv: l.sv,
    isco: iscoCode(row),
    retired: isRetired(row, now),
  };
}

async function upsertBatches(db: Db, rows: EscoRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    await db
      .insert(escoConcept)
      .values(rows.slice(i, i + BATCH))
      .onConflictDoUpdate({
        target: escoConcept.uri,
        set: {
          type: sql`excluded.type`,
          labelEn: sql`excluded.label_en`,
          labelFi: sql`excluded.label_fi`,
          labelSv: sql`excluded.label_sv`,
          isco: sql`excluded.isco`,
          retired: sql`excluded.retired`,
        },
      });
  }
}

/**
 * Download the two Työmarkkinatori ESCO code lists and upsert them into `esco_concept`.
 * Safe to re-run: rows are keyed on URI, and `retired` is recomputed from `loppupaiva`.
 * Keeps ESCO and Finnish national occupations, skips ISCO group rows.
 */
export async function importEsco(
  db: Db,
  opts: PoliteOptions & { skillsUrl?: string; occupationsUrl?: string; now?: Date } = {},
): Promise<EscoImportResult> {
  const http = createPoliteFetcher({ timeoutMs: 120_000, ...opts });
  const now = (opts.now ?? new Date()).getTime();

  const skillRows = await http.getJson<unknown[]>(opts.skillsUrl ?? ESCO_SKILLS_URL);
  const occupationRows = await http.getJson<unknown[]>(opts.occupationsUrl ?? ESCO_OCCUPATIONS_URL);
  if (!Array.isArray(skillRows) || !Array.isArray(occupationRows)) {
    throw new Error("ESCO code lists did not return JSON arrays");
  }

  const skills = skillRows.map((r) => mapSkillRow(r, now)).filter((r): r is EscoRow => r !== null);
  const occupations: EscoRow[] = [];
  let iscoGroupsSkipped = 0;
  for (const r of occupationRows) {
    const mapped = mapOccupationRow(r, now);
    if (mapped) occupations.push(mapped);
    else if (String((r as { uri?: unknown })?.uri ?? "").includes("/esco/isco/")) iscoGroupsSkipped++;
  }

  await upsertBatches(db, skills);
  await upsertBatches(db, occupations);

  return {
    skills: { rows: skills.length, retired: skills.filter((s) => s.retired).length },
    occupations: {
      rows: occupations.length,
      retired: occupations.filter((o) => o.retired).length,
      nationalOccupations: occupations.filter((o) => o.uri.startsWith("http://data.tyomarkkinatori.fi/")).length,
      iscoGroupsSkipped,
    },
    upserted: skills.length + occupations.length,
  };
}
