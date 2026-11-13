/**
 * Labelling a simulated person (LEAD-DECISIONS, 14 Nov): the simulator starts an interview the way
 * the public page does, so the person is a live demo session due for purging in 24 hours; the
 * update that marks them synthetic clears that. Real features, scripted model.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { talent } from "@/db/schema";
import { purgeLiveSessions } from "@/features/card";
import { resetLlmState, setLlmFake } from "@/lib/llm";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { loadJobFixtures } from "../../../fixtures/load";
import { journeyModel } from "./journey-model";
import { loadPersonas } from "./persona";
import { beginSimulated, labelSynthetic, readTranscript, runSimulatedInterview, SIMULATED_TRANSCRIPT_LINE } from "./run";

const persona = loadPersonas().find((p) => p.id === "p02")!;
const IN_30_DAYS = () => new Date(Date.now() + 30 * 24 * 3600 * 1000);
const IN_25_HOURS = () => new Date(Date.now() + 25 * 3600 * 1000);

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await loadJobFixtures(t.db);
  setLlmFake(journeyModel({ persona, need: { postingTitle: "none", title: "x", summary: "x", items: [] } }).fake);
}, 120_000);
afterAll(async () => {
  resetLlmState();
  await t.close();
});

const rowOf = async (id: string) => (await t.db.select().from(talent).where(eq(talent.id, id)))[0];

describe("labelling a simulated person", () => {
  it("a person the simulator failed to label is a live session that the purge removes", async () => {
    const started = await beginSimulated(t.db, persona, "express");
    const row = await rowOf(started.talentId);
    expect(row).toMatchObject({ synthetic: false, liveDemo: true });
    expect(row.purgeAfter).not.toBeNull();
    expect(await purgeLiveSessions(t.db, IN_25_HOURS())).toBe(1);
    expect(await rowOf(started.talentId)).toBeUndefined();
  });

  it("the same update that sets synthetic clears purgeAfter and liveDemo", async () => {
    const started = await beginSimulated(t.db, persona, "express");
    await labelSynthetic(t.db, started.talentId, persona);
    expect(await rowOf(started.talentId)).toMatchObject({ synthetic: true, liveDemo: false, purgeAfter: null, personaKey: persona.id });
    expect(await purgeLiveSessions(t.db, IN_30_DAYS())).toBe(0);
    expect(await rowOf(started.talentId)).toBeDefined();
    await t.db.delete(talent).where(eq(talent.id, started.talentId));
  });

  it("runSimulatedInterview runs through the real features by default and leaves nobody due for purging", async () => {
    const run = await runSimulatedInterview(t.db, persona, "express", { settleTimeoutMs: 20_000 });
    expect(run.person.status).toBe("approved");
    expect(run.person.signals.length).toBeGreaterThan(0);
    expect(await rowOf(run.talentId)).toMatchObject({ synthetic: true, liveDemo: false, purgeAfter: null, inPool: true });
    expect(await purgeLiveSessions(t.db, IN_30_DAYS())).toBe(0);
    expect(await rowOf(run.talentId)).toBeDefined();
  }, 120_000);
});

describe("the transcript a view receives", () => {
  it("carries the simulated-interview line for a synthetic person and none for a real one", async () => {
    const [synthetic] = await t.db.select().from(talent).where(eq(talent.synthetic, true));
    const { interview } = await import("@/db/schema");
    const [iv] = await t.db.select().from(interview).where(eq(interview.talentId, synthetic.id));
    const view = await readTranscript(t.db, iv.id);
    expect(view.systemLine).toBe(SIMULATED_TRANSCRIPT_LINE);
    expect(view.turns[0]).toMatchObject({ role: "interviewer", kind: "opening" });

    const { startInterview } = await import("@/features/interview");
    const real = await startInterview(t.db, { mode: "express", uiLang: "en", consent: { interview: true, voiceVendor: false, liveDemo: true } });
    expect((await readTranscript(t.db, real.interviewId)).systemLine).toBeNull();
  });
});
