import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, digest, pick } from "@/db/schema";
import { resetLlmState, setLlmFake } from "@/lib/llm";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { draftDailyDigests, selectionSeed } from "./draft";
import {
  addCompany,
  addEligibility,
  addIntro,
  addNeed,
  addPastPick,
  addTalent,
  resetDb,
  setSetting,
} from "./test-helpers";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());
beforeEach(async () => {
  await resetDb(t.db);
});
afterEach(() => resetLlmState());

const DATE = "2026-11-20";
const REQS = [
  { id: "req_1", text: "Python programming", escoSkillUris: ["esco:python"] },
  { id: "req_2", text: "SQL queries" },
  { id: "req_3", text: "Apache Airflow", kind: "nice" as const },
];
const SIGNALS = [
  { id: "s1", phrase: "Python data pipelines", escoUri: "esco:python" },
  { id: "s2", phrase: "SQL queries" },
];

/** One company with one need, and `n` eligible people (tal_a, tal_b, ...), all touching Python and SQL. */
async function world(people: string[], opts: { company?: string; need?: string; touched?: string[] } = {}) {
  const companyId = opts.company ?? "co_1";
  const needId = opts.need ?? "nc_1";
  await addCompany(t.db, { id: companyId });
  await addNeed(t.db, { id: needId, companyId, requirements: REQS });
  for (const p of people) {
    await addTalent(t.db, { id: p, signals: SIGNALS });
    await addEligibility(t.db, { needCardId: needId, talentId: p, touched: opts.touched ?? ["req_1", "req_2"] });
  }
}

const picksOf = async (needId = "nc_1") =>
  (
    await t.db
      .select({ talentId: pick.talentId })
      .from(pick)
      .innerJoin(digest, eq(digest.id, pick.digestId))
      .where(and(eq(pick.needCardId, needId), eq(digest.date, DATE)))
  )
    .map((p) => p.talentId)
    .sort();
const count = async (action: string) =>
  (await t.db.select().from(auditLog).where(eq(auditLog.action, action))).length;

describe("draftDailyDigests", () => {
  it("drafts one draft digest per company with a seed, and a pick per eligible person with its selection recorded", async () => {
    await world(["tal_a", "tal_b", "tal_c"]);
    const result = await draftDailyDigests(t.db, DATE);
    expect(result).toEqual({ digests: 1, picks: 3 });

    const [d] = await t.db.select().from(digest);
    expect(d).toMatchObject({ companyId: "co_1", date: DATE, status: "draft", emptyNeeds: [] });
    expect(d.seed).toMatch(/^[0-9a-f]{64}$/);

    const rows = await t.db.select().from(pick);
    expect(rows).toHaveLength(3);
    for (const p of rows) {
      expect(p).toMatchObject({ status: "suggested", origin: "agent", needCardVersion: 1, cardVersion: 1 });
      expect(p.selection).toEqual({
        seed: selectionSeed("no-event", DATE, "co_1", "nc_1"),
        lastDraftedBefore: null,
        pass: 1,
      });
      expect(p.body.reasons.length).toBeGreaterThan(0);
      // Requirement 3 (Airflow) is not touched; the pick says so, by id.
      expect(p.body.notMentioned).toEqual(["req_3"]);
    }
    expect(await count("digest.drafted")).toBe(1);
    expect(await count("pick.drafted")).toBe(3);
  });

  describe("who is chosen (matching.md 3.3)", () => {
    async function exposureWorld() {
      await world(["tal_a", "tal_b", "tal_c", "tal_d", "tal_e"]);
      await addCompany(t.db, { id: "co_other" });
      await addNeed(t.db, { id: "nc_0", companyId: "co_other", requirements: REQS });
      // tal_a was last suggested long ago (elsewhere), tal_b recently; c, d, e never.
      await addPastPick(t.db, { digestDate: "2026-10-01", companyId: "co_other", needCardId: "nc_0", talentId: "tal_a", createdAt: new Date("2026-10-01T06:00:00Z") });
      await addPastPick(t.db, { digestDate: "2026-11-18", companyId: "co_other", needCardId: "nc_0", talentId: "tal_b", createdAt: new Date("2026-11-18T06:00:00Z") });
    }

    it("takes people nobody has suggested yet before those who were", async () => {
      await exposureWorld();
      await setSetting(t.db, "digestSize", 3);
      await draftDailyDigests(t.db, DATE);
      expect(await picksOf()).toEqual(["tal_c", "tal_d", "tal_e"]);
    });

    it("then the least recently suggested: tal_a before tal_b", async () => {
      await exposureWorld();
      await setSetting(t.db, "digestSize", 4);
      await draftDailyDigests(t.db, DATE);
      expect(await picksOf()).toEqual(["tal_a", "tal_c", "tal_d", "tal_e"]);
      const a = (await t.db.select().from(pick).where(eq(pick.talentId, "tal_a")))
        .find((p) => p.needCardId === "nc_1");
      expect(a?.selection?.lastDraftedBefore).toBe("2026-10-01T06:00:00.000Z");
    });
  });

  it("does not suggest the same company again inside the rotation window unless it must fill up", async () => {
    await world(["tal_a", "tal_b", "tal_c"]);
    await setSetting(t.db, "digestSize", 2);
    await addPastPick(t.db, { digestDate: "2026-11-18", companyId: "co_1", needCardId: "nc_1", talentId: "tal_a", createdAt: new Date("2026-11-18T06:00:00Z"), status: "removed" });
    await draftDailyDigests(t.db, DATE);
    // tal_a was suggested to this company two days ago, so b and c fill the two places.
    expect(await picksOf()).toEqual(["tal_b", "tal_c"]);
    const rows = await t.db.select().from(pick).where(eq(pick.status, "suggested"));
    expect(rows).toHaveLength(2);
    expect(rows.every((p) => p.selection?.pass === 1)).toBe(true);
  });

  it("fills from the recent ones in a second pass when the others are not enough", async () => {
    await world(["tal_a", "tal_b"]);
    await addPastPick(t.db, { digestDate: "2026-11-18", companyId: "co_1", needCardId: "nc_1", talentId: "tal_a", createdAt: new Date("2026-11-18T06:00:00Z") });
    await draftDailyDigests(t.db, DATE);
    const rows = await t.db.select().from(pick).where(eq(pick.digestId, (await t.db.select().from(digest).where(eq(digest.date, DATE)))[0].id));
    expect(rows.map((p) => p.talentId).sort()).toEqual(["tal_a", "tal_b"]);
    expect(rows.find((p) => p.talentId === "tal_a")?.selection?.pass).toBe(2);
    expect(rows.find((p) => p.talentId === "tal_b")?.selection?.pass).toBe(1);
  });

  it("forgets a suggestion once it is older than the rotation window", async () => {
    await world(["tal_a", "tal_b"]);
    await setSetting(t.db, "digestSize", 1);
    // Ten days ago is outside the 7-day window, so tal_a counts as "suggested long ago", not "recent".
    await addPastPick(t.db, { digestDate: "2026-11-10", companyId: "co_1", needCardId: "nc_1", talentId: "tal_a", createdAt: new Date("2026-11-10T06:00:00Z") });
    await draftDailyDigests(t.db, DATE);
    const rows = await t.db.select().from(pick).where(eq(pick.status, "suggested"));
    expect(rows).toHaveLength(1);
    // tal_b was never suggested, so tal_b goes first, in pass 1.
    expect(rows[0]).toMatchObject({ talentId: "tal_b" });
    expect(rows[0].selection?.pass).toBe(1);
  });

  it("never gives one person more than the daily maximum of picks across companies", async () => {
    await setSetting(t.db, "maxPicksPerDay", 2);
    for (const c of ["co_1", "co_2", "co_3"]) {
      await addCompany(t.db, { id: c });
      await addNeed(t.db, { id: `nc_${c}`, companyId: c, requirements: REQS });
    }
    await addTalent(t.db, { id: "tal_a", signals: SIGNALS });
    for (const c of ["co_1", "co_2", "co_3"]) {
      await addEligibility(t.db, { needCardId: `nc_${c}`, talentId: "tal_a", touched: ["req_1", "req_2"] });
    }
    const result = await draftDailyDigests(t.db, DATE);
    expect(result.digests).toBe(3);
    expect(result.picks).toBe(2);
    // Processed in need id order, so the third company gets nobody (eligible but capped).
    expect(await picksOf("nc_co_3")).toEqual([]);
    const [third] = await t.db.select().from(digest).where(eq(digest.companyId, "co_3"));
    expect(third.emptyNeeds).toEqual([]);
  });

  it("lists a need nobody is eligible for in emptyNeeds, and still makes the digest", async () => {
    await addCompany(t.db, { id: "co_1" });
    await addNeed(t.db, { id: "nc_1", companyId: "co_1", requirements: REQS });
    await addTalent(t.db, { id: "tal_a", signals: SIGNALS });
    await addEligibility(t.db, { needCardId: "nc_1", talentId: "tal_a", touched: ["req_1"], eligible: false });
    expect(await draftDailyDigests(t.db, DATE)).toEqual({ digests: 1, picks: 0 });
    const [d] = await t.db.select().from(digest);
    expect(d.emptyNeeds).toEqual(["nc_1"]);
  });

  it("leaves out people who are not in the pool, whose card is out of date, or whose row is for another need version", async () => {
    await world(["tal_ok"]);
    await addTalent(t.db, { id: "tal_out", inPool: false, signals: SIGNALS });
    await addEligibility(t.db, { needCardId: "nc_1", talentId: "tal_out", touched: ["req_1", "req_2"] });
    await addTalent(t.db, { id: "tal_oldcard", version: 2, signals: SIGNALS });
    await addEligibility(t.db, { needCardId: "nc_1", talentId: "tal_oldcard", touched: ["req_1", "req_2"], cardVersion: 1 });
    await addTalent(t.db, { id: "tal_purged", signals: SIGNALS, purgeAfter: new Date("2026-11-01T00:00:00Z") });
    await addEligibility(t.db, { needCardId: "nc_1", talentId: "tal_purged", touched: ["req_1", "req_2"] });
    await draftDailyDigests(t.db, DATE);
    expect(await picksOf()).toEqual(["tal_ok"]);
  });

  it("skips stale needs and companies that are not participating", async () => {
    await world(["tal_a"]);
    await addCompany(t.db, { id: "co_2", participating: false });
    await addNeed(t.db, { id: "nc_2", companyId: "co_2", requirements: REQS });
    await addEligibility(t.db, { needCardId: "nc_2", talentId: "tal_a", touched: ["req_1", "req_2"] });
    await addCompany(t.db, { id: "co_3" });
    await addNeed(t.db, { id: "nc_3", companyId: "co_3", status: "stale", requirements: REQS });
    await addEligibility(t.db, { needCardId: "nc_3", talentId: "tal_a", touched: ["req_1", "req_2"] });
    expect(await draftDailyDigests(t.db, DATE)).toEqual({ digests: 1, picks: 1 });
  });

  describe("exclusions from open and recent introductions (M14)", () => {
    it.each([
      ["pending_review", true],
      ["awaiting_talent", true],
      ["awaiting_company", true],
      ["accepted", true],
      ["declined", true],
      ["withdrawn", false],
      ["expired", false],
      ["cancelled", false],
    ] as const)("intro %s with this company: excluded = %s", async (status, excluded) => {
      await world(["tal_a", "tal_b"]);
      await addIntro(t.db, {
        id: "intro_1",
        talentId: "tal_a",
        companyId: "co_1",
        status,
        respondedAt: new Date("2026-11-10T00:00:00Z"),
      });
      await draftDailyDigests(t.db, DATE);
      expect(await picksOf()).toEqual(excluded ? ["tal_b"] : ["tal_a", "tal_b"]);
    });

    it("a decline older than 30 days no longer excludes", async () => {
      await world(["tal_a"]);
      await addIntro(t.db, { id: "intro_1", talentId: "tal_a", companyId: "co_1", status: "declined", respondedAt: new Date("2026-10-01T00:00:00Z") });
      await draftDailyDigests(t.db, DATE);
      expect(await picksOf()).toEqual(["tal_a"]);
    });

    it("an intro with another company does not exclude", async () => {
      await world(["tal_a"]);
      await addCompany(t.db, { id: "co_2" });
      await addIntro(t.db, { id: "intro_1", talentId: "tal_a", companyId: "co_2", status: "accepted" });
      await draftDailyDigests(t.db, DATE);
      expect(await picksOf()).toEqual(["tal_a"]);
    });
  });

  it("is idempotent: a second run gives the same digests, picks and audit rows (P1, M17)", async () => {
    await world(["tal_a", "tal_b", "tal_c"]);
    await draftDailyDigests(t.db, DATE);
    const first = {
      digests: await t.db.select().from(digest),
      picks: (await t.db.select().from(pick)).map((p) => `${p.id}:${p.talentId}`).sort(),
      audits: await t.db.select().from(auditLog),
    };
    const again = await draftDailyDigests(t.db, DATE);
    expect(again).toEqual({ digests: 1, picks: 3 });
    expect((await t.db.select().from(digest)).map((d) => d.id)).toEqual(first.digests.map((d) => d.id));
    expect((await t.db.select().from(pick)).map((p) => `${p.id}:${p.talentId}`).sort()).toEqual(first.picks);
    expect((await t.db.select().from(auditLog)).length).toBe(first.audits.length);
  });

  it("is idempotent across several companies even though earlier picks feed later ones", async () => {
    await setSetting(t.db, "maxPicksPerDay", 1);
    await world(["tal_a", "tal_b", "tal_c"]);
    await addCompany(t.db, { id: "co_2" });
    await addNeed(t.db, { id: "nc_2", companyId: "co_2", requirements: REQS });
    for (const p of ["tal_a", "tal_b", "tal_c"]) await addEligibility(t.db, { needCardId: "nc_2", talentId: p, touched: ["req_1", "req_2"] });
    await setSetting(t.db, "digestSize", 2);
    await draftDailyDigests(t.db, DATE);
    const before = (await t.db.select().from(pick)).map((p) => `${p.needCardId}:${p.talentId}`).sort();
    await draftDailyDigests(t.db, DATE);
    await draftDailyDigests(t.db, DATE);
    expect((await t.db.select().from(pick)).map((p) => `${p.needCardId}:${p.talentId}`).sort()).toEqual(before);
  });

  describe("a digest with decisions (P2)", () => {
    const decide = async (id: string, status: "approved" | "removed") =>
      t.db.update(pick).set({ status, decidedBy: "organiser", decidedAt: new Date() }).where(eq(pick.id, id));

    it("adds and removes nobody, and leaves decided picks alone", async () => {
      await world(["tal_a", "tal_b"]);
      await draftDailyDigests(t.db, DATE);
      const [first] = await t.db.select().from(pick);
      await decide(first.id, "approved");
      const before = (await t.db.select().from(pick)).map((p) => `${p.id}:${p.status}`).sort();
      // A new person becomes eligible, but the digest is under review now.
      await addTalent(t.db, { id: "tal_new", signals: SIGNALS });
      await addEligibility(t.db, { needCardId: "nc_1", talentId: "tal_new", touched: ["req_1", "req_2"] });
      await draftDailyDigests(t.db, DATE);
      expect((await t.db.select().from(pick)).map((p) => `${p.id}:${p.status}`).sort()).toEqual(before);
    });

    it("refreshes an undecided out-of-date pick while another pick is decided, keeping the person and the id", async () => {
      await world(["tal_a", "tal_b"]);
      await draftDailyDigests(t.db, DATE);
      const picks = await t.db.select().from(pick).orderBy(pick.talentId);
      const [a, b] = picks;
      await decide(a.id, "approved");
      await bumpCard(b.talentId, 2);
      await draftDailyDigests(t.db, DATE);
      const after = await t.db.select().from(pick).orderBy(pick.talentId);
      expect(after.map((p) => p.id)).toEqual([a.id, b.id]);
      expect(after[0]).toMatchObject({ status: "approved", cardVersion: 1 });
      expect(after[1]).toMatchObject({ status: "suggested", cardVersion: 2 });
      expect(after[1].body.reasons.length).toBeGreaterThan(0);
    });

    it("does not touch a decided pick that is out of date", async () => {
      await world(["tal_a", "tal_b"]);
      await draftDailyDigests(t.db, DATE);
      const [a] = await t.db.select().from(pick).orderBy(pick.talentId);
      await decide(a.id, "approved");
      await bumpCard(a.talentId, 2);
      await draftDailyDigests(t.db, DATE);
      const [now] = await t.db.select().from(pick).where(eq(pick.id, a.id));
      expect(now).toMatchObject({ status: "approved", cardVersion: 1 });
    });

    it("leaves an undecided pick that is still current as it is", async () => {
      await world(["tal_a", "tal_b"]);
      await draftDailyDigests(t.db, DATE);
      const [a, b] = await t.db.select().from(pick).orderBy(pick.talentId);
      await decide(a.id, "removed");
      const before = await t.db.select().from(pick).where(eq(pick.id, b.id));
      await draftDailyDigests(t.db, DATE);
      expect(await t.db.select().from(pick).where(eq(pick.id, b.id))).toEqual(before);
    });

    it("keeps an out-of-date pick as it is when the person has no eligibility for the new card yet", async () => {
      await world(["tal_a", "tal_b"]);
      await draftDailyDigests(t.db, DATE);
      const [a, b] = await t.db.select().from(pick).orderBy(pick.talentId);
      await decide(a.id, "approved");
      await t.db.update(signalCard).set({ version: 2 }).where(eq(signalCard.talentId, b.talentId));
      await draftDailyDigests(t.db, DATE);
      const [now] = await t.db.select().from(pick).where(eq(pick.id, b.id));
      expect(now.cardVersion).toBe(1);
    });
  });

  it("never changes a published digest", async () => {
    await world(["tal_a"]);
    await draftDailyDigests(t.db, DATE);
    await t.db.update(digest).set({ status: "published", publishedBy: "organiser", publishedAt: new Date() });
    await addTalent(t.db, { id: "tal_new", signals: SIGNALS });
    await addEligibility(t.db, { needCardId: "nc_1", talentId: "tal_new", touched: ["req_1", "req_2"] });
    await draftDailyDigests(t.db, DATE);
    expect(await picksOf()).toEqual(["tal_a"]);
  });

  it("re-selects an undecided digest when a card has moved on, so no out-of-date reasons linger", async () => {
    await world(["tal_a"]);
    await draftDailyDigests(t.db, DATE);
    const [old] = await t.db.select().from(pick);
    // The person approved a new card version; eligibility was recomputed for it.
    await bumpCard("tal_a", 2);
    await draftDailyDigests(t.db, DATE);
    const [now] = await t.db.select().from(pick);
    expect(now.id).not.toBe(old.id);
    expect(now.cardVersion).toBe(2);
  });

  it("applies the settings stored in app_meta", async () => {
    await world(["tal_a", "tal_b", "tal_c", "tal_d"]);
    await setSetting(t.db, "digestSize", 2);
    await draftDailyDigests(t.db, DATE);
    expect(await picksOf()).toHaveLength(2);
  });

  it("ignores overlap: who is picked does not depend on how many requirements a person touches (M9)", async () => {
    await world(["tal_a", "tal_b"], { touched: ["req_1", "req_2"] });
    await setSetting(t.db, "digestSize", 1);
    await draftDailyDigests(t.db, DATE);
    const first = await picksOf();
    await t.db.delete(pick);
    // tal_a now touches one requirement, tal_b all three: nothing about selection moves.
    await t.db.execute(sqlText(`update eligibility set touched_requirement_ids = '["req_1"]' where talent_id = 'tal_a'`));
    await t.db.execute(sqlText(`update eligibility set touched_requirement_ids = '["req_1","req_2","req_3"]' where talent_id = 'tal_b'`));
    await draftDailyDigests(t.db, DATE);
    expect(await picksOf()).toEqual(first);
  });

  it("words reasons through the model when one is configured, with role analyst and purpose picks.reasons", async () => {
    await world(["tal_a"]);
    const calls: Array<{ role: string; purpose: string }> = [];
    setLlmFake((opts) => {
      calls.push({ role: opts.role, purpose: opts.purpose });
      return { reasons: [{ req: "R1", signal: "S1", text: "The card describes Python data pipelines, which relates to Python programming." }] };
    });
    await draftDailyDigests(t.db, DATE);
    expect(calls).toEqual([{ role: "analyst", purpose: "picks.reasons" }]);
    const [p] = await t.db.select().from(pick);
    expect(p.body.reasons.map((r) => r.requirementId)).toEqual(["req_1"]);
  });

  it("does not call the model again on an unchanged re-run", async () => {
    await world(["tal_a"]);
    let n = 0;
    setLlmFake(() => {
      n++;
      return { reasons: [{ req: "R1", signal: "S1", text: "The card describes Python data pipelines, which relates to Python programming." }] };
    });
    await draftDailyDigests(t.db, DATE);
    await draftDailyDigests(t.db, DATE);
    expect(n).toBe(1);
  });

  it("rejects a malformed date", async () => {
    await expect(draftDailyDigests(t.db, "20 Nov")).rejects.toThrow(/invalid date/);
  });
});

// --- small helpers local to these tests ---
import { sql } from "drizzle-orm";
import { eligibility, signalCard } from "@/db/schema";
const sqlText = (text: string) => sql.raw(text);
async function bumpCard(talentId: string, version: number) {
  await t.db.update(signalCard).set({ version }).where(eq(signalCard.talentId, talentId));
  await t.db.update(eligibility).set({ cardVersion: version }).where(eq(eligibility.talentId, talentId));
}
