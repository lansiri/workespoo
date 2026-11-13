import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Db } from "../src/db/client";
import { escoConcept, escoOccupationFetch, escoOccupationSkill, job, jobSkill } from "../src/db/schema";
import { normaliseTmtPosting } from "../src/features/jobs/tmt";

type Subset = {
  concepts: Array<typeof escoConcept.$inferInsert>;
  occupationSkills: Array<{ occupationUri: string; skillUri: string; relation: "essential" | "optional" }>;
};

const read = <T>(relative: string): T =>
  JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8")) as T;

export const FIXTURE_ESCO_SUBSET = () => read<Subset>("./esco/subset.json");
/** Real Espoo postings in the Työmarkkinatori detail shape, redacted, without `recruiter`. */
export const FIXTURE_TMT_POSTINGS = () => read<unknown[]>("./jobs/tmt-sample.json");

async function insertChunks<T>(rows: T[], size: number, insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}

/**
 * Insert the fixture ESCO concepts and occupation links, and the normalised sample postings
 * (through the real normaliser), into a test database.
 */
export async function loadJobFixtures(db: Db): Promise<{ concepts: number; links: number; jobs: number }> {
  const subset = FIXTURE_ESCO_SUBSET();
  await insertChunks(subset.concepts, 500, (c) => db.insert(escoConcept).values(c).onConflictDoNothing());
  await insertChunks(subset.occupationSkills, 500, (c) => db.insert(escoOccupationSkill).values(c).onConflictDoNothing());
  const occupations = [...new Set(subset.occupationSkills.map((l) => l.occupationUri))];
  await insertChunks(occupations, 500, (c) =>
    db
      .insert(escoOccupationFetch)
      .values(
        c.map((occupationUri) => ({
          occupationUri,
          ok: true,
          skillCount: subset.occupationSkills.filter((l) => l.occupationUri === occupationUri).length,
        })),
      )
      .onConflictDoNothing(),
  );

  let jobs = 0;
  for (const detail of FIXTURE_TMT_POSTINGS()) {
    const normalised = normaliseTmtPosting(detail, { preferMunicipalities: ["049"] });
    if (!normalised) continue;
    await db.insert(job).values(normalised.job).onConflictDoNothing();
    if (normalised.skillUris.length > 0) {
      await db
        .insert(jobSkill)
        .values(normalised.skillUris.map((skillUri) => ({ jobId: normalised.job.id as string, skillUri, origin: "posting" as const })))
        .onConflictDoNothing();
    }
    jobs++;
  }
  return { concepts: subset.concepts.length, links: subset.occupationSkills.length, jobs };
}
