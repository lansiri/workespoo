import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { loadJobFixtures } from "../../../fixtures/load";
import { eligibility, jobMatch, jobQueue, needCard, talent } from "@/db/schema";
import type { SignalCard } from "@/contracts";
import { enqueue, runReadyJobs } from "@/lib/queue";
import { resetLlmState, setLlmFake } from "@/lib/llm";
import { feedClock } from "./feed";
import { jobs } from "./jobs";
import { addNeed, addPerson, jobIdByTitle, occupationSkillsOf, req, uriByLabel } from "./testkit";

const cards = new Map<string, SignalCard>();
vi.mock("@/features/card", () => ({ getApprovedCard: async (_db: unknown, id: string) => cards.get(id) ?? null }));
vi.mock("@/features/needs", () => ({
  getNeedCardForJob: async () => {
    throw new Error("not implemented yet");
  },
}));
vi.mock("@/features/intros", () => ({
  introsForTalent: async () => {
    throw new Error("not implemented yet");
  },
}));

let t: TestDb;
let jobId: string;
let python: string;

beforeAll(async () => {
  t = await createTestDb();
  await loadJobFixtures(t.db);
  jobId = await jobIdByTitle(t.db, "Mobile Developer");
  python = await uriByLabel(t.db, "Python (computer programming)");
});
afterAll(() => t.close());
beforeEach(() => {
  feedClock.now = () => new Date("2026-11-13T09:00:00Z");
  setLlmFake(() => ({ reasons: [] }));
});
afterEach(async () => {
  resetLlmState();
  cards.clear();
  await t.db.delete(jobQueue);
  await t.db.delete(needCard);
  await t.db.delete(talent);
});

const queued = async (kind: string) =>
  (await t.db.select().from(jobQueue)).filter((j) => j.kind === kind).map((j) => j.payload);

describe("matching.card_approved", () => {
  it("computes the feed and eligibility for the person, then asks for pool evidence for changed needs only", async () => {
    const [a, b, c] = await occupationSkillsOf(t.db, "Mobile Developer", 3);
    cards.set(
      "tal_a",
      await addPerson(t.db, {
        id: "tal_a",
        signals: [
          { id: "s1", phrase: a.label, escoUri: a.uri },
          { id: "s2", phrase: b.label, escoUri: b.uri },
          { id: "s3", phrase: c.label, escoUri: c.uri },
        ],
      }),
    );
    await addNeed(t.db, {
      id: "nc_1",
      jobId,
      requirements: [req("r1", a.label, { escoSkillUris: [a.uri] }), req("r2", b.label, { escoSkillUris: [b.uri] })],
    });
    await enqueue(t.db, "matching.card_approved", { talentId: "tal_a", cardVersion: 1 });
    expect(await runReadyJobs(t.db, jobs)).toBe(1);

    expect((await t.db.select().from(eligibility).where(eq(eligibility.talentId, "tal_a"))).map((r) => r.eligible)).toEqual([true]);
    expect((await t.db.select().from(jobMatch).where(eq(jobMatch.talentId, "tal_a"))).length).toBeGreaterThan(0);
    expect(await queued("needs.recompute_pool")).toEqual([{ needCardId: "nc_1" }]);

    // A second run changes no row, so no further pool recompute is queued once the first is done.
    await t.db.delete(jobQueue);
    await enqueue(t.db, "matching.card_approved", { talentId: "tal_a", cardVersion: 1 });
    await runReadyJobs(t.db, jobs);
    expect(await queued("needs.recompute_pool")).toEqual([]);
  });

  it("still computes eligibility when the feed fails, and retries the job", async () => {
    await addPerson(t.db, { id: "tal_a", signals: [{ id: "s1", phrase: "Python", escoUri: python }] });
    // A card whose body is broken makes the feed throw.
    cards.set("tal_a", { signals: null } as unknown as SignalCard);
    await addNeed(t.db, { id: "nc_1", jobId, requirements: [req("r1", "Python", { escoSkillUris: [python] })] });
    await enqueue(t.db, "matching.card_approved", { talentId: "tal_a", cardVersion: 1 });
    await runReadyJobs(t.db, jobs);
    expect((await t.db.select().from(eligibility)).length).toBe(1);
    const [row] = (await t.db.select().from(jobQueue)).filter((j) => j.kind === "matching.card_approved");
    expect(row.doneAt).toBeNull();
    expect(row.attempts).toBe(1);
  });

  it("rejects a payload without a talent id as a permanent failure", async () => {
    await enqueue(t.db, "matching.card_approved", { cardVersion: 1 });
    await runReadyJobs(t.db, jobs);
    const [row] = (await t.db.select().from(jobQueue)).filter((j) => j.kind === "matching.card_approved");
    expect(row.error ?? "").toContain("invalid payload");
  });
});

describe("matching.need_changed", () => {
  it("computes eligibility for the need and queues pool evidence", async () => {
    await addPerson(t.db, { id: "tal_a", signals: [{ id: "s1", phrase: "Python", escoUri: python }] });
    await addNeed(t.db, { id: "nc_1", jobId, requirements: [req("r1", "Python", { escoSkillUris: [python] })] });
    await enqueue(t.db, "matching.need_changed", { needCardId: "nc_1", version: 1 });
    expect(await runReadyJobs(t.db, jobs)).toBe(1);
    const rows = await t.db.select().from(eligibility);
    expect(rows.map((r) => [r.talentId, r.eligible])).toEqual([["tal_a", true]]);
    expect(await queued("needs.recompute_pool")).toEqual([{ needCardId: "nc_1" }]);
  });
});
