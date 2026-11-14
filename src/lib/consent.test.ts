import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../tests/helpers/db";
import { consent } from "@/db/schema";
import {
  activeConsentTextVersion,
  CONSENT_TEXT_VERSION,
  hasConsent,
  recordConsent,
  VOICE_OWN_SERVER_TEXT_VERSION,
  withdrawConsent,
} from "./consent";

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

  it("stores the wording a grant was given under, and the wording agreed to last is the one that holds", async () => {
    const voice = { subjectType: "talent", subjectId: "tal_voice", kind: "voice_vendor" } as const;
    expect(await activeConsentTextVersion(t.db, voice)).toBeNull();

    await recordConsent(t.db, voice, VOICE_OWN_SERVER_TEXT_VERSION);
    expect(VOICE_OWN_SERVER_TEXT_VERSION).toBe(`${CONSENT_TEXT_VERSION}/own-server`);
    expect(await activeConsentTextVersion(t.db, voice)).toBe(VOICE_OWN_SERVER_TEXT_VERSION);
    await recordConsent(t.db, voice, VOICE_OWN_SERVER_TEXT_VERSION); // the same wording again: nothing new
    expect(await t.db.select().from(consent).where(eq(consent.subjectId, "tal_voice"))).toHaveLength(1);

    // Agreeing to the other wording closes the first grant and opens a new one.
    await recordConsent(t.db, voice);
    expect(await activeConsentTextVersion(t.db, voice)).toBe(CONSENT_TEXT_VERSION);
    const rows = await t.db.select().from(consent).where(eq(consent.subjectId, "tal_voice"));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.textVersion === VOICE_OWN_SERVER_TEXT_VERSION)?.withdrawnAt).not.toBeNull();
    expect(rows.filter((r) => r.withdrawnAt === null)).toHaveLength(1);

    await withdrawConsent(t.db, voice);
    expect(await activeConsentTextVersion(t.db, voice)).toBeNull();
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
