import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { runReadyJobs, enqueue } from "@/lib/queue";
import { computePoolEvidence } from "./pool";
import { getNeedCard, recomputePoolEvidence } from "./index";
import { jobs as needJobs } from "./jobs";
import { addCompany, addEligibility, addJobRow, addTalent, makeCard } from "./test-helpers";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

const NOW = new Date("2026-11-14T06:02:11Z");
const PY = "http://esco/python";

async function setup() {
  const jobId = await addJobRow(t.db, { sentences: ["Python", "Finnish", "Kubernetes", "Work permit"] });
  const { id: companyId } = await addCompany(t.db);
  return { jobId, companyId };
}

describe("pool counts on a hand-built pool", () => {
  it("N8: pool of 10, relevant 6, 4 touch Python by ESCO URI: speakTo 4, exclude 2", async () => {
    const { jobId, companyId } = await setup();
    const card = await makeCard(t.db, {
      jobId,
      companyId,
      requirements: [{ text: "Python programming", category: "skill", escoSkillUris: [PY] }],
    });
    const ids: string[] = [];
    // six eligible people: four with a Python signal (matching by URI, with unrelated wording)
    for (let i = 0; i < 4; i++) ids.push(await addTalent(t.db, { signals: [{ phrase: `scripting number ${i}`, escoUri: PY }] }));
    for (let i = 0; i < 2; i++) ids.push(await addTalent(t.db, { signals: [{ phrase: "welding" }] }));
    // four more in the pool who are not eligible, one of whom does touch Python
    const outsiders = [
      await addTalent(t.db, { signals: [{ phrase: "x", escoUri: PY }] }),
      await addTalent(t.db),
      await addTalent(t.db),
      await addTalent(t.db),
    ];
    await addEligibility(t.db, card.id, 1, ids);
    await addEligibility(t.db, card.id, 1, outsiders, false);

    const evidence = await computePoolEvidence(t.db, card, NOW);
    const pool = evidence.get(card.requirements[0]!.id);
    expect(pool).toEqual({
      scope: "relevant",
      relevant: 6,
      speakTo: 4,
      hardFilterWouldExclude: 2,
      selfDeclaredOnly: null,
      computedAt: NOW.toISOString(),
    });
  });

  it("counts by phrase when there is no ESCO match, and ignores proposed or removed signals", async () => {
    const { jobId, companyId } = await setup();
    const card = await makeCard(t.db, {
      jobId,
      companyId,
      requirements: [
        { text: "Kubernetes", category: "skill" },
        { text: "Team player", category: "other" },
        { text: "Valid driving licence", category: "authorisation", statutory: "licence" },
      ],
    });
    const a = await addTalent(t.db, { signals: [{ phrase: "Kubernetes" }] });
    const b = await addTalent(t.db, { signals: [{ phrase: "Kubernetes", status: "proposed" }] });
    const c = await addTalent(t.db, { signals: [{ phrase: "Kubernetes", status: "removed" }] });
    const d = await addTalent(t.db, { signals: [{ phrase: "team player" }, { phrase: "driving licence" }] });
    await addEligibility(t.db, card.id, 1, [a, b, c, d]);
    const ev = await computePoolEvidence(t.db, card, NOW);
    const [k, team, licence] = card.requirements.map((r) => ev.get(r.id)!);
    expect(k).toMatchObject({ speakTo: 1, hardFilterWouldExclude: 3, relevant: 4 });
    expect(team).toMatchObject({ speakTo: 1, hardFilterWouldExclude: 3 });
    // statutory: counted, but the exclusion is never produced
    expect(licence).toMatchObject({ speakTo: 1, hardFilterWouldExclude: null });
  });

  it("N10: a declared work language counts and is reported separately; evidenced wins over declared", async () => {
    const { jobId, companyId } = await setup();
    const card = await makeCard(t.db, {
      jobId,
      companyId,
      requirements: [{ text: "Fluent Finnish", category: "language", languageCode: "fi" }],
    });
    const evidenced = await addTalent(t.db, { languages: [{ code: "fi", basis: "evidenced" }] });
    const declaredOnly = await addTalent(t.db, { languages: [{ code: "fi", basis: "declared" }] }); // no Finnish signal
    const both = await addTalent(t.db, {
      languages: [
        { code: "fi", basis: "declared" },
        { code: "fi", basis: "evidenced" },
      ],
    });
    const other = await addTalent(t.db, { languages: [{ code: "sv", basis: "evidenced" }] });
    const none = await addTalent(t.db, { signals: [{ phrase: "Finnish" }] }); // a signal is not a language row
    await addEligibility(t.db, card.id, 1, [evidenced, declaredOnly, both, other, none]);
    const pool = (await computePoolEvidence(t.db, card, NOW)).get(card.requirements[0]!.id)!;
    expect(pool).toMatchObject({ relevant: 5, speakTo: 3, selfDeclaredOnly: 1, hardFilterWouldExclude: 2 });
  });

  it("hides the exclusion number for a statutory language requirement but keeps speakTo", async () => {
    const { jobId, companyId } = await setup();
    const card = await makeCard(t.db, {
      jobId,
      companyId,
      requirements: [{ text: "Fluent Finnish", category: "language", languageCode: "fi", statutory: "language_act" }],
    });
    const a = await addTalent(t.db, { languages: [{ code: "fi", basis: "evidenced" }] });
    const b = await addTalent(t.db);
    await addEligibility(t.db, card.id, 1, [a, b]);
    const pool = (await computePoolEvidence(t.db, card, NOW)).get(card.requirements[0]!.id)!;
    expect(pool.speakTo).toBe(1);
    expect(pool.hardFilterWouldExclude).toBeNull();
    expect(pool.selfDeclaredOnly).toBe(0);
  });

  it("never counts a work-permit requirement", async () => {
    const { jobId, companyId } = await setup();
    const card = await makeCard(t.db, {
      jobId,
      companyId,
      requirements: [
        { text: "Right to work in Finland", category: "authorisation", statutory: "other_law", postingSentence: 3 },
        { text: "Valid permit to work", category: "authorisation", statutory: "other_law", postingSentence: 3 }, // permit only in the sentence
        { text: "Vaccination cover", category: "authorisation", statutory: "other_law", postingSentence: 0 },
      ],
    });
    // the posting's sentence 3 says "Work permit"
    const a = await addTalent(t.db, { signals: [{ phrase: "work permit" }] });
    await addEligibility(t.db, card.id, 1, [a]);
    const { job } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await t.db.select().from(job).where(eq(job.id, jobId));
    const ev = await computePoolEvidence(t.db, card, NOW, row!.sentences);
    expect(ev.get(card.requirements[0]!.id)).toBeNull();
    expect(ev.get(card.requirements[1]!.id)).toBeNull();
    expect(ev.get(card.requirements[2]!.id)).not.toBeNull(); // a legal duty that is not a permit is counted, exclusion hidden
    expect(ev.get(card.requirements[2]!.id)!.hardFilterWouldExclude).toBeNull();
  });

  it("only counts people in the pool: opted in, approved card, not purged, eligibility of this version only", async () => {
    const { jobId, companyId } = await setup();
    const card = await makeCard(t.db, {
      jobId,
      companyId,
      version: 2,
      requirements: [{ text: "Python programming", escoSkillUris: [PY] }],
    });
    const good = await addTalent(t.db, { signals: [{ phrase: "p", escoUri: PY }] });
    const notInPool = await addTalent(t.db, { inPool: false, signals: [{ phrase: "p", escoUri: PY }] });
    const noCard = await addTalent(t.db, { approved: false, signals: [{ phrase: "p", escoUri: PY }] });
    const purged = await addTalent(t.db, { purgeAfter: new Date("2026-11-14T00:00:00Z"), signals: [{ phrase: "p", escoUri: PY }] });
    const notYetPurged = await addTalent(t.db, { purgeAfter: new Date("2026-11-15T00:00:00Z") });
    await addEligibility(t.db, card.id, 2, [good, notInPool, noCard, purged, notYetPurged]);
    await addEligibility(t.db, card.id, 1, [await addTalent(t.db)]); // an older version
    const pool = (await computePoolEvidence(t.db, card, NOW)).get(card.requirements[0]!.id)!;
    expect(pool).toMatchObject({ scope: "relevant", relevant: 2, speakTo: 1, hardFilterWouldExclude: 1 });
  });

  it("N15: with nobody eligible, counts the whole pool and has no exclusion number", async () => {
    const { jobId, companyId } = await setup();
    const card = await makeCard(t.db, { jobId, companyId, requirements: [{ text: "Kubernetes experience" }] });
    // Everyone from the earlier tests is still in this shared pool, so count it first.
    const before = await computePoolEvidence(t.db, card, NOW);
    const total = before.get(card.requirements[0]!.id)!.relevant;
    await addTalent(t.db, { signals: [{ phrase: "Kubernetes experience" }] });
    const pool = (await computePoolEvidence(t.db, card, NOW)).get(card.requirements[0]!.id)!;
    expect(pool.scope).toBe("whole_pool");
    expect(pool.relevant).toBe(total + 1);
    expect(pool.hardFilterWouldExclude).toBeNull();
    expect(pool.speakTo).toBe(before.get(card.requirements[0]!.id)!.speakTo + 1);
  });

  it("N9: two people with identical card rows and different interview languages give identical numbers", async () => {
    const { jobId, companyId } = await setup();
    const card = await makeCard(t.db, {
      jobId,
      companyId,
      requirements: [
        { text: "Python programming", escoSkillUris: [PY] },
        { text: "Fluent Finnish", category: "language", languageCode: "fi" },
      ],
    });
    const rows = {
      signals: [{ phrase: "Python scripting", escoUri: PY }],
      languages: [{ code: "fi", basis: "declared" as const }],
    };
    const other = await addTalent(t.db, { signals: [{ phrase: "welding" }] });
    const a = await addTalent(t.db, { ...rows, personaKey: "p07" });
    await addEligibility(t.db, card.id, 1, [a, other]);
    const withA = await computePoolEvidence(t.db, card, NOW);
    // swap persona A for twin B: same rows, a different person (and interview language, which is never read)
    const b = await addTalent(t.db, { ...rows, personaKey: "p07" });
    const { eligibility } = await import("@/db/schema");
    const { eq, and } = await import("drizzle-orm");
    await t.db.update(eligibility).set({ talentId: b }).where(and(eq(eligibility.needCardId, card.id), eq(eligibility.talentId, a)));
    const { talent } = await import("@/db/schema");
    await t.db.update(talent).set({ inPool: false }).where(eq(talent.id, a));
    const withB = await computePoolEvidence(t.db, card, NOW);
    expect([...withB.entries()]).toEqual([...withA.entries()]);
  });

  it("N11: changing must to nice changes no count", async () => {
    const { jobId, companyId } = await setup();
    const card = await makeCard(t.db, { jobId, companyId, requirements: [{ text: "Python programming", escoSkillUris: [PY] }] });
    const a = await addTalent(t.db, { signals: [{ phrase: "p", escoUri: PY }] });
    const b = await addTalent(t.db);
    await addEligibility(t.db, card.id, 1, [a, b]);
    const must = await computePoolEvidence(t.db, card, NOW);
    const nice = await computePoolEvidence(
      t.db,
      { ...card, requirements: card.requirements.map((r) => ({ ...r, kind: "nice" as const })) },
      NOW,
    );
    expect([...nice.entries()]).toEqual([...must.entries()]);
  });
});

describe("recomputePoolEvidence", () => {
  it("stores the counts with computedAt on each requirement without changing the version", async () => {
    const { jobId, companyId } = await setup();
    const card = await makeCard(t.db, {
      jobId,
      companyId,
      version: 3,
      requirements: [{ text: "Python programming", escoSkillUris: [PY] }, { text: "Right to work", category: "authorisation", statutory: "other_law" }],
    });
    const a = await addTalent(t.db, { signals: [{ phrase: "p", escoUri: PY }] });
    await addEligibility(t.db, card.id, 3, [a]);
    await recomputePoolEvidence(t.db, card.id, { now: NOW });
    const stored = (await getNeedCard(t.db, card.id))!;
    expect(stored.version).toBe(3);
    expect(stored.requirements[0]!.pool).toMatchObject({ scope: "relevant", relevant: 1, speakTo: 1, computedAt: NOW.toISOString() });
    expect(stored.requirements[1]!.pool).toBeNull();
  });

  it("runs from the needs.recompute_pool queue job, and ignores an unknown card", async () => {
    const { jobId, companyId } = await setup();
    const card = await makeCard(t.db, { jobId, companyId, requirements: [{ text: "Python programming", escoSkillUris: [PY] }] });
    await enqueue(t.db, "needs.recompute_pool", { needCardId: card.id });
    await enqueue(t.db, "needs.recompute_pool", { needCardId: "nc_missing" });
    expect(await runReadyJobs(t.db, needJobs)).toBe(2);
    expect((await getNeedCard(t.db, card.id))!.requirements[0]!.pool).not.toBeNull();
  });
});
