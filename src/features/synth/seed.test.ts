import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadJobFixtures } from "../../../fixtures/load";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { company, digest, eventCompany, matchEvent, needCard, pick, talent } from "@/db/schema";
import { createFakeEngine } from "./fake-engine";
import { loadPersonas } from "./persona";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setLlmFake } from "@/lib/llm";
import { hasSnapshot, restoreDemoSnapshot, snapshotDemo } from "./snapshot";
import { assertNoDemoEvent } from "./script-db";
import { DEMO_EVENT_ID, helsinkiDay, resetDemo, seedDemo, type SeedSummary } from "./seed";

const personas = loadPersonas();
const NOW = new Date("2026-11-25T08:00:00Z");
let t: TestDb;
let first: SeedSummary;

beforeAll(async () => {
  t = await createTestDb();
  await loadJobFixtures(t.db);
  first = await seedDemo(t.db, { deps: createFakeEngine(t.db, { personas }), personas, now: () => NOW, appUrl: "https://example.test" });
}, 120_000);
afterAll(() => t.close());

describe("seedDemo (against the fake engine)", () => {
  it("creates the event as specified", async () => {
    const [event] = await t.db.select().from(matchEvent);
    expect(event).toMatchObject({ id: DEMO_EVENT_ID, date: "2026-11-26", format: "hybrid", slotMinutes: 15, bufferMinutes: 5, maxMeetingsPerTalent: 4, place: "Demo venue, Espoo" });
    expect(event.startsAt.toISOString()).toBe("2026-11-26T11:00:00.000Z"); // 13:00 in Helsinki
    expect(event.endsAt.toISOString()).toBe("2026-11-26T14:00:00.000Z"); // 16:00
    // 180 minutes in 20-minute slots: 9 per company.
    expect((event.endsAt.getTime() - event.startsAt.getTime()) / 60000 / (event.slotMinutes + event.bufferMinutes)).toBe(9);
  });

  it("creates masked demo companies with tokens, event rows and the pitch company as 03", async () => {
    const companies = await t.db.select().from(company);
    expect(companies).toHaveLength(8);
    for (const c of companies) {
      expect(c).toMatchObject({ masked: true, participating: true, source: "posting" });
      expect(c.displayName).toMatch(/^Demo company 0\d$/);
      expect(c.digestToken.length).toBeGreaterThanOrEqual(24);
    }
    const rows = await t.db.select().from(eventCompany);
    expect(rows.map((r) => r.number).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rows.filter((r) => r.format === "in_person")).toHaveLength(5);
    const pitch = first.companies.find((c) => c.number === 3)!;
    expect(pitch.displayName).toBe("Demo company 03");
    expect(pitch.title).toBe("UX Designer");
    expect(pitch.link).toMatch(/^https:\/\/example\.test\/c\/[\w-]{24,}$/);
  });

  it("drafts a Need Card for every company through the feature", async () => {
    const cards = await t.db.select().from(needCard);
    expect(cards.filter((c) => c.companyId)).toHaveLength(8);
  });

  it("builds a synthetic, labelled pool of fifteen people", async () => {
    const people = await t.db.select().from(talent);
    expect(people).toHaveLength(15);
    for (const p of people) expect(p).toMatchObject({ synthetic: true, liveDemo: false, inPool: true });
    expect(first.personas).toEqual({ created: 15, kept: 0 });
  });

  it("leaves every eligible synthetic person as suggested yesterday, and the pitch company undrafted today", async () => {
    expect(first.yesterday).toMatchObject({ date: "2026-11-24" });
    const published = await t.db.select().from(digest).where(and(eq(digest.date, "2026-11-24"), eq(digest.status, "published")));
    expect(published).toHaveLength(8);
    const yesterdayPicks = await t.db.select().from(pick);
    const pitchCompany = first.companies.find((c) => c.number === 3)!;
    const eligibleForPitch = yesterdayPicks.filter((p) => p.companyId === pitchCompany.companyId);
    expect(eligibleForPitch.length).toBeGreaterThanOrEqual(3);
    for (const p of yesterdayPicks.filter((p) => p.createdAt.toISOString().startsWith("2026-11-24"))) expect(p.talentId).toBeTruthy();

    expect(first.today).toMatchObject({ date: "2026-11-25", pitchLeftUndrafted: true });
    const todays = await t.db.select().from(digest).where(eq(digest.date, "2026-11-25"));
    expect(todays.length).toBeGreaterThan(0);
    expect(todays.some((d) => d.companyId === pitchCompany.companyId)).toBe(false);
    // The pitch company takes part again afterwards.
    const [row] = await t.db.select().from(company).where(eq(company.id, pitchCompany.companyId));
    expect(row.participating).toBe(true);
  });

  it("reports coverage as warnings and never throws on them", () => {
    for (const w of first.warnings) expect(w).toMatch(/^(coverage|demo postings):/);
    // Company 03 needs at least three eligible people for the demo.
    expect(first.companies.find((c) => c.number === 3)!.eligiblePeople).toBeGreaterThanOrEqual(3);
  });

  it("is idempotent: a second run changes nothing", async () => {
    const before = {
      companies: await t.db.select().from(company),
      talent: (await t.db.select().from(talent)).map((p) => p.id).sort(),
      picks: (await t.db.select().from(pick)).length,
      digests: (await t.db.select().from(digest)).length,
    };
    const second = await seedDemo(t.db, { deps: createFakeEngine(t.db, { personas }), personas, now: () => NOW, appUrl: "https://example.test" });
    expect(second.personas).toEqual({ created: 0, kept: 15 });
    expect(second.companies.map((c) => c.link)).toEqual(first.companies.map((c) => c.link));
    expect(second.yesterday.digests).toBe(0);
    expect((await t.db.select().from(company)).map((c) => c.digestToken).sort()).toEqual(before.companies.map((c) => c.digestToken).sort());
    expect((await t.db.select().from(talent)).map((p) => p.id).sort()).toEqual(before.talent);
    expect((await t.db.select().from(pick)).length).toBe(before.picks);
    expect((await t.db.select().from(digest)).length).toBe(before.digests);
  });

  it("restores the same state after --reset, with fresh people and the same companies", async () => {
    const idsBefore = (await t.db.select().from(talent)).map((p) => p.id);
    const again = await seedDemo(t.db, { deps: createFakeEngine(t.db, { personas }), personas, now: () => NOW, reset: true, appUrl: "https://example.test" });
    expect(again.personas).toEqual({ created: 15, kept: 0 });
    expect(again.companies.map((c) => [c.number, c.title])).toEqual(first.companies.map((c) => [c.number, c.title]));
    expect(again.today.pitchLeftUndrafted).toBe(true);
    const idsAfter = (await t.db.select().from(talent)).map((p) => p.id);
    expect(idsAfter).toHaveLength(15);
    expect(idsAfter.some((id) => idsBefore.includes(id))).toBe(false);
  });

  it("resetDemo removes rehearsal live-demo people and leaves real people alone", async () => {
    await t.db.insert(talent).values([
      { id: "tal_live", handle: "Live-01", synthetic: false, liveDemo: true },
      { id: "tal_real", handle: "Real-01", synthetic: false, liveDemo: false },
    ]);
    await resetDemo(t.db);
    expect((await t.db.select().from(talent)).map((p) => p.id)).toEqual(["tal_real"]);
    expect(await t.db.select().from(company)).toHaveLength(0);
    expect(await t.db.select().from(matchEvent)).toHaveLength(0);
  });
});

describe("snapshot and restore", () => {
  it("restores the generated state without any model or interview call, and rebuilds the digests", async () => {
    await resetDemo(t.db);
    await seedDemo(t.db, { deps: createFakeEngine(t.db, { personas }), personas, now: () => NOW, appUrl: "https://example.test" });
    const dir = mkdtempSync(path.join(tmpdir(), "snap-"));
    try {
      expect(hasSnapshot(dir)).toBe(false);
      const counts = await snapshotDemo(t.db, dir);
      expect(hasSnapshot(dir)).toBe(true);
      expect(counts.talent).toBe(15);
      expect(counts.company).toBe(8);
      const before = {
        talents: (await t.db.select().from(talent)).map((p) => [p.id, p.handle, p.createdAt.toISOString()]).sort(),
        tokens: (await t.db.select().from(company)).map((c) => c.digestToken).sort(),
        needs: (await t.db.select().from(needCard)).map((n) => n.id).sort(),
      };
      // A rehearsal presenter is in the pool too.
      await t.db.insert(talent).values({ id: "tal_rehearsal", handle: "Rehearse-01", synthetic: false, liveDemo: true, inPool: true });

      const real = createFakeEngine(t.db, { personas });
      const forbidden = () => {
        throw new Error("a model-backed feature was called during restore");
      };
      setLlmFake(forbidden);
      try {
        const summary = await restoreDemoSnapshot(t.db, {
          deps: { ...real, startInterview: forbidden, submitTurn: forbidden, settleInterview: forbidden, draftNeedCard: forbidden, computeEligibility: forbidden, runQueue: forbidden } as never,
          personas,
          now: () => NOW,
          appUrl: "https://example.test",
          dir,
        });
        expect(summary.personas).toEqual({ created: 0, kept: 15 });
        expect(summary.yesterday.digests).toBe(8);
        expect(summary.today.pitchLeftUndrafted).toBe(true);
        expect(summary.eligibilityRows).toBeGreaterThan(0);
      } finally {
        setLlmFake(null);
      }
      const after = {
        talents: (await t.db.select().from(talent)).map((p) => [p.id, p.handle, p.createdAt.toISOString()]).sort(),
        tokens: (await t.db.select().from(company)).map((c) => c.digestToken).sort(),
        needs: (await t.db.select().from(needCard)).map((n) => n.id).sort(),
      };
      expect(after).toEqual(before); // same people, same company links, same Need Cards; the rehearsal presenter is gone
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);

  it("refuses to restore when there is no snapshot", async () => {
    await expect(restoreDemoSnapshot(t.db, { deps: createFakeEngine(t.db, { personas }), personas, dir: path.join(tmpdir(), "no-such-snapshot") })).rejects.toThrow(/No snapshot/);
  });
});

describe("assertNoDemoEvent", () => {
  it("refuses once the demo event exists", async () => {
    await resetDemo(t.db);
    await expect(assertNoDemoEvent(t.db, DEMO_EVENT_ID)).resolves.toBeUndefined();
    await seedDemo(t.db, { deps: createFakeEngine(t.db, { personas }), personas, now: () => NOW, appUrl: "https://example.test" });
    await expect(assertNoDemoEvent(t.db, DEMO_EVENT_ID)).rejects.toThrow(/demo event/);
  }, 120_000);
});

describe("helsinkiDay", () => {
  it("uses the Helsinki calendar day", () => {
    expect(helsinkiDay(new Date("2026-11-25T22:30:00Z"))).toBe("2026-11-26");
    expect(helsinkiDay(new Date("2026-11-25T21:30:00Z"))).toBe("2026-11-25");
  });
});
