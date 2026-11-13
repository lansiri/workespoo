import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { appMeta, digest, jobQueue } from "@/db/schema";
import { runReadyJobs } from "@/lib/queue";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { DAILY_DRAFT_KIND, DAILY_TICK_KIND, dailyTick, jobs, schedules } from "./jobs";
import { addCompany, addEligibility, addNeed, addTalent, resetDb, setSetting } from "./test-helpers";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());
beforeEach(async () => {
  await resetDb(t.db);
});

// 2026-11-20 is winter time in Helsinki (UTC+2): 04:30 UTC is 06:30 there.
const BEFORE = new Date("2026-11-20T03:30:00Z"); // 05:30 Helsinki
const AFTER = new Date("2026-11-20T04:30:00Z"); // 06:30 Helsinki

const queued = async () => (await t.db.select().from(jobQueue).where(eq(jobQueue.kind, DAILY_DRAFT_KIND))).length;

describe("the daily schedule", () => {
  it("is hourly", () => {
    expect(schedules).toEqual([{ kind: DAILY_TICK_KIND, everyMinutes: 60 }]);
    expect(jobs.map((j) => j.kind).sort()).toEqual([DAILY_DRAFT_KIND, DAILY_TICK_KIND].sort());
  });

  it("does nothing before the run time, then enqueues once per day after it", async () => {
    expect(await dailyTick(t.db, BEFORE)).toEqual({ enqueued: false, date: "2026-11-20" });
    expect(await queued()).toBe(0);
    expect(await dailyTick(t.db, AFTER)).toEqual({ enqueued: true, date: "2026-11-20" });
    // Another tick while the job is still waiting adds nothing.
    await dailyTick(t.db, new Date(AFTER.getTime() + 3_600_000));
    expect(await queued()).toBe(1);
  });

  it("drafts when the job runs, and later ticks that day stay quiet", async () => {
    await addCompany(t.db, { id: "co_1" });
    await addNeed(t.db, { id: "nc_1", companyId: "co_1", requirements: [{ id: "req_1", text: "Python", escoSkillUris: ["e:py"] }] });
    await addTalent(t.db, { id: "tal_a", signals: [{ id: "s1", phrase: "Python pipelines", escoUri: "e:py" }] });
    await addEligibility(t.db, { needCardId: "nc_1", talentId: "tal_a", touched: ["req_1"] });

    await dailyTick(t.db, AFTER);
    expect(await runReadyJobs(t.db, jobs)).toBe(1);
    const [d] = await t.db.select().from(digest);
    expect(d).toMatchObject({ date: "2026-11-20", status: "draft" });
    expect((await t.db.select().from(appMeta).where(eq(appMeta.key, "picks:daily_run:2026-11-20"))).length).toBe(1);

    expect(await dailyTick(t.db, new Date(AFTER.getTime() + 7_200_000))).toEqual({ enqueued: false, date: "2026-11-20" });
    // The next day it runs again.
    expect(await dailyTick(t.db, new Date("2026-11-21T05:00:00Z"))).toEqual({ enqueued: true, date: "2026-11-21" });
  });

  it("honours a run time set in app_meta", async () => {
    await setSetting(t.db, "dailyRunAt", "09:00");
    expect((await dailyTick(t.db, AFTER)).enqueued).toBe(false);
    expect((await dailyTick(t.db, new Date("2026-11-20T07:30:00Z"))).enqueued).toBe(true);
  });
});
