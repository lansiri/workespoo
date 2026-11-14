import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../tests/helpers/db";
import { consent } from "@/db/schema";
import { CONSENT_TEXT_VERSION, hasConsent, recordConsent, withdrawConsent } from "./consent";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
}, 90_000);
afterAll(() => t.close());

const c = { subjectType: "talent", subjectId: "tal_1", kind: "interview" } as const;

describe("consent", () => {
  it("grants, withdraws and re-grants", async () => {
    expect(await hasConsent(t.db, c)).toBe(false);
    await recordConsent(t.db, c);
    expect(await hasConsent(t.db, c)).toBe(true);
    await recordConsent(t.db, c); // idempotent
    expect(await t.db.select().from(consent).where(eq(consent.subjectId, "tal_1"))).toHaveLength(1);

    await withdrawConsent(t.db, c);
    expect(await hasConsent(t.db, c)).toBe(false);

    await recordConsent(t.db, c);
    expect(await hasConsent(t.db, c)).toBe(true);
    const rows = await t.db.select().from(consent).where(eq(consent.subjectId, "tal_1"));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.textVersion === CONSENT_TEXT_VERSION)).toBe(true);
    expect(rows.filter((r) => r.withdrawnAt === null)).toHaveLength(1);
  });

  it("names the wording version that mentions the own-server speech text", () => {
    expect(CONSENT_TEXT_VERSION).toBe("2026-11-v2");
  });

  it("keeps kinds and subjects separate; withdrawing nothing is fine", async () => {
    await withdrawConsent(t.db, { ...c, kind: "pool" });
    await recordConsent(t.db, { ...c, kind: "pool" });
    expect(await hasConsent(t.db, { ...c, kind: "pool" })).toBe(true);
    expect(await hasConsent(t.db, { ...c, kind: "voice_vendor" })).toBe(false);
    expect(await hasConsent(t.db, { ...c, subjectType: "company" })).toBe(false);
    await withdrawConsent(t.db, { ...c, kind: "pool" });
    expect(await hasConsent(t.db, c)).toBe(true);
  });
});
