import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { loadJobFixtures } from "../../../fixtures/load";
import { eligibility, jobMatch, jobQueue, needCard, talent } from "@/db/schema";
import type { NeedCard, SignalCard } from "@/contracts";
import { enqueue, runReadyJobs } from "@/lib/queue";
import { resetLlmState, setLlmFake } from "@/lib/llm";
import { feedClock } from "./feed";
import { jobs } from "./jobs";
import { feedForTalent } from "./feed";
import { addNeed, addPerson, jobIdByTitle, occupationSkillsOf, req, uriByLabel } from "./testkit";

const cards = new Map<string, SignalCard>();
vi.mock("@/features/card", () => ({ getApprovedCard: async (_db: unknown, id: string) => cards.get(id) ?? null }));
const needCards = new Map<string, NeedCard>();
vi.mock("@/features/needs", () => ({ getNeedCardForJob: async (_db: unknown, id: string) => needCards.get(id) ?? null }));
vi.mock("@/features/intros", () => ({ introsForTalent: async () => [] }));

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
  needCards.clear();
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
    // The feed job, then step two of the feed which it queued.
    expect(await runReadyJobs(t.db, jobs)).toBe(2);

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

describe("matching.refine_feed", () => {
  it("is queued by card approval, once per person and card version, and words the reasons without moving postings", async () => {
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
    needCards.set(
      jobId,
      await addNeed(t.db, { id: "nc_1", jobId, requirements: [req("r1", a.label, { escoSkillUris: [a.uri], postingSentence: 0 })] }),
    );
    await enqueue(t.db, "matching.card_approved", { talentId: "tal_a", cardVersion: 1 });
    await enqueue(t.db, "matching.card_approved", { talentId: "tal_a", cardVersion: 1 });
    const calls: string[] = [];
    setLlmFake((opts) => {
      calls.push(opts.purpose ?? "");
      return { reasons: [{ signal: "S1", sentence: "P0", text: "Your card mentions it; the posting asks for it." }] };
    });
    // Run only the first job: the feed is there with code reasons and no model call has been made.
    const { runReadyJobs: run } = await import("@/lib/queue");
    await run(t.db, jobs.filter((j) => j.kind === "matching.card_approved"));
    expect(calls).toEqual([]);
    expect((await queued("matching.refine_feed")).length).toBe(1);
    const before = await feedForTalent(t.db, "tal_a");
    expect(before.every((f) => f.match.reasonsSource === "code")).toBe(true);

    await run(t.db, jobs.filter((j) => j.kind === "matching.refine_feed"));
    expect(calls.length).toBeGreaterThan(0);
    const after = await feedForTalent(t.db, "tal_a");
    expect(after.map((f) => f.job.id)).toEqual(before.map((f) => f.job.id));
    expect(after.find((f) => f.job.id === jobId)?.match.reasonsSource).toBe("model");
  });
});

describe("matching.need_changed refreshes the feed", () => {
  it("fills 'not mentioned' for people who have the posting, without a model call", async () => {
    const [a] = await occupationSkillsOf(t.db, "Mobile Developer", 1);
    cards.set("tal_a", await addPerson(t.db, { id: "tal_a", signals: [{ id: "s1", phrase: a.label, escoUri: a.uri }] }));
    await enqueue(t.db, "matching.card_approved", { talentId: "tal_a", cardVersion: 1 });
    await runReadyJobs(t.db, jobs);
    const mine = async () => (await feedForTalent(t.db, "tal_a")).find((f) => f.job.id === jobId)!;
    expect((await mine()).match.notMentioned).toEqual([]);

    const calls: unknown[] = [];
    setLlmFake((o) => {
      calls.push(o);
      return { reasons: [] };
    });
    needCards.set(jobId, await addNeed(t.db, { id: "nc_1", jobId, requirements: [req("r1", "Kubernetes in production")] }));
    await enqueue(t.db, "matching.need_changed", { needCardId: "nc_1", version: 1 });
    await runReadyJobs(t.db, jobs);
    expect((await mine()).match.notMentioned).toEqual(["Kubernetes in production"]);
    expect(calls).toEqual([]);
  });
});

describe("leaving and re-joining the pool", () => {
  const rowsOf = (talentId: string) => t.db.select().from(eligibility).where(eq(eligibility.talentId, talentId));

  async function setup() {
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
    await runReadyJobs(t.db, jobs);
    await t.db.delete(jobQueue);
  }

  it("opting out deletes the person's eligibility rows and queues a pool recompute for each need they were counted in", async () => {
    await setup();
    expect(await rowsOf("tal_a")).toHaveLength(1);
    await t.db.update(talent).set({ inPool: false }).where(eq(talent.id, "tal_a"));
    await enqueue(t.db, "matching.card_approved", { talentId: "tal_a", cardVersion: 1 });
    await runReadyJobs(t.db, jobs);
    expect(await rowsOf("tal_a")).toHaveLength(0);
    expect(await queued("needs.recompute_pool")).toEqual([{ needCardId: "nc_1" }]);
  });

  it("opting back in recomputes them and queues the recompute again", async () => {
    await setup();
    await t.db.update(talent).set({ inPool: false }).where(eq(talent.id, "tal_a"));
    await enqueue(t.db, "matching.card_approved", { talentId: "tal_a", cardVersion: 1 });
    await runReadyJobs(t.db, jobs);
    await t.db.delete(jobQueue);
    await t.db.update(talent).set({ inPool: true }).where(eq(talent.id, "tal_a"));
    await enqueue(t.db, "matching.card_approved", { talentId: "tal_a", cardVersion: 1 });
    await runReadyJobs(t.db, jobs);
    expect((await rowsOf("tal_a")).map((r) => [r.needCardId, r.eligible])).toEqual([["nc_1", true]]);
    expect(await queued("needs.recompute_pool")).toEqual([{ needCardId: "nc_1" }]);
  });

  it("a person who was never in the pool leaves nothing to recompute", async () => {
    await setup();
    await t.db.update(talent).set({ inPool: false }).where(eq(talent.id, "tal_a"));
    await enqueue(t.db, "matching.card_approved", { talentId: "tal_a", cardVersion: 1 });
    await runReadyJobs(t.db, jobs);
    await t.db.delete(jobQueue);
    await enqueue(t.db, "matching.card_approved", { talentId: "tal_a", cardVersion: 1 });
    await runReadyJobs(t.db, jobs);
    expect(await queued("needs.recompute_pool")).toEqual([]);
  });
});
