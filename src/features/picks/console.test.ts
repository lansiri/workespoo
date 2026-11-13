import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AUDIT_ACTIONS } from "@/contracts";
import { auditLog } from "@/db/schema";
import { audit } from "@/lib/audit";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { AUDIT_ACTION_LABELS, consoleMessages } from "./console-messages";
import { AUDIT_PAGE_SIZE, buildExposure, listAudit, organiserCounts, parseAuditAction } from "./console";
import { addCompany, addNeed, addPastPick, addTalent, resetDb } from "./test-helpers";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());
beforeEach(async () => {
  await resetDb(t.db);
});

const ev = (n: number, action: (typeof AUDIT_ACTIONS)[number] = "pick.drafted", detail: Record<string, unknown> = {}) =>
  audit(t.db, { actor: "system", action, subjectType: "pick", subjectId: `pick_${n}`, detail });

describe("listAudit", () => {
  it("lists newest first, 100 at a time, and continues with before", async () => {
    for (let i = 1; i <= 130; i++) await ev(i);
    const first = await listAudit(t.db);
    expect(first.rows).toHaveLength(AUDIT_PAGE_SIZE);
    expect(first.rows[0].subjectId).toBe("pick_130");
    expect(first.nextBefore).toBe(first.rows[99].id);
    const second = await listAudit(t.db, { before: first.nextBefore });
    expect(second.rows).toHaveLength(30);
    expect(second.rows[0].subjectId).toBe("pick_30");
    expect(second.rows[29].subjectId).toBe("pick_1");
    expect(second.nextBefore).toBeNull();
  });

  it("orders by time, so backdated seeded history sits below newer rows", async () => {
    await ev(1, "pick.drafted", { seeded: true });
    await t.db.update(auditLog).set({ at: new Date("2026-01-01T00:00:00Z") });
    await ev(2);
    const { rows } = await listAudit(t.db);
    expect(rows.map((r) => r.subjectId)).toEqual(["pick_2", "pick_1"]);
  });

  it("filters by action", async () => {
    await ev(1, "pick.drafted");
    await ev(2, "pick.approved");
    await ev(3, "pick.approved");
    const { rows } = await listAudit(t.db, { action: "pick.approved" });
    expect(rows.map((r) => r.action)).toEqual(["pick.approved", "pick.approved"]);
  });

  it("marks rows whose detail says seeded, and returns the detail as stored", async () => {
    await ev(1, "pick.approved", { seeded: true, count: 3 });
    await ev(2);
    const { rows } = await listAudit(t.db);
    expect(rows.map((r) => r.seeded)).toEqual([false, true]);
    expect(rows[1].detail).toEqual({ seeded: true, count: 3 });
  });

  it("drops voice consent and language keys from the detail", async () => {
    await ev(1, "interview.started", { talentId: "t1", mode: "full", liveDemo: false, voice: true, lang: "fi" });
    const { rows } = await listAudit(t.db);
    expect(rows[0].detail).toEqual({ talentId: "t1", mode: "full", liveDemo: false });
  });

  it("refuses an unknown action", () => {
    expect(() => parseAuditAction("pick.invented")).toThrowError(/Unknown audit action/);
    expect(parseAuditAction("")).toBeNull();
  });
});

describe("audit labels", () => {
  it("has a plain-words line in every language for every agreed action", () => {
    for (const lang of ["en", "fi", "sv"] as const) {
      for (const a of AUDIT_ACTIONS) expect(AUDIT_ACTION_LABELS[lang][a], `${lang} ${a}`).toBeTruthy();
    }
    expect(consoleMessages.fi.auditSeeded).toBeTruthy();
    expect(consoleMessages.en.auditSeeded).toBe("Seeded demo history");
  });
});

describe("buildExposure", () => {
  const NOW = new Date("2026-11-14T12:00:00Z");
  async function world() {
    await addCompany(t.db, { id: "co_1" });
    await addNeed(t.db, { id: "nc_1", companyId: "co_1", requirements: [{ id: "req_1", text: "Python" }] });
  }
  async function pickFor(talentId: string, n: number, createdAt = new Date("2026-11-13T12:00:00Z")) {
    for (let i = 0; i < n; i++) {
      await addPastPick(t.db, { digestDate: `2026-11-${String(10 + i).padStart(2, "0")}`, companyId: "co_1", needCardId: "nc_1", talentId, createdAt, status: "suggested" });
    }
  }

  it("puts people in bands and lists handles alphabetically, with no counts per person", async () => {
    await world();
    for (const [id, handle] of [["t1", "Zebra"], ["t2", "Apple"], ["t3", "Mango"], ["t4", "Birch"], ["t5", "Cedar"], ["t6", "Aspen"]] as const) {
      await addTalent(t.db, { id, handle });
    }
    await pickFor("t1", 1);
    await pickFor("t2", 2);
    await pickFor("t3", 4);
    await pickFor("t4", 6);
    await pickFor("t5", 0);
    const view = await buildExposure(t.db, NOW);
    expect(view.bands.map((b) => b.band)).toEqual(["never", "few", "several", "many"]);
    expect(view.bands.map((b) => b.handles)).toEqual([["Aspen", "Cedar"], ["Apple", "Zebra"], ["Mango"], ["Birch"]]);
    expect(JSON.stringify(view)).not.toMatch(/\d+ times|count/i);
  });

  it("counts only the last seven days and only people in the pool", async () => {
    await world();
    await addTalent(t.db, { id: "t1", handle: "Old" });
    await addTalent(t.db, { id: "t2", handle: "Out", inPool: false });
    await pickFor("t1", 3, new Date("2026-11-01T12:00:00Z"));
    const view = await buildExposure(t.db, NOW);
    expect(view.bands[0].handles).toEqual(["Old"]);
    expect(view.poolSize).toBe(1);
  });
});

describe("organiserCounts", () => {
  it("counts people in the pool, companies taking part and draft digests with picks", async () => {
    await addCompany(t.db, { id: "co_1" });
    await addCompany(t.db, { id: "co_2", participating: false });
    await addNeed(t.db, { id: "nc_1", companyId: "co_1", requirements: [{ id: "req_1", text: "Python" }] });
    await addTalent(t.db, { id: "t1" });
    await addTalent(t.db, { id: "t2", inPool: false });
    await addPastPick(t.db, { digestDate: "2026-11-14", companyId: "co_1", needCardId: "nc_1", talentId: "t1", createdAt: new Date(), status: "suggested", digestStatus: "draft" });
    await addPastPick(t.db, { digestDate: "2026-11-14", companyId: "co_1", needCardId: "nc_1", talentId: "t2", createdAt: new Date(), status: "suggested", digestStatus: "draft" });
    expect(await organiserCounts(t.db)).toEqual({ poolPeople: 1, companies: 1, digestsWaiting: 1 });
  });
});
