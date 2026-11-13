import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { digest, pick, signalCard } from "@/db/schema";
import { resetLlmState, setLlmFake } from "@/lib/llm";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";

vi.mock("@/features/card", async () => {
  const mock = await import("./card-mock");
  return {
    cardForOrganiser: async (_db: unknown, id: string) => mock.organiserCard(id),
    cardForCompany: async (_db: unknown, id: string) => mock.companyCard(id),
    cardForCompanyRevealed: async (_db: unknown, id: string) => mock.revealedCard(id),
  };
});

import { decidePick, publishDigest } from "./decisions";
import { draftDailyDigests } from "./draft";
import { addCompany, addEligibility, addNeed, addTalent, resetDb, setSetting } from "./test-helpers";

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
];
const SIGNALS = [
  { id: "s1", phrase: "Python data pipelines", escoUri: "esco:python" },
  { id: "s2", phrase: "SQL queries" },
];

describe("cap counts locked digests of today (matching.md 3.3)", () => {
  it("does not draft a person a third time today when their other picks sit in decided digests", async () => {
    await setSetting(t.db, "maxPicksPerDay", 2);
    for (const c of ["co_1", "co_2", "co_3"]) {
      await addCompany(t.db, { id: c });
      await addNeed(t.db, { id: `nc_${c}`, companyId: c, requirements: REQS });
    }
    await addTalent(t.db, { id: "tal_a", signals: SIGNALS });
    for (const n of ["nc_co_2", "nc_co_3"]) await addEligibility(t.db, { needCardId: n, talentId: "tal_a", touched: ["req_1"] });
    await draftDailyDigests(t.db, DATE);
    await t.db.update(pick).set({ status: "approved", decidedBy: "organiser", decidedAt: new Date() });
    await addEligibility(t.db, { needCardId: "nc_co_1", talentId: "tal_a", touched: ["req_1"] });
    await draftDailyDigests(t.db, DATE);
    const rows = await t.db.select().from(pick).where(eq(pick.talentId, "tal_a"));
    expect(rows).toHaveLength(2);
  });
});

describe("purge_after is compared with the time of the run", () => {
  it("leaves out a person whose retention ended earlier on the digest day", async () => {
    await addCompany(t.db, { id: "co_1" });
    await addNeed(t.db, { id: "nc_1", companyId: "co_1", requirements: REQS });
    for (const [id, purgeAfter] of [["tal_ok", undefined], ["tal_expired", new Date("2026-11-20T10:00:00Z")]] as const) {
      await addTalent(t.db, { id, signals: SIGNALS, purgeAfter });
      await addEligibility(t.db, { needCardId: "nc_1", talentId: id, touched: ["req_1"] });
    }
    await draftDailyDigests(t.db, DATE, new Date("2026-11-20T11:00:00Z"));
    const rows = await t.db.select().from(pick);
    expect(rows.map((r) => r.talentId)).toEqual(["tal_ok"]);
  });
});

describe("drafting never undoes a decision made while it runs", () => {
  it("keeps an approved pick and a published digest when the organiser acts during the model calls", async () => {
    await addCompany(t.db, { id: "co_1" });
    await addNeed(t.db, { id: "nc_1", companyId: "co_1", requirements: REQS });
    for (const id of ["tal_a", "tal_b"]) {
      await addTalent(t.db, { id, signals: SIGNALS });
      await addEligibility(t.db, { needCardId: "nc_1", talentId: id, touched: ["req_1", "req_2"] });
    }
    await draftDailyDigests(t.db, DATE);
    const first = await t.db.select().from(pick);
    const a = first.find((p) => p.talentId === "tal_a")!;
    const b = first.find((p) => p.talentId === "tal_b")!;
    // tal_a's card moves on, so the next run wants to re-select.
    await t.db.update(signalCard).set({ version: 2, body: { ...(await t.db.select().from(signalCard).where(eq(signalCard.talentId, "tal_a")))[0].body, version: 2 } }).where(eq(signalCard.talentId, "tal_a"));
    await addEligibility(t.db, { needCardId: "nc_1", talentId: "tal_a", touched: ["req_1", "req_2"], needCardVersion: 1, cardVersion: 2 }).catch(() => undefined);
    let acted = false;
    setLlmFake(async () => {
      if (!acted) {
        acted = true;
        await decidePick(t.db, { pickId: b.id, decision: "approve" });
        await decidePick(t.db, { pickId: a.id, decision: "remove", reasonCode: "duplicate" });
        await publishDigest(t.db, a.digestId);
      }
      return {};
    });
    await draftDailyDigests(t.db, DATE);
    const rows = await t.db.select().from(pick).where(eq(pick.digestId, a.digestId));
    expect(rows.find((p) => p.id === b.id)?.status).toBe("approved");
    expect(rows.find((p) => p.id === a.id)?.status).toBe("removed");
    expect(rows.every((p) => p.status !== "suggested")).toBe(true);
    const [d] = await t.db.select().from(digest).where(and(eq(digest.id, a.digestId)));
    expect(d.status).toBe("published");
  });
});
