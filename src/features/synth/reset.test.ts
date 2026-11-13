/**
 * `resetDemoFromSnapshot` (docs/FEATURE-API.md): restore the snapshot with no model call for the
 * interviews, cards and Need Cards, and draft today's picks again, with code-written reasons when
 * the model is away.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { company, digest, llmCall, pick, talent } from "@/db/schema";
import { resetLlmState, setLlmFake } from "@/lib/llm";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { loadJobFixtures } from "../../../fixtures/load";
import { createFakeEngine } from "./fake-engine";
import { loadPersonas } from "./persona";

const holder = vi.hoisted(() => ({ dir: "", has: true }));
vi.mock("./snapshot", async (importOriginal) => {
  const original = await importOriginal<typeof import("./snapshot")>();
  return {
    ...original,
    hasSnapshot: () => holder.has,
    restoreDemoSnapshot: (db: Parameters<typeof original.restoreDemoSnapshot>[0], options: Parameters<typeof original.restoreDemoSnapshot>[1]) =>
      original.restoreDemoSnapshot(db, { ...options, dir: holder.dir }),
  };
});

import { resetDemoFromSnapshot } from "./index";
import { snapshotDemo } from "./snapshot";
import { seedDemo } from "./seed";

const personas = loadPersonas();
let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await loadJobFixtures(t.db);
  await seedDemo(t.db, { deps: createFakeEngine(t.db, { personas }), personas, appUrl: "https://example.test" });
  holder.dir = mkdtempSync(path.join(tmpdir(), "reset-"));
  await snapshotDemo(t.db, holder.dir);
}, 240_000);
afterAll(async () => {
  resetLlmState();
  rmSync(holder.dir, { recursive: true, force: true });
  await t.close();
});

describe("resetDemoFromSnapshot", () => {
  it("changes nothing and says so when there is no snapshot", async () => {
    holder.has = false;
    const before = (await t.db.select().from(talent)).length;
    expect(await resetDemoFromSnapshot(t.db)).toEqual({ restored: false, people: 0, companies: 0 });
    expect((await t.db.select().from(talent)).length).toBe(before);
    holder.has = true;
  });

  it("restores the people and companies and drafts today's picks even when the model fails", async () => {
    await t.db.insert(talent).values({ id: "tal_rehearsal", handle: "Rehearse-01", synthetic: false, liveDemo: true, inPool: true });
    setLlmFake(() => {
      throw new Error("the model is away");
    });
    const result = await resetDemoFromSnapshot(t.db);
    expect(result).toEqual({ restored: true, people: 15, companies: 8 });
    expect(await t.db.select().from(talent).where(eq(talent.id, "tal_rehearsal"))).toHaveLength(0);

    const [pitch] = await t.db.select().from(company).where(eq(company.id, "co_demo03"));
    expect(pitch.participating).toBe(true);
    const todays = await t.db.select().from(digest).where(eq(digest.status, "draft"));
    expect(todays.length).toBeGreaterThan(0);
    expect(todays.some((d) => d.companyId === "co_demo03")).toBe(false); // the live "run today's picks" has something to do
    const picks = await t.db.select().from(pick).where(eq(pick.status, "suggested"));
    expect(picks.length).toBeGreaterThan(0);
    // The stand-in engine's Need Cards have no requirements, so no pick has a pair to word a reason for.
    // With a real Need Card the picks feature words reasons with its own deadline and falls back to code.
    // The only model calls a reset may make are the picks' reasons.
    const calls = await t.db.select({ purpose: llmCall.purpose }).from(llmCall);
    expect(calls.every((c) => c.purpose === "picks.reasons")).toBe(true);
  }, 180_000);
});
