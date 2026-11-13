import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { auditLog, consent, jobQueue, signal as signalTable, signalCard, talent, talentLanguage } from "@/db/schema";
import { listAudit } from "@/lib/audit";
import { HttpError } from "@/lib/http";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { approveCard, setPoolOptIn } from "./approval";
import { loadCard } from "./store";
import { seedCard, seedInterview, signal } from "./test-helpers";

let t: TestDb;
const TALENT = "tal_test00000001";
beforeAll(async () => {
  t = await createTestDb();
}, 120_000);
afterAll(() => t.close());
beforeEach(async () => {
  await t.db.delete(talent);
  await t.db.delete(auditLog);
  await t.db.delete(jobQueue);
  await seedInterview(t.db, { liveSignals: [{ id: "s7", phrase: "Old live note" }] });
});

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof HttpError ? e.code : String(e);
  }
  return "no error";
};

describe("approveCard", () => {
  it("turns the draft into the approved row and syncs signals, languages, audit and queue", async () => {
    await seedCard(t.db, TALENT, {
      status: "draft",
      version: 1,
      lookingFor: { workLanguages: ["Finnish", "suomi", "svenska", "Klingon", "English"] },
      signals: [
        signal({ id: "s1", phrase: "Receiving goods", esco: { uri: "u1", labelEn: "receive goods", labelFi: "vastaanottaa tavaraa" } }),
        signal({ id: "s2", phrase: "Dropped one", status: "removed" }),
        signal({ id: "s3", phrase: "SAP", kind: "tool", hasExample: false }),
      ],
    });
    expect(await approveCard(t.db, TALENT)).toEqual({ version: 1 });

    expect(await loadCard(t.db, TALENT, "draft")).toBeNull();
    const approved = (await loadCard(t.db, TALENT, "approved"))!;
    expect(approved.status).toBe("approved");
    expect(approved.approvedAt).toBeTruthy();
    expect(approved.signals.map((s) => [s.id, s.status])).toEqual([["s1", "approved"], ["s3", "approved"]]);
    expect(approved.companyView.items.map((i) => i.signalId)).toEqual(["s1", "s3"]);

    const rows = await t.db.select().from(signalTable).where(eq(signalTable.talentId, TALENT)).orderBy(signalTable.id);
    expect(rows.map((r) => [r.id, r.status, r.phrase, r.escoUri, r.hasExample])).toEqual([
      ["s1", "approved", "Receiving goods", "u1", true],
      ["s3", "approved", "SAP", null, false],
    ]);
    const langs = await t.db.select().from(talentLanguage).where(eq(talentLanguage.talentId, TALENT));
    expect(langs.map((l) => `${l.code}:${l.basis}`).sort()).toEqual(["en:declared", "fi:declared", "sv:declared"]);

    const [ev] = await listAudit(t.db, { action: "card.approved" });
    expect(ev.detail).toEqual({ version: 1, signalCount: 2 });
    const jobs = await t.db.select().from(jobQueue);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].kind).toBe("matching.card_approved");
    expect(jobs[0].payload).toEqual({ talentId: TALENT, cardVersion: 1 });
  });

  it("refuses a stale rendering, an empty card, a missing draft and a signal with no evidence", async () => {
    await seedCard(t.db, TALENT, { status: "draft", signals: [signal({ id: "s1", phrase: "A" + "bc" }), signal({ id: "s2", phrase: "Def" })], stale: ["s2"] });
    expect(await code(approveCard(t.db, TALENT))).toBe("stale_rendering");

    await seedCard(t.db, TALENT, { status: "draft", signals: [signal({ id: "s1", phrase: "Abc", status: "removed" })] });
    expect(await code(approveCard(t.db, TALENT))).toBe("approve_empty");

    await seedCard(t.db, TALENT, { status: "draft", signals: [signal({ id: "s1", phrase: "Abc", evidence: [] })] });
    expect(await code(approveCard(t.db, TALENT))).toBe("evidence_invalid");

    await t.db.delete(signalCard);
    expect(await code(approveCard(t.db, TALENT))).toBe("no_draft");
    // nothing changed on refusal
    expect(await t.db.select().from(jobQueue)).toHaveLength(0);
    expect((await t.db.select().from(signalTable)).map((r) => r.id)).toEqual(["s7"]);
  });

  it("allows a person-added signal with no evidence", async () => {
    await seedCard(t.db, TALENT, { status: "draft", signals: [signal({ id: "s1", phrase: "Welding", evidence: [], addedBy: "person" })] });
    expect(await approveCard(t.db, TALENT)).toEqual({ version: 1 });
  });

  it("keeps only the new version after a second approval and audits both", async () => {
    await seedCard(t.db, TALENT, { status: "draft", signals: [signal({ id: "s1", phrase: "Abc" })] });
    await approveCard(t.db, TALENT);
    await seedCard(t.db, TALENT, { status: "draft", version: 2, signals: [signal({ id: "s1", phrase: "Abc" }), signal({ id: "s2", phrase: "Def" })] });
    expect(await approveCard(t.db, TALENT)).toEqual({ version: 2 });
    const cards = await t.db.select().from(signalCard).where(eq(signalCard.talentId, TALENT));
    expect(cards.map((c) => [c.status, c.version])).toEqual([["approved", 2]]);
    const events = await listAudit(t.db, { action: "card.approved" });
    expect(events.map((e) => e.detail.version).sort()).toEqual([1, 2]);
    expect((await t.db.select().from(jobQueue)).map((j) => (j.payload as { cardVersion: number }).cardVersion).sort()).toEqual([1, 2]);
    expect(await t.db.select().from(signalTable).where(eq(signalTable.talentId, TALENT))).toHaveLength(2);
  });
});

describe("approveCard concurrency", () => {
  it("does not approve a signal removed at the same moment", async () => {
    await seedCard(t.db, TALENT, { status: "draft", signals: [signal({ id: "s1", phrase: "Abc" }), signal({ id: "s2", phrase: "Def" })] });
    const { editCard } = await import("./review");
    await Promise.allSettled([approveCard(t.db, TALENT), editCard(t.db, TALENT, { op: "remove", signalId: "s2" })]);
    const approved = (await loadCard(t.db, TALENT, "approved"))!;
    const draft = await loadCard(t.db, TALENT, "draft");
    // either the removal landed first (s2 not approved) or it became a new draft on top of the approval
    if (draft) expect(draft.signals.find((s) => s.id === "s2")!.status).toBe("removed");
    else expect(approved.signals.map((s) => s.id)).toEqual(["s1"]);
  });
});

describe("setPoolOptIn", () => {
  it("requires an approved card", async () => {
    await seedCard(t.db, TALENT, { status: "draft", signals: [signal({ id: "s1", phrase: "Abc" })] });
    expect(await code(setPoolOptIn(t.db, TALENT, true))).toBe("no_approved_card");
    const [p] = await t.db.select().from(talent).where(eq(talent.id, TALENT));
    expect(p.inPool).toBe(false);
  });

  it("opts in with a consent record and audit, and out again", async () => {
    await seedCard(t.db, TALENT, { status: "approved", signals: [signal({ id: "s1", phrase: "Abc" })] });
    await setPoolOptIn(t.db, TALENT, true);
    await setPoolOptIn(t.db, TALENT, true); // idempotent
    const inPool = async () => (await t.db.select().from(talent).where(eq(talent.id, TALENT)))[0].inPool;
    expect(await inPool()).toBe(true);
    const grants = () => t.db.select().from(consent).where(and(eq(consent.subjectId, TALENT), eq(consent.kind, "pool")));
    expect((await grants()).map((c) => c.withdrawnAt === null)).toEqual([true]);
    expect(await listAudit(t.db, { action: "pool.opted_in" })).toHaveLength(1);

    await setPoolOptIn(t.db, TALENT, false);
    expect(await inPool()).toBe(false);
    expect((await grants())[0].withdrawnAt).not.toBeNull();
    expect(await listAudit(t.db, { action: "pool.opted_out" })).toHaveLength(1);
    await setPoolOptIn(t.db, TALENT, false);
    expect(await listAudit(t.db, { action: "pool.opted_out" })).toHaveLength(1);

    await setPoolOptIn(t.db, TALENT, true);
    expect((await grants()).length).toBe(2);
  });

  it("enqueues an eligibility recompute on opt-in and on opt-out", async () => {
    await seedCard(t.db, TALENT, { status: "approved", signals: [signal({ id: "s1", phrase: "Abc" })] });
    await t.db.delete(jobQueue);
    await setPoolOptIn(t.db, TALENT, true);
    const open = async () => (await t.db.select().from(jobQueue)).filter((j) => j.kind === "matching.card_approved");
    expect(await open()).toHaveLength(1);
    await t.db.update(jobQueue).set({ doneAt: new Date() });
    await setPoolOptIn(t.db, TALENT, false);
    expect((await open()).filter((j) => j.doneAt === null)).toHaveLength(1);
  });

  it("opting out never needs an approved card", async () => {
    await setPoolOptIn(t.db, TALENT, false);
  });
});
