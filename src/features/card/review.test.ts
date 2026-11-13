import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { talent, auditLog, jobQueue } from "@/db/schema";
import { listAudit } from "@/lib/audit";
import { HttpError } from "@/lib/http";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { cardForCompany, cardForOrganiser, cardForPerson } from "./projections";
import { CardEdit, editCard } from "./review";
import { loadCard } from "./store";
import { seedCard, seedEsco, seedInterview, signal } from "./test-helpers";

let t: TestDb;
const TALENT = "tal_test00000001";
beforeAll(async () => {
  t = await createTestDb();
  await seedEsco(t.db);
}, 120_000);
afterAll(() => t.close());
beforeEach(async () => {
  await t.db.delete(talent);
  await t.db.delete(auditLog);
  await seedInterview(t.db);
});

const base = () => ({
  status: "draft" as const,
  signals: [
    signal({ id: "s1", phrase: "Receiving goods" }),
    signal({ id: "s2", phrase: "Filing supplier claims" }),
    signal({ id: "s3", phrase: "SAP", kind: "tool" }),
  ],
});

describe("editCard", () => {
  it("removes a signal, keeps it for undo, drops it from the summary and audits ids only", async () => {
    await seedCard(t.db, TALENT, base());
    await editCard(t.db, TALENT, { op: "remove", signalId: "s2" });
    const card = (await loadCard(t.db, TALENT, "draft"))!;
    expect(card.signals.find((s) => s.id === "s2")!.status).toBe("removed");
    expect(card.companyView.summary).toBe("They talked about receiving goods and SAP.");
    const p = (await cardForPerson(t.db, TALENT))!;
    expect(p.signals.find((s) => s.id === "s2")!.status).toBe("removed");
    const [ev] = await listAudit(t.db, { action: "card.signal_removed" });
    expect(ev.detail).toEqual({ signalId: "s2", version: 1 });

    await editCard(t.db, TALENT, { op: "restore", signalId: "s2" });
    expect((await loadCard(t.db, TALENT, "draft"))!.signals.find((s) => s.id === "s2")!.status).toBe("proposed");
  });

  it("rebuilds the headline after any remove, even when it only paraphrases the phrase", async () => {
    await seedCard(t.db, TALENT, base());
    // seeded headline is "Goods receiving and SAP": a paraphrase of "Receiving goods"
    await editCard(t.db, TALENT, { op: "remove", signalId: "s1" });
    const card = (await loadCard(t.db, TALENT, "draft"))!;
    expect(card.headline).toBe("Filing supplier claims, SAP");
    expect(card.headline.toLowerCase()).not.toContain("receiving");
  });

  it("serialises concurrent edits so none is lost", async () => {
    await seedCard(t.db, TALENT, base());
    await Promise.all([
      editCard(t.db, TALENT, { op: "remove", signalId: "s2" }),
      editCard(t.db, TALENT, { op: "remove", signalId: "s3" }),
    ]);
    const card = (await loadCard(t.db, TALENT, "draft"))!;
    expect(card.signals.map((s) => `${s.id}:${s.status}`)).toEqual(["s1:proposed", "s2:removed", "s3:removed"]);
  });

  it("edits a phrase: stores the person's wording, keeps the previous English phrase and text, marks it stale, queues a re-render", async () => {
    await seedCard(t.db, TALENT, base());
    const before = (await loadCard(t.db, TALENT, "draft"))!;
    const r = await editCard(t.db, TALENT, { op: "phrase", signalId: "s2", phrase: "Toimittajareklamaatioiden hoito" });
    expect(r).toEqual({ sensitive: false });
    const card = (await loadCard(t.db, TALENT, "draft"))!;
    const s = card.signals.find((x) => x.id === "s2")!;
    expect(s).toMatchObject({ phrase: "Filing supplier claims", phraseOwn: "Toimittajareklamaatioiden hoito" });
    expect(card.companyView.items.find((i) => i.signalId === "s2")).toEqual({
      ...before.companyView.items.find((i) => i.signalId === "s2")!,
      stale: true,
    });
    expect(card.companyView.summary).toBe(before.companyView.summary.replace("goods receiving and SAP", "receiving goods, filing supplier claims and SAP"));
    const [ev] = await listAudit(t.db, { action: "card.signal_edited" });
    expect(ev.detail).toEqual({ signalId: "s2", version: 1 });
    expect(JSON.stringify(ev.detail)).not.toContain("supplier");
    const jobs = await t.db.select().from(jobQueue).where(eq(jobQueue.kind, "card.render"));
    expect(jobs.map((j) => j.payload)).toEqual([{ talentId: TALENT, signalId: "s2", cardVersion: 1 }]);
  });

  it("an edit in Finnish never appears in the company or organiser view, even before the re-render", async () => {
    await seedCard(t.db, TALENT, { ...base(), status: "approved" });
    await editCard(t.db, TALENT, { op: "phrase", signalId: "s2", phrase: "Toimittajareklamaatioiden hoito" });
    await seedCard(t.db, TALENT, { ...base(), status: "approved" }); // approved row untouched by the draft
    const company = JSON.stringify(await cardForCompany(t.db, TALENT));
    const organiser = JSON.stringify(await cardForOrganiser(t.db, TALENT));
    expect(company).not.toContain("Toimittaja");
    expect(organiser).not.toContain("Toimittaja");
    expect((await cardForPerson(t.db, TALENT))!.signals.find((x) => x.id === "s2")).toMatchObject({
      phraseOwn: "Toimittajareklamaatioiden hoito",
      stale: true,
    });
  });

  it("warns about a protected word in the person's own phrase but keeps it (their choice)", async () => {
    await seedCard(t.db, TALENT, base());
    const r = await editCard(t.db, TALENT, { op: "phrase", signalId: "s1", phrase: "Nigerian food" });
    expect(r).toEqual({ sensitive: true });
    expect((await loadCard(t.db, TALENT, "draft"))!.signals[0].phraseOwn).toBe("Nigerian food");
  });

  it("refuses a phrase that is only quality words, and an unknown signal", async () => {
    await seedCard(t.db, TALENT, base());
    await expect(editCard(t.db, TALENT, { op: "phrase", signalId: "s1", phrase: "expert" })).rejects.toMatchObject({ code: "invalid_phrase" });
    await expect(editCard(t.db, TALENT, { op: "remove", signalId: "s99" })).rejects.toMatchObject({ code: "no_signal" });
  });

  it("edits lookingFor, trimming and capping lists", async () => {
    await seedCard(t.db, TALENT, base());
    await editCard(t.db, TALENT, {
      op: "lookingFor",
      lookingFor: { roles: [" Cook ", "Cook", "", "Baker"], workMode: "remote", startFrom: "now", workLanguages: ["Finnish"] },
    });
    const card = (await loadCard(t.db, TALENT, "draft"))!;
    expect(card.lookingFor).toEqual({ roles: ["Cook", "Baker"], workMode: "remote", startFrom: "now", workLanguages: ["Finnish"] });
    const [ev] = await listAudit(t.db, { action: "card.looking_for_edited" });
    expect(ev.detail).toEqual({ version: 1, roles: 2, languages: 1 });
  });

  it("creates a draft at the next version when only an approved card exists, leaving the approved one alone", async () => {
    await seedCard(t.db, TALENT, { status: "approved", version: 4, signals: base().signals.map((s) => ({ ...s, status: "approved" as const })) });
    await editCard(t.db, TALENT, { op: "remove", signalId: "s1" });
    const draft = (await loadCard(t.db, TALENT, "draft"))!;
    expect(draft.version).toBe(5);
    expect(draft.approvedAt).toBeNull();
    expect(draft.signals.map((s) => s.status)).toEqual(["removed", "proposed", "proposed"]);
    const approved = (await loadCard(t.db, TALENT, "approved"))!;
    expect(approved.version).toBe(4);
    expect(approved.signals.every((s) => s.status === "approved")).toBe(true);
    expect((await cardForPerson(t.db, TALENT))).toMatchObject({ status: "draft", hasApprovedVersion: true });
  });

  it("refuses when there is no card", async () => {
    await expect(editCard(t.db, TALENT, { op: "remove", signalId: "s1" })).rejects.toBeInstanceOf(HttpError);
  });

  it("validates edit bodies", () => {
    expect(CardEdit.safeParse({ op: "phrase", signalId: "s1", phrase: "x" }).success).toBe(false);
    expect(CardEdit.safeParse({ op: "remove", signalId: "nope" }).success).toBe(false);
    expect(CardEdit.safeParse({ op: "lookingFor", lookingFor: { roles: ["a", "b", "c", "d"], workMode: null, startFrom: null, workLanguages: [] } }).success).toBe(false);
    expect(CardEdit.safeParse({ op: "phrase", signalId: "s1", phrase: "  Receiving goods  " }).data).toMatchObject({ phrase: "Receiving goods" });
  });
});
