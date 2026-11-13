import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { llmCall } from "@/db/schema";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { buildUsageReport, failureReason, renderUsage, summariseCalls } from "./usage";

describe("summariseCalls", () => {
  it("counts calls, requests, failures by reason and the time waited for a slot, per purpose", () => {
    const usage = summariseCalls([
      { purpose: "interview.live", ok: true, error: null, attempts: 1, queuedMs: 0 },
      { purpose: "interview.live", ok: true, error: null, attempts: 2, queuedMs: 1500 },
      { purpose: "interview.extract", ok: false, error: "deadline: the call ran out of time (8000 ms)", attempts: 3, queuedMs: 4200 },
      { purpose: "card.synthesis", ok: true, error: null, attempts: null, queuedMs: null },
    ]);
    expect(usage).toMatchObject({ calls: 4, failed: 1, attempts: 7, queuedMs: 5700 });
    expect(usage.byPurpose["interview.live"]).toEqual({ calls: 2, failed: 0, attempts: 3, queuedMs: 1500 });
    expect(usage.byPurpose["interview.extract"]).toEqual({ calls: 1, failed: 1, attempts: 3, queuedMs: 4200 });
    expect(usage.byPurpose["card.synthesis"]).toEqual({ calls: 1, failed: 0, attempts: 1, queuedMs: 0 });
    expect(usage.failures).toEqual({ "deadline the call ran": 1 });
  });

  it("keeps failure keys short and free of numbers", () => {
    expect(failureReason("rate_limited 429 after 5 tries, retry-after 30")).toBe("rate_limited after tries retry");
    expect(failureReason(null)).toBe("unknown");
  });
});

describe("buildUsageReport", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(() => t.close());

  it("gives each interview the calls inside its window and the total everything", async () => {
    const base = Date.now();
    const at = (offset: number) => new Date(base + offset);
    const row = (purpose: string, offset: number, over: Partial<typeof llmCall.$inferInsert> = {}) => ({
      at: at(offset), role: "analyst" as const, provider: "p", model: "m", purpose, latencyMs: 10, ok: true, attempts: 1, queuedMs: 0, ...over,
    });
    await t.db.insert(llmCall).values([
      row("interview.live", 1_000),
      row("interview.extract", 2_000, { queuedMs: 2500 }),
      row("interview.live", 20_000, { ok: false, error: "provider_error", attempts: 3 }),
      row("needs.draft", 40_000),
    ]);
    const report = await buildUsageReport(
      t.db,
      [
        { label: "p01 (full)", startedAt: at(0), endedAt: at(5_000) },
        { label: "p02 (full)", startedAt: at(18_000), endedAt: at(25_000) },
      ],
      { startedAt: at(0), endedAt: at(41_000) },
    );
    expect(report.interviews.map((i) => [i.label, i.wallMs, i.usage.calls, i.usage.failed])).toEqual([
      ["p01 (full)", 5_000, 2, 0],
      ["p02 (full)", 7_000, 1, 1],
    ]);
    expect(report.interviews[0]!.usage.queuedMs).toBe(2500);
    expect(report.total.usage).toMatchObject({ calls: 4, failed: 1, attempts: 6 });
    const text = renderUsage(report);
    expect(text).toContain("p01 (full): wall 5.0 s, 2 calls (2 requests), waited for a rate-limit slot 2.5 s");
    expect(text).toContain("by purpose: interview.extract 1, interview.live 1");
    expect(text).toContain("failures by reason: provider_error 1");
    expect(text).toContain("total: wall 41.0 s, 4 calls (6 requests)");
  });

  it("counts a call in one interview only when interviews run back to back", async () => {
    const base = Date.now() + 1_000_000;
    const at = (offset: number) => new Date(base + offset);
    const row = (purpose: string, offset: number) => ({
      at: at(offset), role: "analyst" as const, provider: "p", model: "m", purpose, latencyMs: 10, ok: true, attempts: 1, queuedMs: 0,
    });
    await t.db.insert(llmCall).values([
      row("interview.live", 1_000),
      row("card.synthesis", 29_950),
      row("interview.live", 31_000),
      row("card.synthesis", 59_950),
    ]);
    const report = await buildUsageReport(
      t.db,
      [
        { label: "a", startedAt: at(0), endedAt: at(30_000) },
        { label: "b", startedAt: at(30_050), endedAt: at(60_000) },
      ],
      { startedAt: at(0), endedAt: at(60_000) },
    );
    expect(report.interviews.map((i) => i.usage.byPurpose)).toEqual([
      { "interview.live": expect.objectContaining({ calls: 1 }), "card.synthesis": expect.objectContaining({ calls: 1 }) },
      { "interview.live": expect.objectContaining({ calls: 1 }), "card.synthesis": expect.objectContaining({ calls: 1 }) },
    ]);
    expect(report.interviews.reduce((n, i) => n + i.usage.calls, 0)).toBeLessThanOrEqual(report.total.usage.calls);
  });
});
