/**
 * Live smoke test against the real public endpoints. Skipped unless LIVE=1:
 *   LIVE=1 npx vitest run src/features/jobs/live.smoke.test.ts
 */
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { escoConcept, job, jobSkill, escoOccupationFetch } from "@/db/schema";
import { containsContact } from "@/lib/redact";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { crawlOccupationSkills } from "./esco-occupations";
import { importEsco } from "./esco-import";
import { ingestTmt } from "./tmt";

describe.skipIf(process.env.LIVE !== "1")("live smoke (real endpoints)", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  }, 60_000);
  afterAll(() => t.close());

  it("imports ESCO", async () => {
    const started = Date.now();
    const r = await importEsco(t.db);
    console.log(`LIVE esco: ${JSON.stringify(r)} in ${Date.now() - started} ms`);
    expect(r.skills.rows).toBeGreaterThan(14_000);
    expect(r.skills.retired).toBeGreaterThan(100);
    expect(r.occupations.rows).toBeGreaterThan(3_000);
    expect(r.occupations.iscoGroupsSkipped).toBeGreaterThan(500);
    const [{ n }] = await t.db.select({ n: count() }).from(escoConcept);
    expect(n).toBe(r.upserted);
  }, 300_000);

  it("ingests one page of Espoo postings", async () => {
    const started = Date.now();
    const r = await ingestTmt(t.db, { municipalities: ["049"], maxPages: 1, onProgress: (m) => console.log(`LIVE tmt: ${m}`) });
    console.log(`LIVE tmt: ${JSON.stringify(r)} in ${Date.now() - started} ms`);
    expect(r.pages).toBe(1);
    expect(r.seen).toBe(90);
    expect(r.inserted).toBeGreaterThanOrEqual(80);
    expect(r.failed).toBeLessThanOrEqual(10);
    expect(r.complete).toBe(false);
    expect(r.deactivated).toBe(0);

    const rows = await t.db.select().from(job).where(eq(job.source, "tmt"));
    expect(rows.every((x) => x.title && x.url.startsWith("http"))).toBe(true);
    expect(rows.filter((x) => x.sentences.length > 0).length).toBeGreaterThan(rows.length * 0.8);
    expect(rows.some((x) => containsContact(JSON.stringify(x)))).toBe(false);
    expect(rows.some((x) => JSON.stringify(x.raw).includes('"recruiter"'))).toBe(false);
    const [{ n: links }] = await t.db.select({ n: count() }).from(jobSkill);
    console.log(`LIVE tmt: ${rows.length} rows, ${links} job_skill rows`);
  }, 300_000);

  it("crawls two occupations from the ESCO API", async () => {
    const started = Date.now();
    const r = await crawlOccupationSkills(t.db, { limit: 2 });
    console.log(`LIVE occupations: ${JSON.stringify(r)} in ${Date.now() - started} ms`);
    expect(r.fetched + r.missing + r.failed).toBe(2);
    expect(r.fetched).toBeGreaterThanOrEqual(1);
    expect(r.links).toBeGreaterThan(5);
    const [{ n }] = await t.db.select({ n: count() }).from(escoOccupationFetch);
    expect(n).toBeGreaterThanOrEqual(1);
  }, 120_000);
});
