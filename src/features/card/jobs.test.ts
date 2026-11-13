import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { consent, jobQueue, talent, interview } from "@/db/schema";
import { listAudit } from "@/lib/audit";
import { recordConsent } from "@/lib/consent";
import { enqueue, runReadyJobs } from "@/lib/queue";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { jobs, purgeLiveSessions, PURGE_KIND, schedules } from "./jobs";
import { seedInterview } from "./test-helpers";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
}, 120_000);
afterAll(() => t.close());

const NOW = new Date("2026-11-26T12:00:00Z");
const remaining = async () => (await t.db.select({ id: talent.id }).from(talent)).map((r) => r.id).sort();

describe("purge", () => {
  it("deletes live demo talents past purgeAfter, cascades, and audits a count", async () => {
    await seedInterview(t.db, { talentId: "tal_past0000001", interviewId: "int_past0000001", handle: "Moss-10" });
    await seedInterview(t.db, { talentId: "tal_future00001", interviewId: "int_future00001", handle: "Moss-11" });
    await seedInterview(t.db, { talentId: "tal_notlive0001", interviewId: "int_notlive0001", handle: "Moss-12" });
    await seedInterview(t.db, { talentId: "tal_nodate00001", interviewId: "int_nodate00001", handle: "Moss-13" });
    await t.db.update(talent).set({ liveDemo: true, purgeAfter: new Date(NOW.getTime() - 1000) }).where(eq(talent.id, "tal_past0000001"));
    await t.db.update(talent).set({ liveDemo: true, purgeAfter: new Date(NOW.getTime() + 1000) }).where(eq(talent.id, "tal_future00001"));
    await t.db.update(talent).set({ liveDemo: false, purgeAfter: new Date(NOW.getTime() - 1000) }).where(eq(talent.id, "tal_notlive0001"));
    await t.db.update(talent).set({ liveDemo: true }).where(eq(talent.id, "tal_nodate00001"));

    for (const id of ["tal_past0000001", "tal_future00001"]) {
      await recordConsent(t.db, { subjectType: "talent", subjectId: id, kind: "pool" });
    }
    expect(await purgeLiveSessions(t.db, NOW)).toBe(1);
    const consents = (await t.db.select().from(consent)).map((c) => c.subjectId);
    expect(consents).not.toContain("tal_past0000001");
    expect(consents).toContain("tal_future00001");
    expect(await remaining()).toEqual(["tal_future00001", "tal_nodate00001", "tal_notlive0001"]);
    expect(await t.db.select().from(interview).where(eq(interview.id, "int_past0000001"))).toHaveLength(0);
    const [ev] = await listAudit(t.db, { action: "talent.purged" });
    expect(ev.detail).toEqual({ count: 1 });

    // later: the clock moves on and the future one goes too
    expect(await purgeLiveSessions(t.db, new Date(NOW.getTime() + 2000))).toBe(1);
    expect(await purgeLiveSessions(t.db, new Date(NOW.getTime() + 2000))).toBe(0);
    expect(await listAudit(t.db, { action: "talent.purged" })).toHaveLength(2);
  });

  it("is registered as a job and scheduled every 30 minutes", async () => {
    expect(schedules).toEqual([{ kind: "trust.purge_live_sessions", everyMinutes: 30, payload: {} }]);
    await t.db.delete(jobQueue);
    await enqueue(t.db, PURGE_KIND, {});
    expect(await runReadyJobs(t.db, jobs)).toBe(1);
  });
});
