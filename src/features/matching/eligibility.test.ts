import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { loadJobFixtures } from "../../../fixtures/load";
import { eligibility, needCard, talent } from "@/db/schema";
import { rowsOf } from "@/lib/sql";
import { audit_rows } from "./testkit-audit";
import { computeEligibility } from "./eligibility";
import { TOUCH_TRIGRAM_THRESHOLD } from "./constants";
import { touches, touchedRequirementIds } from "./touches";
import { addNeed, addPerson, jobIdByTitle, occupationSkillsOf, req, uriByLabel } from "./testkit";

let t: TestDb;
let jobId: string;
let python: string;
let sqlUri: string;
let java: string;

beforeAll(async () => {
  t = await createTestDb();
  await loadJobFixtures(t.db);
  jobId = await jobIdByTitle(t.db, "Mobile Developer");
  python = await uriByLabel(t.db, "Python (computer programming)");
  sqlUri = await uriByLabel(t.db, "SQL");
  java = await uriByLabel(t.db, "Java (computer programming)");
});
afterAll(() => t.close());
afterEach(async () => {
  await t.db.delete(needCard);
  await t.db.delete(talent);
});

async function rowsFor(needCardId: string) {
  return t.db.select().from(eligibility).where(eq(eligibility.needCardId, needCardId));
}
const eligibleIds = async (needCardId: string) =>
  (await rowsFor(needCardId)).filter((r) => r.eligible).map((r) => r.talentId).sort();

describe("touches", () => {
  it("matches an approved signal whose ESCO URI is among the requirement's URIs", async () => {
    await addPerson(t.db, { id: "tal_a", signals: [{ id: "s1", phrase: "Pipelines", escoUri: python }] });
    expect(await touches(t.db, "tal_a", req("r1", "Scripting", { escoSkillUris: [python] }))).toBe(true);
    expect(await touches(t.db, "tal_a", req("r1", "Scripting", { escoSkillUris: [java] }))).toBe(false);
  });

  it("matches through an occupation the requirement is grounded to (essential skills only)", async () => {
    const [skill] = await occupationSkillsOf(t.db, "Mobile Developer", 1);
    const [occ] = rowsOf<{ o: string }>(
      await t.db.execute(sql`SELECT esco_occupation_uris[1] AS o FROM job WHERE id = ${jobId}`),
    );
    await addPerson(t.db, { id: "tal_a", signals: [{ id: "s1", phrase: "Zzz qqq", escoUri: skill.uri }] });
    expect(await touches(t.db, "tal_a", req("r1", "Zzz www", { escoSkillUris: [occ.o] }))).toBe(true);
  });

  it("matches on trigram similarity at or above the named threshold, and agrees with word_similarity", async () => {
    await addPerson(t.db, {
      id: "tal_a",
      signals: [
        { id: "s1", phrase: "Java" },
        { id: "s2", phrase: "Data pipelines" },
      ],
    });
    const pairs: Array<[string, string]> = [
      ["Java", "5 years of Java development"],
      ["Data pipelines", "Building data pipeline tooling"],
      ["Data pipelines", "Pipeline"],
      ["Java", "Javascript frameworks"],
      ["Java", "Customer service"],
    ];
    let above = 0;
    let below = 0;
    for (const [phrase, text] of pairs) {
      const [{ s }] = rowsOf<{ s: number }>(
        await t.db.execute(sql`SELECT word_similarity(lower(${phrase}), lower(${text})) AS s`),
      );
      const row = await touchedRequirementIds(t.db, "tal_a", [req("r1", text)]);
      const signalId = phrase === "Java" ? "s1" : "s2";
      void signalId;
      if (Number(s) >= TOUCH_TRIGRAM_THRESHOLD) above++;
      else below++;
      // The person has both phrases; the result is true if either reaches the threshold.
      const [{ best }] = rowsOf<{ best: number }>(
        await t.db.execute(
          sql`SELECT greatest(word_similarity('java', lower(${text})), word_similarity('data pipelines', lower(${text}))) AS best`,
        ),
      );
      expect(row.length === 1).toBe(Number(best) >= TOUCH_TRIGRAM_THRESHOLD);
    }
    expect(above).toBeGreaterThan(0);
    expect(below).toBeGreaterThan(0);
  });

  it("language requirements follow the person's languages, evidenced or declared, and nothing else", async () => {
    await addPerson(t.db, { id: "tal_a", signals: [{ id: "s1", phrase: "Welding" }], languages: [{ code: "fi", basis: "declared" }] });
    await addPerson(t.db, { id: "tal_b", signals: [{ id: "s1", phrase: "Welding" }] });
    const fi = req("r1", "Fluent Finnish", { category: "language", languageCode: "fi" });
    expect(await touches(t.db, "tal_a", fi)).toBe(true);
    expect(await touches(t.db, "tal_b", fi)).toBe(false);
  });

  it("authorisation and other requirements touch only on trigram similarity, never on ESCO URIs", async () => {
    await addPerson(t.db, { id: "tal_a", signals: [{ id: "s1", phrase: "Hygiene passport" }, { id: "s2", phrase: "Python", escoUri: python }] });
    expect(await touches(t.db, "tal_a", req("r1", "Hygiene passport", { category: "authorisation" }))).toBe(true);
    expect(await touches(t.db, "tal_a", req("r2", "Driving licence B", { category: "authorisation", escoSkillUris: [python] }))).toBe(false);
    expect(await touches(t.db, "tal_a", req("r3", "Something else", { category: "other", escoSkillUris: [python] }))).toBe(false);
  });
});

describe("computeEligibility", () => {
  async function pool() {
    // Anchors: three skill requirements. A touches 1, B touches 2, C touches 3, D touches none.
    await addPerson(t.db, { id: "tal_a", signals: [{ id: "s1", phrase: "Python", escoUri: python }] });
    await addPerson(t.db, { id: "tal_b", signals: [{ id: "s1", phrase: "Python", escoUri: python }, { id: "s2", phrase: "SQL", escoUri: sqlUri }] });
    await addPerson(t.db, {
      id: "tal_c",
      signals: [
        { id: "s1", phrase: "Python", escoUri: python },
        { id: "s2", phrase: "SQL", escoUri: sqlUri },
        { id: "s3", phrase: "Java", escoUri: java },
      ],
    });
    await addPerson(t.db, { id: "tal_d", signals: [{ id: "s1", phrase: "Gardening" }] });
  }
  const three = () => [
    req("r1", "Python", { escoSkillUris: [python] }),
    req("r2", "SQL", { escoSkillUris: [sqlUri] }),
    req("r3", "Java", { escoSkillUris: [java] }),
  ];

  it("one related anchor is enough, whatever the size of the need; none is not (boundary)", async () => {
    await pool();
    await addNeed(t.db, { id: "nc_1", jobId, requirements: three() });
    expect(await computeEligibility(t.db, { needCardId: "nc_1" })).toEqual({ rows: 4 });
    // tal_a relates to one of three anchors, tal_b and tal_c to more; the fourth person to none.
    expect(await eligibleIds("nc_1")).toEqual(["tal_a", "tal_b", "tal_c"]);
  });

  it("needs only 1 anchor when the need has fewer than 3 (boundary)", async () => {
    await pool();
    await addNeed(t.db, { id: "nc_1", jobId, requirements: three().slice(0, 2) });
    await computeEligibility(t.db, { needCardId: "nc_1" });
    expect(await eligibleIds("nc_1")).toEqual(["tal_a", "tal_b", "tal_c"]);
  });

  it("M4 (rule of 14 Nov): relating to 1 of 4 anchors is enough for an organiser's look, with or without a matching role", async () => {
    await pool();
    await addNeed(t.db, { id: "nc_1", jobId, requirements: [...three(), req("r4", "Kubernetes operations")] });
    await computeEligibility(t.db, { needCardId: "nc_1" });
    expect(await eligibleIds("nc_1")).toContain("tal_a");
  });

  it("is also eligible with one anchor plus a self-declared role close to the need title", async () => {
    await addPerson(t.db, { id: "tal_a", signals: [{ id: "s1", phrase: "Python", escoUri: python }], roles: ["Data Engineer"] });
    await addPerson(t.db, { id: "tal_b", signals: [{ id: "s1", phrase: "Python", escoUri: python }], roles: ["Gardener"] });
    await addNeed(t.db, { id: "nc_1", jobId, title: "Data Engineer", requirements: three() });
    await computeEligibility(t.db, { needCardId: "nc_1" });
    // Both relate to one anchor, which is enough since 14 Nov; the role no longer decides it.
    expect(await eligibleIds("nc_1")).toEqual(["tal_a", "tal_b"]);
  });

  it("M5: two nice-to-have anchors and no must-have is eligible", async () => {
    await pool();
    const reqs = three();
    reqs[0].kind = "nice";
    reqs[1].kind = "nice";
    reqs[2].kind = "must";
    await addNeed(t.db, { id: "nc_1", jobId, requirements: reqs });
    await computeEligibility(t.db, { needCardId: "nc_1" });
    expect(await eligibleIds("nc_1")).toContain("tal_b");
  });

  it("M6: changing every requirement from must to nice changes nothing", async () => {
    await pool();
    await addNeed(t.db, { id: "nc_1", jobId, requirements: three() });
    await computeEligibility(t.db, { needCardId: "nc_1" });
    const before = (await rowsFor("nc_1")).map((r) => [r.talentId, r.eligible, r.touchedRequirementIds]).sort();
    const [row] = await t.db.select().from(needCard).where(eq(needCard.id, "nc_1"));
    const flipped = { ...row.body, requirements: row.body.requirements.map((r) => ({ ...r, kind: "nice" as const })) };
    await t.db.update(needCard).set({ body: flipped }).where(eq(needCard.id, "nc_1"));
    await computeEligibility(t.db, { needCardId: "nc_1" });
    const after = (await rowsFor("nc_1")).map((r) => [r.talentId, r.eligible, r.touchedRequirementIds]).sort();
    expect(after).toEqual(before);
  });

  it("M7: a language requirement neither includes nor excludes anyone", async () => {
    await pool();
    await addPerson(t.db, { id: "tal_e", signals: [{ id: "s1", phrase: "Python", escoUri: python }, { id: "s2", phrase: "SQL", escoUri: sqlUri }], languages: [{ code: "fi", basis: "declared" }] });
    const finnish = req("r4", "Fluent Finnish", { category: "language", languageCode: "fi" });
    await addNeed(t.db, { id: "nc_1", jobId, requirements: [...three(), finnish] });
    await computeEligibility(t.db, { needCardId: "nc_1" });
    // tal_b has the same anchors as tal_e but no Finnish; both are eligible, and so is everyone
    // else who relates to an anchor.
    expect(await eligibleIds("nc_1")).toEqual(["tal_a", "tal_b", "tal_c", "tal_e"]);
    // And Finnish alone makes no one eligible.
    await addNeed(t.db, { id: "nc_2", jobId: await jobIdByTitle(t.db, "UX Designer"), requirements: [finnish] });
    await computeEligibility(t.db, { needCardId: "nc_2" });
    expect(await eligibleIds("nc_2")).toEqual([]);
  });

  it("exposes no count: no count column, and only a row total is returned", async () => {
    await pool();
    await addNeed(t.db, { id: "nc_1", jobId, requirements: three() });
    const result = await computeEligibility(t.db, { needCardId: "nc_1" });
    expect(Object.keys(result)).toEqual(["rows"]);
    const cols = rowsOf<{ column_name: string }>(
      await t.db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'eligibility'`),
    ).map((c) => c.column_name);
    expect(cols.sort()).toEqual(
      ["card_version", "computed_at", "eligible", "exclusion", "need_card_id", "need_card_version", "talent_id", "touched_requirement_ids"].sort(),
    );
    for (const row of await rowsFor("nc_1")) {
      expect(Object.keys(row).filter((k) => /count|score|rank|overlap|weight|similarity/i.test(k))).toEqual([]);
    }
  });

  it("only people in the pool with an approved card get rows", async () => {
    await pool();
    await addPerson(t.db, { id: "tal_out", inPool: false, signals: [{ id: "s1", phrase: "Python", escoUri: python }, { id: "s2", phrase: "SQL", escoUri: sqlUri }] });
    await addNeed(t.db, { id: "nc_1", jobId, requirements: three() });
    await computeEligibility(t.db, { needCardId: "nc_1" });
    expect((await rowsFor("nc_1")).map((r) => r.talentId)).not.toContain("tal_out");
  });

  it("is idempotent and leaves the picks code's exclusion alone", async () => {
    await pool();
    await addNeed(t.db, { id: "nc_1", jobId, requirements: three() });
    await computeEligibility(t.db, { needCardId: "nc_1" });
    const first = (await rowsFor("nc_1")).map((r) => [r.talentId, r.eligible, r.touchedRequirementIds]).sort();
    await t.db.update(eligibility).set({ exclusion: "intro_open" }).where(eq(eligibility.talentId, "tal_b"));
    const again = await computeEligibility(t.db, { needCardId: "nc_1" });
    expect(again.rows).toBe(4);
    const rows = await rowsFor("nc_1");
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => [r.talentId, r.eligible, r.touchedRequirementIds]).sort()).toEqual(first);
    expect(rows.find((r) => r.talentId === "tal_b")?.exclusion).toBe("intro_open");
  });

  it("for one person against every need, and removes rows when the person leaves the pool", async () => {
    await pool();
    await addNeed(t.db, { id: "nc_1", jobId, requirements: three() });
    await addNeed(t.db, { id: "nc_2", jobId: await jobIdByTitle(t.db, "UX Designer"), requirements: [req("r9", "Python", { escoSkillUris: [python] })] });
    expect(await computeEligibility(t.db, { talentId: "tal_b" })).toEqual({ rows: 2 });
    expect(await eligibleIds("nc_1")).toEqual(["tal_b"]);
    expect(await eligibleIds("nc_2")).toEqual(["tal_b"]);
    await t.db.update(talent).set({ inPool: false }).where(eq(talent.id, "tal_b"));
    expect(await computeEligibility(t.db, { talentId: "tal_b" })).toEqual({ rows: 0 });
    expect(await rowsFor("nc_1")).toHaveLength(0);
  });

  it("audits eligibility.computed with a row total only", async () => {
    await pool();
    await addNeed(t.db, { id: "nc_1", jobId, requirements: three() });
    await computeEligibility(t.db, { needCardId: "nc_1" });
    const events = await audit_rows(t.db, "eligibility.computed");
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].detail).toEqual({ rows: 4 });
  });

  it("twins with identical signals and different handles get identical rows", async () => {
    await addPerson(t.db, { id: "tal_t1", handle: "Birch-11", signals: [{ id: "s1", phrase: "Python", escoUri: python }, { id: "s2", phrase: "SQL", escoUri: sqlUri }] });
    await addPerson(t.db, { id: "tal_t2", handle: "Aspen-99", signals: [{ id: "s1", phrase: "Python", escoUri: python }, { id: "s2", phrase: "SQL", escoUri: sqlUri }] });
    await addNeed(t.db, { id: "nc_1", jobId, requirements: three() });
    await computeEligibility(t.db, { needCardId: "nc_1" });
    const [a, b] = await Promise.all(["tal_t1", "tal_t2"].map(async (id) => (await rowsFor("nc_1")).find((r) => r.talentId === id)!));
    expect([a.eligible, a.touchedRequirementIds]).toEqual([b.eligible, b.touchedRequirementIds]);
  });
});
