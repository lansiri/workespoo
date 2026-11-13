import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { company, escoOccupationSkill, job, jobSkill, needCard } from "@/db/schema";
import type { NeedCard } from "@/contracts";
import { createTestDb, type TestDb } from "../../tests/helpers/db";
import { loadJobFixtures } from "../../fixtures/load";
import { jobsLitForSkillUris } from "./jobs-lit";

const PYTHON = "http://data.europa.eu/esco/skill/python";
const SQL_SKILL = "http://data.europa.eu/esco/skill/sql";
const WELD = "http://data.europa.eu/esco/skill/weld";
const DEV = "http://data.europa.eu/esco/occupation/developer";

describe("jobsLitForSkillUris", () => {
  let t: TestDb;
  const row = (id: string, over: Partial<typeof job.$inferInsert> = {}) => ({
    id, source: "tmt" as const, sourceId: id, url: `https://x.example/${id}`, title: id, employerName: `Employer ${id}`,
    municipality: "Espoo", municipalityCode: "049", ...over,
  });

  beforeAll(async () => {
    t = await createTestDb();
    await t.db.insert(job).values([
      row("direct", { postedAt: new Date("2026-11-01T00:00:00Z") }),
      row("via_occupation", { escoOccupationUris: [DEV], postedAt: new Date("2026-11-05T00:00:00Z") }),
      row("both", { escoOccupationUris: [DEV], postedAt: new Date("2026-11-03T00:00:00Z") }),
      row("helsinki", { municipality: "Helsinki", municipalityCode: "091", escoOccupationUris: [DEV], postedAt: new Date("2026-11-04T00:00:00Z") }),
      row("inactive", { active: false, escoOccupationUris: [DEV] }),
      row("masked", { escoOccupationUris: [DEV], postedAt: new Date("2026-11-06T00:00:00Z") }),
      row("unmasked_company", { escoOccupationUris: [DEV], postedAt: new Date("2026-11-02T00:00:00Z") }),
      row("unrelated", { postedAt: new Date("2026-11-07T00:00:00Z") }),
      row("undated", { escoOccupationUris: [DEV] }),
    ]);
    await t.db.insert(jobSkill).values([
      { jobId: "direct", skillUri: PYTHON, origin: "posting" },
      { jobId: "both", skillUri: PYTHON, origin: "posting" },
      { jobId: "unrelated", skillUri: WELD, origin: "posting" },
    ]);
    await t.db.insert(escoOccupationSkill).values([
      { occupationUri: DEV, skillUri: PYTHON, relation: "essential" },
      { occupationUri: DEV, skillUri: SQL_SKILL, relation: "optional" },
    ]);
    await t.db.insert(company).values([
      { id: "co_masked", displayName: "Demo A", source: "synthetic", masked: true, digestToken: "tok1" },
      { id: "co_open", displayName: "Real Oy", source: "posting", masked: false, digestToken: "tok2" },
    ]);
    const body = { stub: true } as unknown as NeedCard;
    await t.db.insert(needCard).values([
      { id: "nc1", jobId: "masked", companyId: "co_masked", body },
      { id: "nc2", jobId: "unmasked_company", companyId: "co_open", body },
    ]);
  }, 60_000);
  afterAll(() => t.close());

  it("finds postings linked directly through job_skill", async () => {
    const r = await jobsLitForSkillUris(t.db, [WELD]);
    expect(r.count).toBe(1);
    expect(r.sample.map((s) => s.id)).toEqual(["unrelated"]);
  });

  it("finds postings through occupations, de-duplicated with direct links, excluding inactive and masked", async () => {
    const r = await jobsLitForSkillUris(t.db, [PYTHON], { sampleSize: 10 });
    // direct: direct, both. via occupation: via_occupation, both, helsinki, unmasked_company, undated.
    // not: inactive, masked (masked company), unrelated.
    expect(r.count).toBe(6);
    expect(r.sample.map((s) => s.id)).toEqual(["via_occupation", "helsinki", "both", "unmasked_company", "direct", "undated"]);
  });

  it("matches on any of several skills and de-duplicates", async () => {
    const r = await jobsLitForSkillUris(t.db, [PYTHON, SQL_SKILL, PYTHON], { sampleSize: 10 });
    expect(r.count).toBe(6);
    expect((await jobsLitForSkillUris(t.db, [SQL_SKILL])).count).toBe(5);
  });

  it("returns the most recent few as teasers", async () => {
    const r = await jobsLitForSkillUris(t.db, [PYTHON]);
    expect(r.sample).toHaveLength(3);
    expect(r.sample[0]).toEqual({
      id: "via_occupation", title: "via_occupation", employerName: "Employer via_occupation",
      municipality: "Espoo", url: "https://x.example/via_occupation", source: "tmt",
    });
    expect((await jobsLitForSkillUris(t.db, [PYTHON], { sampleSize: 0 })).sample).toEqual([]);
  });

  it("filters by municipality code", async () => {
    const espoo = await jobsLitForSkillUris(t.db, [PYTHON], { municipalityCodes: ["049"], sampleSize: 10 });
    expect(espoo.count).toBe(5);
    expect(espoo.sample.map((s) => s.id)).not.toContain("helsinki");
    const hki = await jobsLitForSkillUris(t.db, [PYTHON], { municipalityCodes: ["091"] });
    expect(hki.sample.map((s) => s.id)).toEqual(["helsinki"]);
    const both = await jobsLitForSkillUris(t.db, [PYTHON], { municipalityCodes: ["091", "049"] });
    expect(both.count).toBe(6);
    expect((await jobsLitForSkillUris(t.db, [PYTHON], { municipalityCodes: ["999"] })).count).toBe(0);
  });

  it("excludes postings of masked demo companies but keeps those of open companies", async () => {
    const r = await jobsLitForSkillUris(t.db, [PYTHON], { sampleSize: 20 });
    const ids = r.sample.map((s) => s.id);
    expect(ids).not.toContain("masked");
    expect(ids).toContain("unmasked_company");
  });

  it("returns nothing for no skills or unknown skills", async () => {
    expect(await jobsLitForSkillUris(t.db, [])).toEqual({ count: 0, sample: [] });
    expect(await jobsLitForSkillUris(t.db, ["http://data.europa.eu/esco/skill/unknown"])).toEqual({ count: 0, sample: [] });
  });
});

describe("jobsLitForSkillUris on the fixture postings", () => {
  it("lights up real postings through the crawled occupation links", async () => {
    const t = await createTestDb();
    await loadJobFixtures(t.db);
    const customerService = "customer service";
    const { escoCandidates } = await import("./esco");
    const [cs] = await escoCandidates(t.db, customerService, { type: "skill", limit: 1 });
    const r = await jobsLitForSkillUris(t.db, [cs.uri], { municipalityCodes: ["049"] });
    expect(r.count).toBeGreaterThan(0);
    expect(r.sample.length).toBeGreaterThan(0);
    await t.close();
  }, 60_000);
});
