import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditLog, escoConcept, jobQueue, signal as signalTable, talent } from "@/db/schema";
import type { LlmOptions } from "@/lib/llm";
import { resetLlmState, setLlmFake } from "@/lib/llm/testing";
import { runReadyJobs } from "@/lib/queue";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { jobs } from "./jobs";
import { cardForCompany, cardForOrganiser, cardForPerson, cardPageView } from "./projections";
import { RENDER_SYSTEM_PROMPT, renderSignal } from "./render";
import { editCard } from "./review";
import { approveCard } from "./approval";
import { loadCard, saveCard } from "./store";
import { seedCard, seedEsco, seedInterview, signal } from "./test-helpers";

let t: TestDb;
const TALENT = "tal_test00000001";
beforeAll(async () => {
  t = await createTestDb();
  await seedEsco(t.db);
}, 120_000);
afterAll(() => t.close());
afterEach(() => resetLlmState());
beforeEach(async () => {
  await t.db.delete(talent);
  await t.db.delete(auditLog);
  await t.db.delete(jobQueue);
  await seedInterview(t.db);
  await seedCard(t.db, TALENT, {
    status: "draft",
    signals: [
      signal({ id: "s1", phrase: "Receiving goods", evidence: [{ turnIndex: 1, sentenceFrom: 1, sentenceTo: 1 }] }),
      signal({ id: "s2", phrase: "Filing supplier claims", evidence: [{ turnIndex: 3, sentenceFrom: 1, sentenceTo: 2 }] }),
      signal({ id: "s3", phrase: "Welding", addedBy: "person", evidence: [] }),
    ],
  });
});

const OWN = "Toimittajareklamaatioiden hoito";
const good = { items: [{ i: 0, phrase: "Handling supplier claims", text: "They documented a short delivery and filed a claim with the supplier." }], };
const edit = (signalId = "s2", phrase = OWN) => editCard(t.db, TALENT, { op: "phrase", signalId, phrase });
const rendered = async (id = "s2") => {
  const card = (await loadCard(t.db, TALENT, "draft")) ?? (await loadCard(t.db, TALENT, "approved"))!;
  return { signal: card.signals.find((s) => s.id === id)!, item: card.companyView.items.find((i) => i.signalId === id), card };
};

describe("renderSignal (prompt B)", () => {
  it("rewrites phrase and company text from the person's wording and evidence, as an analyst call with a 15 s deadline", async () => {
    await edit();
    let seen: LlmOptions | undefined;
    setLlmFake((o) => {
      if (o.purpose === "card.render") seen = o;
      return o.purpose === "card.esco_pick" ? { picks: [] } : good;
    });
    expect(await renderSignal(t.db, { talentId: TALENT, signalId: "s2", cardVersion: 1 })).toBe("applied");
    expect(seen).toMatchObject({ role: "analyst", purpose: "card.render", deadlineMs: 15_000 });
    expect(seen?.messages[1].content).toContain(`phrase: ${OWN}`);
    expect(seen?.messages[1].content).toContain("- Once a truck came with the wrong pallets");
    const { signal: s, item, card } = await rendered();
    expect(s).toMatchObject({ phrase: "Handling supplier claims", phraseOwn: OWN });
    // The text matcher accepts near-exact labels only; a looser but right label such as
    // "manage supplier claims" is the model's to pick among candidates (prompt C).
    expect(s.esco ?? null).toBeNull();
    expect(item).toEqual({ signalId: "s2", text: good.items[0].text, stale: false });
    expect(card.companyView.summary).toContain("handling supplier claims");
  });

  it("is a queue job: the edit returns at once and the worker applies the rewrite", async () => {
    await edit();
    expect((await rendered()).item?.stale).toBe(true);
    setLlmFake(() => good);
    expect(await runReadyJobs(t.db, jobs)).toBe(1);
    expect((await rendered()).item?.stale).toBe(false);
  });

  it.each([
    ["the model call fails", () => { throw new Error("429"); }],
    ["the phrase is not translated", () => ({ items: [{ i: 0, phrase: "Reklamaatioiden käsittely", text: "They handled claims for a supplier." }] })],
    ["the phrase has an evaluative word", () => ({ items: [{ i: 0, phrase: "Junior claims handling", text: "They handled claims for a supplier." }] })],
    ["the text quotes the person", () => ({ items: [{ i: 0, phrase: "Handling claims", text: "I checked every pallet against the delivery note, took photos and filed the claim in SAP before the driver left." }] })],
    ["the text mentions speaking", () => ({ items: [{ i: 0, phrase: "Handling claims", text: "They spoke about claims in the interview." }] })],
    ["the text praises", () => ({ items: [{ i: 0, phrase: "Handling claims", text: "They are an excellent claims handler." }] })],
  ])("keeps the previous text when %s", async (_n, answer) => {
    const before = await rendered();
    await edit();
    setLlmFake(answer);
    expect(await renderSignal(t.db, { talentId: TALENT, signalId: "s2", cardVersion: 1 })).toBe("kept");
    const after = await rendered();
    expect(after.signal.phrase).toBe(before.signal.phrase);
    expect(after.item).toEqual({ ...before.item, stale: false }); // earlier text stays, no longer shown as pending
    expect((await cardForPerson(t.db, TALENT))!.signals.find((s) => s.id === "s2")?.stale).toBe(false);
  });

  it("a stale job for an older version changes nothing", async () => {
    await edit();
    let called = false;
    setLlmFake(() => { called = true; return good; });
    expect(await renderSignal(t.db, { talentId: TALENT, signalId: "s2", cardVersion: 0 + 7 })).toBe("kept");
    expect(called).toBe(false);
    expect((await rendered()).signal.phrase).toBe("Filing supplier claims");
  });

  it("discards an answer when the person changed the wording while the model was working", async () => {
    await edit();
    setLlmFake(async () => {
      await edit("s2", "Reklamaatioiden käsittely");
      return good;
    });
    expect(await renderSignal(t.db, { talentId: TALENT, signalId: "s2", cardVersion: 1 })).toBe("kept");
    expect((await rendered()).signal).toMatchObject({ phrase: "Filing supplier claims", phraseOwn: "Reklamaatioiden käsittely" });
  });

  it("a signal with no previous text stays out of the company view until the rewrite succeeds; code writes the fixed sentence when there is no evidence", async () => {
    const draft0 = (await loadCard(t.db, TALENT, "draft"))!;
    await saveCard(t.db, TALENT, { ...draft0, companyView: { ...draft0.companyView, items: draft0.companyView.items.filter((i) => i.signalId !== "s3") } });
    await approveCard(t.db, TALENT); // s3 has no text yet
    expect((await cardForCompany(t.db, TALENT))!.signals.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect((await cardForOrganiser(t.db, TALENT))!.signals.map((s) => s.id)).toEqual(["s1", "s2"]);
    await edit("s3", "Hitsaus");
    const row = await t.db.select().from(signalTable).where(eq(signalTable.id, "s3"));
    expect(row).toHaveLength(1);
    // approved card: the edit made a draft at version 2
    setLlmFake(() => ({ items: [{ i: 0, phrase: "Welding", text: "They are an excellent welder." }] }));
    expect(await renderSignal(t.db, { talentId: TALENT, signalId: "s3", cardVersion: 2 })).toBe("applied");
    const draft = (await loadCard(t.db, TALENT, "draft"))!;
    expect(draft.companyView.items.find((i) => i.signalId === "s3")?.text).toBe("They list welding as a skill.");
    expect((await cardForCompany(t.db, TALENT))!.signals.map((s) => s.id)).toEqual(["s1", "s2"]); // approved v1 unchanged
  });

  it("approval never waits, and a rewrite that lands after approval never changes the approved card: it goes into a new draft", async () => {
    await edit();
    await approveCard(t.db, TALENT);
    const companyBefore = JSON.stringify(await cardForCompany(t.db, TALENT));
    const organiserBefore = JSON.stringify(await cardForOrganiser(t.db, TALENT));
    const rowsBefore = JSON.stringify(await t.db.select().from(signalTable).orderBy(signalTable.id));
    expect(companyBefore).not.toContain("Toimittaja");
    expect(await loadCard(t.db, TALENT, "draft")).toBeNull();
    setLlmFake((o) => (o.purpose === "card.esco_pick" ? { picks: [{ i: 0, choice: 1 }] } : good));
    expect(await renderSignal(t.db, { talentId: TALENT, signalId: "s2", cardVersion: 1 })).toBe("applied");
    // what companies and the organiser read, and the signal rows, are exactly as approved
    expect(JSON.stringify(await cardForCompany(t.db, TALENT))).toBe(companyBefore);
    expect(JSON.stringify(await cardForOrganiser(t.db, TALENT))).toBe(organiserBefore);
    expect(JSON.stringify(await t.db.select().from(signalTable).orderBy(signalTable.id))).toBe(rowsBefore);
    // the rewrite waits in the next version, as a draft
    const draft = (await loadCard(t.db, TALENT, "draft"))!;
    expect(draft).toMatchObject({ version: 2, status: "draft", approvedAt: null });
    expect(draft.signals.find((s) => s.id === "s2")).toMatchObject({ phrase: "Handling supplier claims", phraseOwn: OWN, status: "proposed" });
    expect(draft.companyView.items.find((i) => i.signalId === "s2")).toEqual({ signalId: "s2", text: good.items[0].text, stale: false });
    const page = (await cardPageView(t.db, TALENT))!;
    expect(page).toMatchObject({ status: "draft", hasApprovedVersion: true, reworded: ["s2"] });
    // approving the draft publishes it
    await approveCard(t.db, TALENT);
    const company = (await cardForCompany(t.db, TALENT))!;
    expect(company.signals.find((s) => s.id === "s2")).toMatchObject({ phrase: "Handling supplier claims", rendering: good.items[0].text });
    expect((await t.db.select().from(signalTable).where(eq(signalTable.id, "s2")))[0].phrase).toBe("Handling supplier claims");
    expect(JSON.stringify(company)).not.toContain("Toimittaja");
    expect((await cardPageView(t.db, TALENT))!.reworded).toEqual([]);
  });

  it("a signal with no previous text stays out of the company view until the person approves the draft that holds its rewrite", async () => {
    const d0 = (await loadCard(t.db, TALENT, "draft"))!;
    await saveCard(t.db, TALENT, { ...d0, companyView: { ...d0.companyView, items: d0.companyView.items.filter((i) => i.signalId !== "s3") } });
    await edit("s3", "Hitsaus");
    await approveCard(t.db, TALENT);
    setLlmFake(() => ({ items: [{ i: 0, phrase: "Welding", text: "They welded steel parts for a manufacturer." }] }));
    expect(await renderSignal(t.db, { talentId: TALENT, signalId: "s3", cardVersion: 1 })).toBe("applied");
    expect((await cardForCompany(t.db, TALENT))!.signals.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect((await cardForOrganiser(t.db, TALENT))!.signals.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect((await cardPageView(t.db, TALENT))!.reworded).toEqual(["s3"]);
    await approveCard(t.db, TALENT);
    expect((await cardForCompany(t.db, TALENT))!.signals.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("the prompt C pick for a rewritten phrase is one analyst call with candidates only; choice 0 gives no label, and 'React' never gets 'react to mining emergencies'", async () => {
    await t.db.insert(escoConcept).values({ uri: "http://data.europa.eu/esco/skill/test-react", type: "skill", labelEn: "react to mining emergencies", labelFi: null });
    await edit("s2", "Reactin käyttö");
    let picks = 0;
    let seen: LlmOptions | undefined;
    setLlmFake((o) => {
      if (o.purpose === "card.esco_pick") {
        picks++;
        seen = o;
        return { picks: [{ i: 0, choice: 0 }] };
      }
      return { items: [{ i: 0, phrase: "React", text: "They built web pages with React." }] };
    });
    expect(await renderSignal(t.db, { talentId: TALENT, signalId: "s2", cardVersion: 1 })).toBe("applied");
    expect(picks).toBe(1);
    expect(seen).toMatchObject({ role: "analyst", temperature: 0, maxTokens: 400, deadlineMs: 15_000 });
    expect(seen?.messages[1].content).toContain("1. react to mining emergencies");
    expect(seen?.messages[1].content).not.toContain("Once a truck");
    expect((await rendered()).signal.esco).toBeNull();
  });

  it("a rewrite that lands after approval and a later edit also reaches the new draft", async () => {
    await edit();
    await approveCard(t.db, TALENT);
    await editCard(t.db, TALENT, { op: "remove", signalId: "s1" }); // draft v2 copied from approved v1
    setLlmFake(() => good);
    expect(await renderSignal(t.db, { talentId: TALENT, signalId: "s2", cardVersion: 1 })).toBe("applied");
    const draft = (await loadCard(t.db, TALENT, "draft"))!;
    expect(draft.signals.find((s) => s.id === "s2")?.phrase).toBe("Handling supplier claims");
    expect(draft.companyView.items.find((i) => i.signalId === "s2")).toMatchObject({ stale: false, text: good.items[0].text });
    await approveCard(t.db, TALENT);
    expect((await cardForCompany(t.db, TALENT))!.signals.find((s) => s.id === "s2")).toMatchObject({ phrase: "Handling supplier claims" });
  });

  it("code writes the list sentence for a skill the person only named", async () => {
    const d = (await loadCard(t.db, TALENT, "draft"))!;
    await saveCard(t.db, TALENT, { ...d, signals: d.signals.map((s) => (s.id === "s2" ? { ...s, hasExample: false } : s)) });
    await edit();
    setLlmFake(() => ({ items: [{ i: 0, phrase: "Handling supplier claims", text: "They checked deliveries and filed claims." }] }));
    expect(await renderSignal(t.db, { talentId: TALENT, signalId: "s2", cardVersion: 1 })).toBe("applied");
    expect((await rendered()).item?.text).toBe("They list handling supplier claims as a skill.");
  });

  it("prompt B names the protected attributes whenever it points at NEVER", () => {
    expect(RENDER_SYSTEM_PROMPT).toContain("(see NEVER)");
    expect(RENDER_SYSTEM_PROMPT).toMatch(/NEVER\n- Never record age, gender/);
  });
});
