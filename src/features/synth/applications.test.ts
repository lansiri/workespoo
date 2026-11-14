import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { application, applicationTurn, talent } from "@/db/schema";
import { loadJobFixtures } from "../../../fixtures/load";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { chooseApplicants, MAX_APPLICANTS_PER_JOB, MAX_JOBS_PER_PERSON, PITCH_APPLICANTS, runSimulatedApplications, type ApplyCompany } from "./applications";
import { createFakeApplications } from "./fake-applications";
import { createFakeEngine } from "./fake-engine";
import { loadPersonas } from "./persona";
import { restoreDemoSnapshot, snapshotDemo } from "./snapshot";
import { resetDemo, seedDemo } from "./seed";

const personas = loadPersonas();
const NOW = new Date("2026-11-25T08:00:00Z");

describe("chooseApplicants", () => {
  const people = Array.from({ length: 12 }, (_, i) => ({ personaId: `p${String(i + 1).padStart(2, "0")}`, talentId: `tal_${i}` }));
  const companies = Array.from({ length: 8 }, (_, i) => ({ number: i + 1, companyId: `co_demo0${i + 1}`, jobId: `job_${i + 1}`, eligible: people }));

  it("respects both caps, and the pitch company gets four", () => {
    const chosen = chooseApplicants(companies);
    const perPerson = new Map<string, number>();
    const perJob = new Map<number, number>();
    for (const a of chosen) {
      perPerson.set(a.personaId, (perPerson.get(a.personaId) ?? 0) + 1);
      perJob.set(a.companyNumber, (perJob.get(a.companyNumber) ?? 0) + 1);
    }
    expect(Math.max(...perPerson.values())).toBeLessThanOrEqual(MAX_JOBS_PER_PERSON);
    expect(Math.max(...perJob.values())).toBeLessThanOrEqual(MAX_APPLICANTS_PER_JOB);
    expect(perJob.get(3)).toBe(PITCH_APPLICANTS);
    // 12 people with two jobs each: 24 places for 8 jobs, so everyone is used twice.
    expect(chosen).toHaveLength(24);
  });

  it("makes the same choice whatever the order or the row ids", () => {
    const first = chooseApplicants(companies).map((a) => `${a.personaId}>${a.companyNumber}`);
    const shuffled = companies
      .map((c) => ({ ...c, eligible: [...c.eligible].reverse().map((p) => ({ ...p, talentId: `other_${p.talentId}` })) }))
      .reverse();
    expect(chooseApplicants(shuffled).map((a) => `${a.personaId}>${a.companyNumber}`)).toEqual(first);
  });

  it("only picks people who are eligible", () => {
    const chosen = chooseApplicants([{ number: 1, companyId: "c", jobId: "j", eligible: [people[0]] }]);
    expect(chosen.map((a) => a.personaId)).toEqual(["p01"]);
  });
});

describe("simulated applications on a seeded demo (fake engine)", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
    await loadJobFixtures(t.db);
  }, 120_000);
  afterAll(() => t.close());

  it("every application reaches assessed, labelled as theirs, and the seed reports it", async () => {
    const summary = await seedDemo(t.db, { deps: createFakeEngine(t.db, { personas, applications: true }), personas, now: () => NOW, appUrl: "https://example.test" });
    expect(summary.applications).not.toBeNull();
    expect(summary.applications!.planned).toBeGreaterThan(0);
    expect(summary.applications!.failed).toEqual([]);
    const rows = await t.db.select().from(application);
    expect(rows).toHaveLength(summary.applications!.assessed);
    expect(rows.every((r) => r.status === "assessed" && r.assessment !== null)).toBe(true);
    const owners = await t.db.select({ id: talent.id, synthetic: talent.synthetic }).from(talent);
    for (const r of rows) expect(owners.find((o) => o.id === r.talentId)?.synthetic).toBe(true);
  }, 120_000);

  it("a second seed run adds nothing", async () => {
    const before = (await t.db.select().from(application)).length;
    await seedDemo(t.db, { deps: createFakeEngine(t.db, { personas, applications: true }), personas, now: () => NOW, appUrl: "https://example.test" });
    expect((await t.db.select().from(application)).length).toBe(before);
  }, 120_000);

  it("snapshot and restore round-trip application and application_turn for simulated people", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "apps-snap-"));
    try {
      const apps = await t.db.select().from(application);
      const turns = await t.db.select().from(applicationTurn);
      const counts = await snapshotDemo(t.db, dir);
      expect(counts.application).toBe(apps.length);
      expect(counts.application_turn).toBe(turns.length);
      expect(counts).not.toHaveProperty("applicant_ranking");
      const summary = await restoreDemoSnapshot(t.db, { deps: createFakeEngine(t.db, { personas, applications: true }), personas, now: () => NOW, appUrl: "https://example.test", dir });
      expect(summary.applications).toBeNull();
      const after = await t.db.select().from(application);
      expect(after).toHaveLength(apps.length);
      expect((await t.db.select().from(applicationTurn)).length).toBe(turns.length);
      expect(after.map((a) => a.id).sort()).toEqual(apps.map((a) => a.id).sort());
      expect(after.every((a) => a.status === "assessed" && a.assessment !== null && a.createdAt instanceof Date)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("resetDemo leaves no application behind", async () => {
    expect((await t.db.select().from(application)).length).toBeGreaterThan(0);
    await resetDemo(t.db);
    expect(await t.db.select().from(application)).toHaveLength(0);
    expect(await t.db.select().from(applicationTurn)).toHaveLength(0);
  }, 120_000);
});

describe("a failed run", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
    await loadJobFixtures(t.db);
  }, 120_000);
  afterAll(() => t.close());

  it("leaves nothing stored and is reported", async () => {
    const engine = createFakeEngine(t.db, { personas, applications: true });
    await seedDemo(t.db, { deps: engine, personas, now: () => NOW, appUrl: "https://example.test", applications: false });
    expect(await t.db.select().from(application)).toHaveLength(0);
    const { companies } = await seedDemo(t.db, { deps: engine, personas, now: () => NOW, appUrl: "https://example.test", applications: false });
    let failingId: string | null = null;
    const apply: ApplyCompany[] = companies.map((c) => ({ number: c.number, companyId: c.companyId, jobId: c.jobId, needCardId: c.needCardId }));
    const report = await runSimulatedApplications(t.db, personas, apply, {
      deps: createFakeApplications(t.db, { failAssessmentFor: (id) => (failingId ??= id) === id }),
      answer: async () => "I have done this at work. It went well.",
    });
    expect(report.failed.length).toBeGreaterThan(0);
    expect(report.assessed + report.failed.length).toBe(report.planned);
    const stored = await t.db.select().from(application).where(eq(application.talentId, failingId!));
    expect(stored).toHaveLength(0);
    const all = await t.db.select().from(application);
    expect(all.every((a) => a.status === "assessed")).toBe(true);
    const orphans = (await t.db.select().from(applicationTurn)).filter((x) => !all.some((a) => a.id === x.applicationId));
    expect(orphans).toHaveLength(0);
  }, 120_000);
});
