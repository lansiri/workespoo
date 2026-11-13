import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadJobFixtures } from "../../../fixtures/load";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { loadDemoCandidates, PITCH_NUMBER, selectDemoPostings, STAFFING_AGENCY, type DemoCandidate } from "./demo-postings";

const EVENT_DATE = new Date("2026-11-26T11:00:00Z");
let t: TestDb;
let candidates: DemoCandidate[];
beforeAll(async () => {
  t = await createTestDb();
  await loadJobFixtures(t.db);
  candidates = await loadDemoCandidates(t.db, EVENT_DATE);
});
afterAll(() => t.close());

describe("demo posting candidates on the fixtures", () => {
  it("leave out staffing agencies, short postings and postings that expire before the event", () => {
    expect(candidates.length).toBeGreaterThan(8);
    for (const c of candidates) {
      expect(STAFFING_AGENCY.test(c.employerName), c.employerName).toBe(false);
      expect(c.sentenceCount).toBeGreaterThanOrEqual(8);
    }
    // "Kuntotarkastaja" (Mestarit Henkilöstöpalvelut) is a staffing agency; "Sairaanhoitaja" at a municipality expiring 18 Nov is too early.
    expect(candidates.some((c) => /henkilöstöpalvelu/i.test(c.employerName))).toBe(false);
  });
});

describe("selectDemoPostings", () => {
  it("picks the ICT posting with a Finnish requirement as company 03, in English where one exists", () => {
    const { picks } = selectDemoPostings(candidates);
    const pitch = picks.find((p) => p.number === 3)!;
    expect(pitch.candidate.isco2).toBe("25");
    expect(pitch.candidate.title).toBe("UX Designer");
    expect(pitch.candidate.lang).toBe("en");
    expect(pitch.tags).toContain("pitch");
  });

  it("numbers companies 01..N once each, with distinct employers and postings", () => {
    const { picks } = selectDemoPostings(candidates, { count: 8 });
    expect(picks).toHaveLength(8);
    expect(picks.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(picks.map((p) => p.candidate.jobId)).size).toBe(8);
    expect(new Set(picks.map((p) => p.candidate.employerName.toLowerCase())).size).toBe(8);
  });

  it("covers the quotas the fixtures can satisfy and names the ones they cannot", () => {
    const { picks, unmet } = selectDemoPostings(candidates, { count: 8 });
    const has = (f: (c: DemoCandidate) => boolean) => picks.filter((p) => f(p.candidate)).length;
    expect(has((c) => c.lang === "fi")).toBeGreaterThanOrEqual(2);
    expect(new Set(picks.map((p) => p.candidate.isco2)).size).toBeGreaterThanOrEqual(4);
    // The fixtures hold no public posting with a statutory language requirement that is still open on
    // 26 November, so that quota is reported as unmet; a full ingest has many.
    const publicStatutory = picks.some((p) => p.tags.includes("public, statutory language"));
    expect(publicStatutory || unmet.some((u) => u.startsWith("public employer"))).toBe(true);
    expect(picks.some((p) => p.tags.includes("licence or clearance"))).toBe(true);
    // Whatever is unmet is said out loud rather than hidden.
    for (const u of unmet) expect(u).toMatch(/found \d+ of \d+|only \d+|pitch/);
  });

  it("is deterministic, and changes when the candidate set changes only where it must", () => {
    const a = selectDemoPostings(candidates).picks.map((p) => [p.number, p.candidate.jobId]);
    const b = selectDemoPostings([...candidates].reverse()).picks.map((p) => [p.number, p.candidate.jobId]);
    expect(b).toEqual(a);
  });

  it("reports a missing pitch posting instead of failing", () => {
    const withoutIct = candidates.filter((c) => c.isco2 !== "25");
    const { picks, unmet } = selectDemoPostings(withoutIct);
    expect(unmet.some((u) => u.startsWith("pitch posting"))).toBe(true);
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.map((p) => p.number)).toEqual(Array.from({ length: picks.length }, (_, i) => i + 1));
  });

  it("copes with fewer usable postings than companies", () => {
    const { picks, unmet } = selectDemoPostings(candidates.slice(0, 3), { count: 8 });
    expect(picks.length).toBeLessThanOrEqual(3);
    expect(unmet.some((u) => u.startsWith("only"))).toBe(true);
  });
});

describe("a named pitch posting", () => {
  const make = (jobId: string, title: string, employerName: string, lang: DemoCandidate["lang"], isco2: string, text: string): DemoCandidate => ({
    jobId, title, employerName, employerBusinessId: null, source: "tmt", sector: "private", lang, isco2, sentenceCount: 30, text,
  });
  const named = [
    make("job_ict", "Developer", "Alpha Oy", "en", "25", "Developer\nFinnish required"),
    make("job_named", "ERP specialist", "Beta Oy", "fi", "21", "ERP specialist\nPuhut sujuvaa suomea"),
    make("job_other", "Cook", "Gamma Oy", "fi", "51", "Cook\nsuomen kielen taito"),
  ];

  it("becomes company 03 when it is among the candidates", () => {
    const { picks, unmet } = selectDemoPostings(named, { count: 3, pitchJobId: "job_named" });
    expect(picks.find((p) => p.number === PITCH_NUMBER)?.candidate.jobId).toBe("job_named");
    expect(unmet.join(" ")).not.toContain("is not among the candidates");
  });

  it("falls back to the usual choice and says so when it is not", () => {
    const { picks, unmet } = selectDemoPostings(named, { count: 3, pitchJobId: "job_gone" });
    expect(picks.find((p) => p.number === PITCH_NUMBER)?.candidate.jobId).toBe("job_ict");
    expect(unmet.join(" ")).toContain("job_gone is not among the candidates");
  });
});
