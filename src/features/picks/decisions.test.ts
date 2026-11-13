import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, digest, pick, talentIdentity } from "@/db/schema";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";

vi.mock("@/features/card", async () => {
  const mock = await import("./card-mock");
  return {
    cardForOrganiser: async (_db: unknown, id: string) => mock.organiserCard(id),
    cardForCompany: async (_db: unknown, id: string) => mock.companyCard(id),
    cardForCompanyRevealed: async (_db: unknown, id: string) => mock.revealedCard(id),
  };
});

import { DecisionBody, decidePick, publishDigest } from "./decisions";
import { draftDailyDigests } from "./draft";
import { buildReviewQueue } from "./queue-view";
import { addCompany, addEligibility, addNeed, addTalent, resetDb } from "./test-helpers";
import { HttpError } from "@/lib/http";
import { signalCard } from "@/db/schema";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());
beforeEach(async () => {
  await resetDb(t.db);
});

const DATE = "2026-11-20";
const NOW = new Date("2026-11-20T07:00:00Z");
const SIGNALS = [
  { id: "s1", phrase: "Python data pipelines", escoUri: "esco:python" },
  { id: "s2", phrase: "SQL queries" },
];

async function world(people = ["tal_a", "tal_b", "tal_c"]) {
  await addCompany(t.db, { id: "co_1", displayName: "Demo company 07", token: "tok-co-1" });
  await addNeed(t.db, {
    id: "nc_1",
    companyId: "co_1",
    title: "Data engineer at Acme Robotics Oy",
    sentences: ["Acme Robotics builds data pipelines.", "You write Python every day."],
    requirements: [
      { id: "req_1", text: "Python programming", escoSkillUris: ["esco:python"], postingSentence: 1 },
      { id: "req_2", text: "SQL queries", postingSentence: null },
      { id: "req_3", text: "Fluent Finnish", category: "language", languageCode: "fi", statutory: "language_act" },
    ],
  });
  for (const p of people) {
    await addTalent(t.db, { id: p, signals: SIGNALS });
    await addEligibility(t.db, { needCardId: "nc_1", talentId: p, touched: ["req_1", "req_2"] });
  }
  await draftDailyDigests(t.db, DATE);
  const [d] = await t.db.select().from(digest);
  const picks = await t.db.select().from(pick);
  return { digestId: d.id, picks };
}

const status = async (id: string) => (await t.db.select().from(pick).where(eq(pick.id, id)))[0].status;
const audits = async (action: string) => (await t.db.select().from(auditLog).where(eq(auditLog.action, action)));

describe("decision body", () => {
  it("accepts one pick and refuses an array, extra keys, or a removal without a reason (P3, P5)", () => {
    expect(DecisionBody.safeParse({ pickId: "p1", decision: "approve" }).success).toBe(true);
    expect(DecisionBody.safeParse({ pickIds: ["p1", "p2"], decision: "approve" }).success).toBe(false);
    expect(DecisionBody.safeParse({ pickId: ["p1", "p2"], decision: "approve" }).success).toBe(false);
    expect(DecisionBody.safeParse({ pickId: "p1", pickIds: ["p2"], decision: "approve" }).success).toBe(false);
    expect(DecisionBody.safeParse({ pickId: "p1", decision: "remove" }).success).toBe(false);
    expect(DecisionBody.safeParse({ pickId: "p1", decision: "remove", reasonCode: "because" }).success).toBe(false);
    expect(DecisionBody.safeParse({ pickId: "p1", decision: "remove", reasonCode: "evidence_thin" }).success).toBe(true);
    expect(DecisionBody.safeParse({ pickId: "p1", decision: "approve_all" }).success).toBe(false);
  });
});

describe("decidePick", () => {
  it("approves one pick and audits it with ids only", async () => {
    const { picks } = await world();
    await decidePick(t.db, { pickId: picks[0].id, decision: "approve" }, { now: NOW });
    expect(await status(picks[0].id)).toBe("approved");
    expect(await status(picks[1].id)).toBe("suggested");
    const [row] = await t.db.select().from(pick).where(eq(pick.id, picks[0].id));
    expect(row).toMatchObject({ decidedBy: "organiser" });
    expect(row.decidedAt).toEqual(NOW);
    const [a] = await audits("pick.approved");
    expect(a).toMatchObject({ actor: "organiser", subjectType: "pick", subjectId: picks[0].id });
    expect(a.detail).toEqual({ pickId: picks[0].id, digestId: picks[0].digestId, needCardId: "nc_1" });
  });

  it("removes with a reason code, keeps the note on the pick and leaves the note out of the audit row", async () => {
    const { picks } = await world();
    await decidePick(t.db, { pickId: picks[0].id, decision: "remove", reasonCode: "other", note: "Spoke to them last week" }, { now: NOW });
    const [row] = await t.db.select().from(pick).where(eq(pick.id, picks[0].id));
    expect(row).toMatchObject({ status: "removed", reasonCode: "other", decisionNote: "Spoke to them last week" });
    const [a] = await audits("pick.removed");
    expect(a.detail).toEqual({ pickId: picks[0].id, digestId: picks[0].digestId, needCardId: "nc_1", reasonCode: "other" });
  });

  it("refuses 'other' without a note", async () => {
    const { picks } = await world();
    await expect(decidePick(t.db, { pickId: picks[0].id, decision: "remove", reasonCode: "other" })).rejects.toMatchObject({ status: 400 });
    await expect(decidePick(t.db, { pickId: picks[0].id, decision: "remove", reasonCode: "other", note: "   " })).rejects.toMatchObject({ status: 400 });
    expect(await status(picks[0].id)).toBe("suggested");
  });

  it("refuses to decide the same pick twice until it is undone", async () => {
    const { picks } = await world();
    await decidePick(t.db, { pickId: picks[0].id, decision: "approve" }, { now: NOW });
    await expect(decidePick(t.db, { pickId: picks[0].id, decision: "approve" })).rejects.toMatchObject({ status: 409 });
    await expect(decidePick(t.db, { pickId: picks[0].id, decision: "remove", reasonCode: "duplicate" })).rejects.toMatchObject({ status: 409 });
  });

  it("undoes a decision within ten minutes and records it, then allows a new one", async () => {
    const { picks } = await world();
    await decidePick(t.db, { pickId: picks[0].id, decision: "remove", reasonCode: "evidence_thin" }, { now: NOW });
    await decidePick(t.db, { pickId: picks[0].id, decision: "undo" }, { now: new Date(NOW.getTime() + 9 * 60_000) });
    const [row] = await t.db.select().from(pick).where(eq(pick.id, picks[0].id));
    expect(row).toMatchObject({ status: "suggested", reasonCode: null, decisionNote: null, decidedBy: null, decidedAt: null });
    const [a] = await audits("pick.decision_undone");
    expect(a.detail).toMatchObject({ pickId: picks[0].id, previous: "removed" });
    await decidePick(t.db, { pickId: picks[0].id, decision: "approve" }, { now: NOW });
    expect(await status(picks[0].id)).toBe("approved");
  });

  it("refuses an undo after ten minutes, or of an undecided pick", async () => {
    const { picks } = await world();
    await expect(decidePick(t.db, { pickId: picks[0].id, decision: "undo" })).rejects.toMatchObject({ status: 409 });
    await decidePick(t.db, { pickId: picks[0].id, decision: "approve" }, { now: NOW });
    await expect(
      decidePick(t.db, { pickId: picks[0].id, decision: "undo" }, { now: new Date(NOW.getTime() + 11 * 60_000) }),
    ).rejects.toMatchObject({ status: 409, code: "undo_window_closed" });
  });

  it("refuses any decision once the digest is published", async () => {
    const { picks, digestId } = await world(["tal_a"]);
    await decidePick(t.db, { pickId: picks[0].id, decision: "approve" }, { now: NOW });
    await publishDigest(t.db, digestId, { now: NOW });
    await expect(decidePick(t.db, { pickId: picks[0].id, decision: "undo" }, { now: NOW })).rejects.toMatchObject({ status: 409 });
  });

  it("404s for a pick that does not exist", async () => {
    await expect(decidePick(t.db, { pickId: "pick_nope", decision: "approve" })).rejects.toMatchObject({ status: 404 });
  });

  it("will not approve a pick whose card or need has moved on", async () => {
    const { picks } = await world(["tal_a"]);
    await t.db.update(signalCard).set({ version: 2 }).where(eq(signalCard.talentId, "tal_a"));
    await expect(decidePick(t.db, { pickId: picks[0].id, decision: "approve" })).rejects.toMatchObject({ status: 409, code: "out_of_date" });
    // Removing it is still possible, with a reason.
    await decidePick(t.db, { pickId: picks[0].id, decision: "remove", reasonCode: "evidence_thin" });
    expect(await status(picks[0].id)).toBe("removed");
  });
});

describe("publishDigest", () => {
  it("refuses while any pick is undecided (P4), then publishes and records who and when", async () => {
    const { picks, digestId } = await world(["tal_a", "tal_b"]);
    await decidePick(t.db, { pickId: picks[0].id, decision: "approve" }, { now: NOW });
    const err = await publishDigest(t.db, digestId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 409, code: "undecided", message: "Decide every pick first" });
    expect((await t.db.select().from(digest))[0].status).toBe("draft");

    await decidePick(t.db, { pickId: picks[1].id, decision: "remove", reasonCode: "duplicate" }, { now: NOW });
    const result = await publishDigest(t.db, digestId, { now: NOW });
    expect(result).toEqual({ id: digestId, status: "published", publishedAt: NOW.toISOString(), companyPath: "/c/tok-co-1" });
    const [d] = await t.db.select().from(digest);
    expect(d).toMatchObject({ status: "published", publishedBy: "organiser" });
    expect(d.publishedAt).toEqual(NOW);
    const [a] = await audits("digest.published");
    expect(a.detail).toEqual({ digestId, approved: 1, removed: 1 });
  });

  it("refuses a second publish and an unknown digest", async () => {
    const { picks, digestId } = await world(["tal_a"]);
    await decidePick(t.db, { pickId: picks[0].id, decision: "approve" }, { now: NOW });
    await publishDigest(t.db, digestId);
    await expect(publishDigest(t.db, digestId)).rejects.toMatchObject({ status: 409 });
    await expect(publishDigest(t.db, "dig_nope")).rejects.toMatchObject({ status: 404 });
  });

  it("publishes a digest with no picks at all", async () => {
    await addCompany(t.db, { id: "co_1" });
    await addNeed(t.db, { id: "nc_1", companyId: "co_1", requirements: [{ id: "req_1", text: "Python" }] });
    await draftDailyDigests(t.db, DATE);
    const [d] = await t.db.select().from(digest);
    await expect(publishDigest(t.db, d.id)).resolves.toMatchObject({ status: "published" });
  });
});

describe("review queue payload", () => {
  it("groups picks by company and need, in a seeded order that changes with the seed and is stable on reload", async () => {
    const people = ["tal_a", "tal_b", "tal_c", "tal_d", "tal_e"];
    const { digestId } = await world(people);
    const q1 = await buildReviewQueue(t.db, { now: NOW });
    const q2 = await buildReviewQueue(t.db, { now: NOW });
    expect(q1).toEqual(q2);
    expect(q1.order).toBe("no_particular_order");
    expect(q1.digests).toHaveLength(1);
    const ids = q1.digests[0].needs[0].picks.map((p) => p.id);
    expect(ids).toHaveLength(5);

    // Another seed gives another order of the same picks.
    const orders = new Set<string>();
    for (let i = 0; i < 12; i++) {
      await t.db.update(digest).set({ seed: `other-seed-${i}` }).where(eq(digest.id, digestId));
      orders.add((await buildReviewQueue(t.db, { now: NOW })).digests[0].needs[0].picks.map((p) => p.id).join());
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it("shows reasons with the requirement text, the rendering and the masked posting sentence, and 'not mentioned' items", async () => {
    await world(["tal_a"]);
    const q = await buildReviewQueue(t.db, { now: NOW });
    const need = q.digests[0].needs[0];
    expect(need.title).toBe("Data engineer at the company");
    const [p] = need.picks;
    expect(p.reasons.length).toBeGreaterThan(0);
    const python = p.reasons.find((r) => r.requirementId === "req_1")!;
    expect(python.requirementText).toBe("Python programming");
    expect(python.rendering).toContain("English rendering");
    expect(python.postingSentence).toBe("You write Python every day.");
    expect(p.notMentioned).toEqual([{ id: "req_3", text: "Fluent Finnish", statutory: true }]);
    expect(p.requirements.map((r) => [r.id, r.touched])).toEqual([["req_1", true], ["req_2", true], ["req_3", false]]);
    expect(p.basis).toEqual({ lastDrafted: null, seedPrefix: expect.stringMatching(/^[0-9a-f]{8}$/) });
    expect(p.card?.handle).toMatch(/^Maple-/);
  });

  it("carries no quote, name, contact, interview language, input mode or score", async () => {
    await world(["tal_a", "tal_b"]);
    await t.db.insert(talentIdentity).values({ talentId: "tal_a", displayName: "Zelda Canaryname", contact: "zelda@example.invalid" });
    const q = await buildReviewQueue(t.db, { now: NOW });
    const json = JSON.stringify(q);
    expect(json).not.toMatch(/Zelda|Canaryname|zelda@|QUOTE-/);
    const forbiddenKey = /^(name|displayName_?person|contact|quotes?|lang|interviewLang|inputMode|inputModes|score|rank|ranking|similarity|overlap|weight|percent|level)$/i;
    const walk = (value: unknown, path: string): void => {
      if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`));
      else if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) {
          expect(forbiddenKey.test(k), `${path}.${k}`).toBe(false);
          walk(v, `${path}.${k}`);
        }
      } else if (typeof value === "number") {
        // Only the counts of undecided, approved and removed picks, and version numbers.
        expect(/\.(undecided|approved|removed|version)$/.test(path), path).toBe(true);
      }
    };
    walk(q, "queue");
  });

  it("marks a pick out of date and withholds its reasons when the card has moved on", async () => {
    await world(["tal_a"]);
    await t.db.update(signalCard).set({ version: 2 }).where(eq(signalCard.talentId, "tal_a"));
    const [p] = (await buildReviewQueue(t.db, { now: NOW })).digests[0].needs[0].picks;
    expect(p.outOfDate).toEqual({ need: false, card: true });
    expect(p.reasons).toEqual([]);
    expect(p.notMentioned).toEqual([]);
  });

  it("lists a need nobody relates to, and keeps a published digest of today in view with the company link", async () => {
    await addCompany(t.db, { id: "co_1", token: "tok-co-1" });
    await addNeed(t.db, { id: "nc_1", companyId: "co_1", requirements: [{ id: "req_1", text: "Python" }] });
    await draftDailyDigests(t.db, DATE);
    let q = await buildReviewQueue(t.db, { now: NOW });
    expect(q.digests[0].needs).toMatchObject([{ needCardId: "nc_1", nobodyRelates: true, picks: [] }]);
    expect(q.digests[0].companyPath).toBeNull();
    await publishDigest(t.db, q.digests[0].id, { now: NOW });
    q = await buildReviewQueue(t.db, { now: NOW });
    expect(q.digests[0]).toMatchObject({ status: "published", companyPath: "/c/tok-co-1" });
    // Tomorrow it has left the queue.
    q = await buildReviewQueue(t.db, { now: new Date("2026-11-21T07:00:00Z") });
    expect(q.digests).toEqual([]);
  });
});
