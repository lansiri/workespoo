import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createTestDb, type TestDb } from "../../tests/helpers/db";
import { jobQueue } from "@/db/schema";
import {
  PermanentJobError,
  defineJob,
  enqueue,
  enqueueDueSchedules,
  runReadyJobs,
  runSchedules,
  runWorkerLoop,
} from "./queue";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  vi.spyOn(console, "error").mockImplementation(() => {});
}, 90_000);
afterAll(() => t.close());
beforeEach(async () => {
  await t.db.delete(jobQueue);
});
afterEach(() => {
  vi.useRealTimers();
});

const rows = () => t.db.select().from(jobQueue).orderBy(jobQueue.id);

describe("queue", () => {
  it("enqueues and runs a job with a validated payload", async () => {
    const seen: unknown[] = [];
    const job = defineJob("test.echo", z.object({ n: z.number() }), async (p, ctx) => {
      seen.push([p, ctx.attempt]);
    });
    await enqueue(t.db, "test.echo", { n: 1 });
    expect(await runReadyJobs(t.db, [job])).toBe(1);
    expect(seen).toEqual([[{ n: 1 }, 1]]);
    const [row] = await rows();
    expect(row.doneAt).not.toBeNull();
    expect(row.error).toBeNull();
    expect(await runReadyJobs(t.db, [job])).toBe(0);
  });

  it("does not run future jobs or kinds it has no definition for", async () => {
    const job = defineJob("test.a", z.unknown(), async () => {});
    await enqueue(t.db, "test.a", {}, { runAfter: new Date(Date.now() + 60_000) });
    await enqueue(t.db, "test.other", {});
    expect(await runReadyJobs(t.db, [job])).toBe(0);
    expect(await runReadyJobs(t.db, [])).toBe(0);
    expect((await rows()).every((r) => r.doneAt === null && r.attempts === 0)).toBe(true);
  });

  it("dedupes while an open row with the key exists, allows it once done", async () => {
    const job = defineJob("test.d", z.unknown(), async () => {});
    await enqueue(t.db, "test.d", { a: 1 }, { dedupeKey: "k" });
    await enqueue(t.db, "test.d", { a: 2 }, { dedupeKey: "k" });
    await Promise.all([enqueue(t.db, "test.d", {}, { dedupeKey: "k" }), enqueue(t.db, "test.d", {}, { dedupeKey: "k" })]);
    expect(await rows()).toHaveLength(1);
    await runReadyJobs(t.db, [job]);
    await enqueue(t.db, "test.d", { a: 3 }, { dedupeKey: "k" });
    expect(await rows()).toHaveLength(2);
    await enqueue(t.db, "test.d", {}); // no key never dedupes
    await enqueue(t.db, "test.d", {});
    expect(await rows()).toHaveLength(4);
  });

  it("retries with 30s, 2min backoff then goes dead after maxAttempts, without further retries", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T10:00:00Z"));
    let calls = 0;
    const attempts: number[] = [];
    const job = defineJob("test.fail", z.unknown(), async (_p, ctx) => {
      calls++;
      attempts.push(ctx.attempt);
      throw new Error("boom ".repeat(1000));
    });
    await enqueue(t.db, "test.fail", {});

    expect(await runReadyJobs(t.db, [job])).toBe(1);
    let [row] = await rows();
    expect(row).toMatchObject({ attempts: 1, doneAt: null });
    expect(row.error!.length).toBeLessThanOrEqual(1000);
    expect(row.lockedAt).toBeNull();
    expect(row.runAfter.toISOString()).toBe("2026-11-13T10:00:30.000Z");

    vi.setSystemTime(new Date("2026-11-13T10:00:29Z"));
    expect(await runReadyJobs(t.db, [job])).toBe(0);
    vi.setSystemTime(new Date("2026-11-13T10:00:30Z"));
    expect(await runReadyJobs(t.db, [job])).toBe(1);
    [row] = await rows();
    expect(row.attempts).toBe(2);
    expect(row.runAfter.toISOString()).toBe("2026-11-13T10:02:30.000Z");

    vi.setSystemTime(new Date("2026-11-13T10:02:30Z"));
    expect(await runReadyJobs(t.db, [job])).toBe(1);
    [row] = await rows();
    expect(row).toMatchObject({ attempts: 3, maxAttempts: 3, doneAt: null });
    expect(row.error).toContain("boom");

    vi.setSystemTime(new Date("2027-01-01T00:00:00Z"));
    expect(await runReadyJobs(t.db, [job])).toBe(0);
    expect(calls).toBe(3);
    expect(attempts).toEqual([1, 2, 3]);
  });

  it("uses 10 minutes for the third backoff and honours maxAttempts", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T10:00:00Z"));
    const job = defineJob("test.fail5", z.unknown(), async () => {
      throw new Error("x");
    });
    await enqueue(t.db, "test.fail5", {}, { maxAttempts: 4 });
    for (const step of [0, 30_000, 120_000]) {
      vi.setSystemTime(new Date(Date.now() + step));
      await runReadyJobs(t.db, [job]);
    }
    const [row] = await rows();
    expect(row.attempts).toBe(3);
    expect(row.runAfter.getTime() - Date.now()).toBe(600_000);
  });

  it("fails permanently on an invalid payload and on PermanentJobError", async () => {
    let ran = 0;
    const job = defineJob("test.p", z.object({ n: z.number() }), async () => {
      ran++;
    });
    const perm = defineJob("test.q", z.unknown(), async () => {
      throw new PermanentJobError("nope");
    });
    await enqueue(t.db, "test.p", { n: "x" });
    await enqueue(t.db, "test.q", {});
    expect(await runReadyJobs(t.db, [job, perm])).toBe(2);
    const all = await rows();
    for (const r of all) {
      expect(r.attempts).toBe(r.maxAttempts);
      expect(r.doneAt).toBeNull();
      expect(r.error).toBeTruthy();
    }
    expect(all[0].error).toContain("invalid payload");
    expect(ran).toBe(0);
    expect(await runReadyJobs(t.db, [job, perm])).toBe(0);
  });

  it("a dead row no longer blocks its dedupe key", async () => {
    const job = defineJob("test.dd", z.object({ n: z.number() }), async () => {});
    await enqueue(t.db, "test.dd", { bad: true }, { dedupeKey: "dk" });
    await runReadyJobs(t.db, [job]);
    await enqueue(t.db, "test.dd", { n: 1 }, { dedupeKey: "dk" });
    expect(await rows()).toHaveLength(2);
  });

  it("never runs the same job twice across concurrent runReadyJobs", async () => {
    const counts = new Map<number, number>();
    const job = defineJob("test.c", z.object({ i: z.number() }), async (p) => {
      counts.set(p.i, (counts.get(p.i) ?? 0) + 1);
      await new Promise((r) => setTimeout(r, 5));
    });
    for (let i = 0; i < 12; i++) await enqueue(t.db, "test.c", { i });
    const results = await Promise.all([runReadyJobs(t.db, [job]), runReadyJobs(t.db, [job]), runReadyJobs(t.db, [job])]);
    expect(results.reduce((a, b) => a + b, 0)).toBe(12);
    expect(counts.size).toBe(12);
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
    expect((await rows()).every((r) => r.doneAt !== null)).toBe(true);
  });

  it("reclaims a row whose worker vanished", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T10:00:00Z"));
    const job = defineJob("test.s", z.unknown(), async () => {});
    await enqueue(t.db, "test.s", {});
    await t.db.update(jobQueue).set({ lockedAt: new Date(), lockedBy: "ghost" });
    expect(await runReadyJobs(t.db, [job])).toBe(0);
    vi.setSystemTime(new Date("2026-11-13T10:11:00Z"));
    expect(await runReadyJobs(t.db, [job])).toBe(1);
  });

  it("schedules enqueue once per period, even after the job finished", async () => {
    const job = defineJob("test.sched", z.unknown(), async () => {});
    const schedules = [{ kind: "test.sched", everyMinutes: 10, payload: { x: 1 } }];
    const t0 = new Date("2026-11-13T10:01:00Z");
    await enqueueDueSchedules(t.db, schedules, t0);
    await enqueueDueSchedules(t.db, schedules, new Date("2026-11-13T10:05:00Z"));
    expect(await rows()).toHaveLength(1);
    expect((await rows())[0].payload).toEqual({ x: 1 });
    await runReadyJobs(t.db, [job]);
    await enqueueDueSchedules(t.db, schedules, new Date("2026-11-13T10:09:59Z"));
    expect(await rows()).toHaveLength(1);
    await enqueueDueSchedules(t.db, schedules, new Date("2026-11-13T10:10:00Z"));
    expect(await rows()).toHaveLength(2);
  });

  it("runSchedules enqueues on its first tick and stops on abort", async () => {
    const ac = new AbortController();
    const p = runSchedules(t.db, [{ kind: "test.loop", everyMinutes: 60 }], ac.signal);
    await vi.waitFor(async () => expect(await rows()).toHaveLength(1));
    ac.abort();
    await p;
    await runSchedules(t.db, [], AbortSignal.abort());
  });

  it("takes background kinds only when nothing else is ready", async () => {
    const order: string[] = [];
    const slow = defineJob("test.slow", z.object({ n: z.number() }), async ({ n }) => void order.push(`slow${n}`));
    const quick = defineJob("test.quick", z.object({ n: z.number() }), async ({ n }) => void order.push(`quick${n}`));
    await enqueue(t.db, "test.slow", { n: 1 });
    await enqueue(t.db, "test.slow", { n: 2 });
    await enqueue(t.db, "test.quick", { n: 1 });
    await enqueue(t.db, "test.quick", { n: 2 });
    expect(await runReadyJobs(t.db, [slow, quick], { last: ["test.slow"] })).toBe(4);
    expect(order).toEqual(["quick1", "quick2", "slow1", "slow2"]);
  });

  it("keeps the order jobs were queued in when no kind is marked as background", async () => {
    const order: string[] = [];
    const a = defineJob("test.a", z.object({}), async () => void order.push("a"));
    const b = defineJob("test.b", z.object({}), async () => void order.push("b"));
    await enqueue(t.db, "test.a", {});
    await enqueue(t.db, "test.b", {});
    await enqueue(t.db, "test.a", {});
    await runReadyJobs(t.db, [a, b]);
    expect(order).toEqual(["a", "b", "a"]);
  });

  it("runWorkerLoop processes jobs and stops on abort", async () => {
    const done: number[] = [];
    const job = defineJob("test.w", z.object({ i: z.number() }), async (p) => {
      done.push(p.i);
    });
    const ac = new AbortController();
    const loop = runWorkerLoop(t.db, [job], { pollMs: 10, signal: ac.signal });
    await enqueue(t.db, "test.w", { i: 1 });
    await vi.waitFor(() => expect(done).toEqual([1]));
    await enqueue(t.db, "test.w", { i: 2 });
    await vi.waitFor(() => expect(done).toEqual([1, 2]));
    ac.abort();
    await loop;
    const [{ lockedBy }] = await t.db.select().from(jobQueue).where(eq(jobQueue.id, (await rows())[0].id));
    expect(lockedBy).toBeNull();
  });
});
