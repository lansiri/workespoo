import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { enqueue, PermanentJobError } from "@/lib/queue";
import { jobs, schedules } from "./jobs";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

describe("jobs queue definitions", () => {
  it("defines the kinds the feature API names, and the one-time rescrub", () => {
    expect(jobs.map((j) => j.kind).sort()).toEqual(["jobs.crawl_occupations", "jobs.ingest_tmt", "jobs.rescrub"]);
  });

  it("schedules ingestion every 6 hours for Espoo and the occupation crawl every 30 minutes, limit 100", () => {
    expect(schedules).toContainEqual({ kind: "jobs.ingest_tmt", everyMinutes: 360, payload: { municipalities: ["049"] } });
    expect(schedules).toContainEqual({ kind: "jobs.crawl_occupations", everyMinutes: 30, payload: { limit: 100 } });
    for (const s of schedules) expect(jobs.some((j) => j.kind === s.kind)).toBe(true);
  });

  it("rejects a payload of the wrong shape for good, and runs a crawl with nothing pending without touching the network", async () => {
    const crawl = jobs.find((j) => j.kind === "jobs.crawl_occupations")!;
    await expect(crawl.run({ limit: "many" }, { db: t.db, attempt: 1 })).rejects.toBeInstanceOf(PermanentJobError);
    await expect(crawl.run({ limit: 100 }, { db: t.db, attempt: 1 })).resolves.toBeUndefined();
    await enqueue(t.db, "jobs.crawl_occupations", { limit: 100 });
  });
});
