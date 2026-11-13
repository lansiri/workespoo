import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../../tests/helpers/db";
import { resetEnvCache } from "@/lib/env";
import { audit, listAudit } from "./audit";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
}, 90_000);
afterAll(() => t.close());

describe("audit", () => {
  it("inserts and lists newest first with filters and paging", async () => {
    await audit(t.db, { actor: "system", action: "interview.started", subjectType: "interview", subjectId: "int_1", detail: { turns: 3 } });
    await audit(t.db, { actor: "talent:tal_1", action: "card.approved", subjectType: "signal_card", subjectId: "sc_1", detail: { version: 1, at: "2026-11-13T10:00:00Z" } });
    await audit(t.db, { actor: "organiser", action: "card.approved", subjectType: "signal_card", subjectId: "sc_2" });

    const all = await listAudit(t.db);
    expect(all.map((e) => e.subjectId)).toEqual(["sc_2", "sc_1", "int_1"]);
    expect(all[2]).toMatchObject({ actor: "system", action: "interview.started", detail: { turns: 3 } });
    expect(all[0].detail).toEqual({});
    expect(typeof all[0].id).toBe("string");

    expect(await listAudit(t.db, { subjectType: "signal_card" })).toHaveLength(2);
    expect(await listAudit(t.db, { subjectType: "signal_card", subjectId: "sc_1" })).toHaveLength(1);
    expect(await listAudit(t.db, { action: "card.approved" })).toHaveLength(2);
    expect(await listAudit(t.db, { limit: 1 })).toHaveLength(1);
    const page = await listAudit(t.db, { beforeId: Number(all[0].id) });
    expect(page.map((e) => e.subjectId)).toEqual(["sc_1", "int_1"]);
    expect(await listAudit(t.db, { subjectId: "missing" })).toEqual([]);
  });

  it("refuses contact details in tests, nested too", async () => {
    const bad = [
      { note: "mail me at jane.doe@example.com" },
      { nested: { list: ["call +358 40 123 4567"] } },
      { phone: "040-123 4567" },
      { phone: "0401234567" },
    ];
    for (const detail of bad) {
      await expect(
        audit(t.db, { actor: "system", action: "data.exported", subjectType: "talent", subjectId: "tal_refuse", detail }),
      ).rejects.toThrow(/email address or phone number/);
    }
    expect(await listAudit(t.db, { subjectId: "tal_refuse" })).toEqual([]);
  });

  it("accepts ids, counts, timestamps and epoch values", async () => {
    await audit(t.db, {
      actor: "system", action: "data.exported", subjectType: "talent", subjectId: "tal_ok",
      detail: { id: "tal_abcdef123456", count: 12, from: "2026-11-13", at: "2026-11-13T10:00:00.000Z", epoch: 1731500000000, ref: "1731500000000" },
    });
    expect(await listAudit(t.db, { subjectId: "tal_ok" })).toHaveLength(1);
  });

  it("logs and strips outside tests", async () => {
    vi.stubEnv("NODE_ENV", "production");
    resetEnvCache();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await audit(t.db, {
      actor: "system", action: "data.exported", subjectType: "talent", subjectId: "tal_strip",
      detail: { count: 2, note: "a@b.fi", list: ["ok", "+358401234567"] },
    });
    expect(warn).toHaveBeenCalled();
    const [row] = await listAudit(t.db, { subjectId: "tal_strip" });
    expect(row.detail).toEqual({ count: 2, note: "[removed]", list: ["ok", "[removed]"] });
    warn.mockRestore();
    vi.unstubAllEnvs();
    resetEnvCache();
  });
});
