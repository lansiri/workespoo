import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { MAX_SIGNALS } from "@/contracts";
import { auditLog, interview, talent } from "@/db/schema";
import { listAudit } from "@/lib/audit";
import type { LlmOptions } from "@/lib/llm";
import { resetLlmState, setLlmFake } from "@/lib/llm/testing";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { findProtectedCard } from "@/lib/lexicon";
import { approveCard } from "./approval";
import { cardForCompany, cardForOrganiser } from "./projections";
import { loadCard } from "./store";
import { SENTENCES, seedEsco, seedInterview } from "./test-helpers";
import { RENDERING_RULES, synthesiseCard } from "./synthesis";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await seedEsco(t.db);
}, 120_000);
afterAll(() => t.close());
beforeEach(async () => {
  await t.db.delete(talent);
  await t.db.delete(auditLog);
});
afterEach(() => resetLlmState());

const TALENT = "tal_test00000001";
const INTERVIEW = "int_test00000001";

const good = () => ({
  headline: "Goods receiving, supplier claims and SAP",
  summary: "They have received and checked incoming goods at a logistics centre and handled supplier claims in SAP.",
  signals: [
    { phrase: "Receiving and checking goods", kind: "skill", evidence: ["T1.S1", "T3.S2"], from: ["s1"], rendering: "They received incoming goods at a logistics centre and checked pallets against delivery notes." },
    { phrase: "Filing supplier claims", kind: "skill", evidence: ["T3.S1-S2"], from: ["s4"], rendering: "They documented a short delivery with photos and filed the claim before the driver left." },
    { phrase: "SAP", kind: "tool", evidence: ["T1.S2", "T3.S2"], from: ["s2"], rendering: "They used SAP for goods receiving and supplier claims." },
    { phrase: "Training new workers", kind: "skill", evidence: ["T5.S2"], from: [], rendering: "They trained summer workers to use the scanners." },
  ],
  roles: ["Warehouse coordinator", "Purchasing"],
  rolesEvidence: ["T9.S1"],
});

const live = [
  { id: "s1", phrase: "Receiving and checking goods", hasExample: true },
  { id: "s2", phrase: "SAP", kind: "tool" as const, hasExample: false },
  { id: "s4", phrase: "Filing supplier claims", hasExample: true, evidence: [{ turnIndex: 3, sentenceFrom: 1, sentenceTo: 2 }] },
];

async function expectNothingProtectedForCompanies() {
  await approveCard(t.db, TALENT);
  const company = JSON.stringify(await cardForCompany(t.db, TALENT));
  const organiser = JSON.stringify(await cardForOrganiser(t.db, TALENT));
  for (const text of [company, organiser]) expect(findProtectedCard(text)).toEqual([]);
}

describe("synthesiseCard", () => {
  it("stores a draft with ids, ESCO grounding, company view and an audit event", async () => {
    await seedInterview(t.db, { liveSignals: live });
    let seen: LlmOptions | undefined;
    setLlmFake((o) => {
      if (o.purpose === "card.synthesis") seen = o;
      return good();
    });
    const r = await synthesiseCard(t.db, INTERVIEW);
    expect(r).toEqual({ talentId: TALENT, version: 1, fallback: false });
    expect(seen).toMatchObject({ role: "analyst", purpose: "card.synthesis", temperature: 0.2 });
    expect(seen?.messages[0].content).toContain("At most 14 signals");
    expect(seen?.messages[1].content).toContain("[T3.S2] I checked every pallet");
    expect(seen?.messages[1].content).toContain("s4 | skill | Filing supplier claims | T3.S1-S2");

    const card = (await loadCard(t.db, TALENT, "draft"))!;
    expect(card.status).toBe("draft");
    expect(card.handle).toBe("Birch-27");
    expect(card.signals.map((s) => [s.id, s.phrase, s.status, s.addedBy])).toEqual([
      ["s1", "Receiving and checking goods", "proposed", "agent"],
      ["s4", "Filing supplier claims", "proposed", "agent"],
      ["s2", "SAP", "proposed", "agent"],
      ["s5", "Training new workers", "proposed", "agent"],
    ]);
    expect(card.signals[0].hasExample).toBe(true);
    expect(card.signals[2].hasExample).toBe(false);
    expect(card.signals[0].evidence).toEqual([
      { turnIndex: 1, sentenceFrom: 1, sentenceTo: 1 },
      { turnIndex: 3, sentenceFrom: 2, sentenceTo: 2 },
    ]);
    // The text matcher accepts near-exact labels only. A looser but right label such as
    // "manage supplier claims" is the model's to pick among candidates (card-synthesis.md, prompt C).
    expect(card.signals[1].esco ?? null).toBeNull();
    expect(card.signals[2].esco?.labelFi).toBe("SAP");
    expect(card.lookingFor.roles).toEqual(["Warehouse coordinator", "Purchasing"]);
    expect(card.companyView.items).toHaveLength(4);
    expect(card.companyView.items.every((i) => !i.stale)).toBe(true);
    expect(card.companyView.label).toContain("Not a quote");
    expect(card.headline).toBe("Goods receiving, supplier claims and SAP");
    const [event] = await listAudit(t.db, { action: "card.synthesised" });
    expect(event.detail).toMatchObject({ signals: 4, version: 1, fallback: false });
  });

  it("drops a signal whose evidence label does not resolve, and roles without resolving evidence", async () => {
    await seedInterview(t.db);
    const out = good();
    out.signals[0].evidence = ["T99.S1"];
    out.signals[1].evidence = ["T3.S9"];
    out.signals[2].evidence = ["T0.S1"]; // the interviewer's turn: not a participant turn
    out.rolesEvidence = ["T42.S1"];
    setLlmFake(() => out);
    await synthesiseCard(t.db, INTERVIEW);
    const card = (await loadCard(t.db, TALENT, "draft"))!;
    expect(card.signals.map((s) => s.phrase)).toEqual(["Training new workers"]);
    expect(card.lookingFor.roles).toEqual([]);
    expect(card.companyView.items.map((i) => i.signalId)).toEqual([card.signals[0].id]);
  });

  it("drops a redacted turn's evidence", async () => {
    await seedInterview(t.db);
    await t.db.execute(sql`update turn set redacted_at = now(), sentences = '[]'::jsonb where index = 5`);
    setLlmFake(() => good());
    await synthesiseCard(t.db, INTERVIEW);
    const card = (await loadCard(t.db, TALENT, "draft"))!;
    expect(card.signals.map((s) => s.phrase)).not.toContain("Training new workers");
  });

  it("drops a signal that names a country and audits it without content", async () => {
    await seedInterview(t.db);
    const out = good();
    out.signals.push({ phrase: "Bookkeeping", kind: "skill", evidence: ["T7.S1"], from: [], rendering: "They did bookkeeping for a small shop in Nigeria." });
    out.signals.push({ phrase: "Nigerian cooking", kind: "skill", evidence: ["T7.S1"], from: [], rendering: "They cooked." });
    setLlmFake(() => out);
    await synthesiseCard(t.db, INTERVIEW);
    const card = (await loadCard(t.db, TALENT, "draft"))!;
    expect(JSON.stringify(card)).not.toMatch(/Nigeria|Lagos/i);
    // "Bookkeeping" is clean; only the model's sentence named a country, so the signal stays with a code-built sentence.
    expect(card.signals.map((s) => s.phrase)).toContain("Bookkeeping");
    expect(card.companyView.items.find((i) => i.text.includes("bookkeeping"))?.text).toBe("They list bookkeeping as a skill.");
    const events = await listAudit(t.db, { action: "card.protected_dropped" });
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events.map((e) => e.detail))).not.toMatch(/Nigeria|Lagos/i);
    expect(events[0].detail).toEqual({ where: "signal", interviewId: INTERVIEW });
  });

  it("keeps the person's evidence when only the model's rendering hits the word list, with the code-built sentence", async () => {
    await seedInterview(t.db);
    const out = good();
    out.signals[0].rendering = "They diagnosed why the handheld scanners lost their connection.";
    setLlmFake(() => out);
    await synthesiseCard(t.db, INTERVIEW);
    const card = (await loadCard(t.db, TALENT, "draft"))!;
    const first = card.signals[0];
    expect(first.phrase).toBe("Receiving and checking goods");
    expect(first.evidence).toEqual([
      { turnIndex: 1, sentenceFrom: 1, sentenceTo: 1 },
      { turnIndex: 3, sentenceFrom: 2, sentenceTo: 2 },
    ]);
    expect(card.companyView.items.find((i) => i.signalId === first.id)?.text).toBe("They list receiving and checking goods as a skill.");
    expect(await listAudit(t.db, { action: "card.protected_dropped" })).toHaveLength(0);
    const [event] = await listAudit(t.db, { action: "card.synthesised" });
    expect(event.detail).toMatchObject({ signals: 4, droppedProtected: 0, salvaged: 1 });
    await expectNothingProtectedForCompanies();
  });

  it("a phrase that hits the word list takes the clean phrase of its source signal; with none it is dropped", async () => {
    await seedInterview(t.db, {
      liveSignals: [
        { id: "s1", phrase: "Fixing scanner connections", hasExample: true },
        { id: "s2", phrase: "Fixing", hasExample: true },
        { id: "s3", phrase: "Diagnosed network faults", hasExample: true },
      ],
    });
    const out = good();
    out.signals = [
      { phrase: "Diagnosed scanner faults", kind: "skill", evidence: ["T1.S2"], from: ["s1", "s2"], rendering: "They found the cause of scanner faults." },
      { phrase: "Diagnosed network faults", kind: "skill", evidence: ["T3.S2"], from: ["s3"], rendering: "They found network faults." },
      { phrase: "Diagnosed pallet problems", kind: "skill", evidence: ["T3.S1"], from: [], rendering: "They found pallet problems." },
    ];
    setLlmFake(() => out);
    await synthesiseCard(t.db, INTERVIEW);
    const card = (await loadCard(t.db, TALENT, "draft"))!;
    expect(card.signals.map((s) => [s.id, s.phrase])).toEqual([["s4", "Fixing scanner connections"]]);
    expect(card.signals[0].evidence).toEqual([{ turnIndex: 1, sentenceFrom: 2, sentenceTo: 2 }]);
    expect(card.companyView.items[0].text).toBe("They list fixing scanner connections as a skill.");
    expect(await listAudit(t.db, { action: "card.protected_dropped" })).toHaveLength(2);
    const [event] = await listAudit(t.db, { action: "card.synthesised" });
    expect(event.detail).toMatchObject({ signals: 1, droppedProtected: 2, salvaged: 1 });
    await expectNothingProtectedForCompanies();
  });

  it("asks prompt C once for the whole card and maps the choice; choice 0 leaves a signal without a label", async () => {
    await seedInterview(t.db, { liveSignals: live });
    let picks = 0;
    setLlmFake((o) => {
      if (o.purpose !== "card.esco_pick") return good();
      picks++;
      const text = o.messages[1].content;
      const blocks = text.split("\n\n");
      const choose = (phrase: string, label: string) => {
        const block = blocks.find((b) => b.includes(`phrase: ${phrase} `))!;
        const i = Number(/^i=(\d+)/.exec(block)![1]);
        const lines = block.split("\n").slice(1);
        return { i, choice: lines.findIndex((l) => l.endsWith(label)) + 1 };
      };
      return { picks: [choose("Filing supplier claims", "manage supplier claims"), { i: 99, choice: 1 }] };
    });
    await synthesiseCard(t.db, INTERVIEW);
    expect(picks).toBe(1);
    const card = (await loadCard(t.db, TALENT, "draft"))!;
    expect(card.signals.find((s) => s.phrase === "Filing supplier claims")?.esco?.labelEn).toBe("manage supplier claims");
    expect(card.signals.find((s) => s.phrase === "SAP")?.esco ?? null).toBeNull(); // no pick for SAP: no label
  });

  it("falls back to code-built headline and summary when they name a country", async () => {
    await seedInterview(t.db);
    const out = good();
    out.headline = "Nigerian goods receiving";
    out.summary = "They worked in Nigeria.";
    setLlmFake(() => out);
    await synthesiseCard(t.db, INTERVIEW);
    const card = (await loadCard(t.db, TALENT, "draft"))!;
    expect(card.headline).toBe("Receiving and checking goods, Filing supplier claims, SAP");
    expect(card.companyView.summary).toBe("They talked about receiving and checking goods, filing supplier claims and SAP.");
    expect(await listAudit(t.db, { action: "card.protected_dropped" })).toHaveLength(2);
  });

  it("keeps a 10-word headline, replaces an 11-word one and a verbatim summary", async () => {
    await seedInterview(t.db);
    const ten = "Goods receiving, supplier claims, SAP, scanners, pallets and training daily";
    const eleven = ten + " too";
    const run = async (headline: string, summary: string) => {
      const out = good();
      out.headline = headline;
      out.summary = summary;
      setLlmFake(() => out);
      await synthesiseCard(t.db, INTERVIEW);
      return (await loadCard(t.db, TALENT, "draft"))!;
    };
    expect((await run(ten, "They handled goods.")).headline).toBe(ten);
    const card = await run(eleven, "I worked at a logistics centre, mainly receiving goods.");
    expect(card.headline).toBe("Receiving and checking goods, Filing supplier claims, SAP");
    expect(card.companyView.summary).toMatch(/^They talked about/);
  });

  it("strips quality words from phrases and drops a phrase that is only a quality word", async () => {
    await seedInterview(t.db);
    const out = good();
    out.signals[0].phrase = "Advanced receiving and checking goods";
    out.signals[1].phrase = "senior";
    out.signals[2].phrase = "SAP, 5 years";
    setLlmFake(() => out);
    await synthesiseCard(t.db, INTERVIEW);
    const card = (await loadCard(t.db, TALENT, "draft"))!;
    expect(card.signals.map((s) => s.phrase)).toEqual(["receiving and checking goods", "SAP", "Training new workers"]);
  });

  it("replaces a rendering that quotes the person, praises, or mentions speaking with the code-built sentence", async () => {
    await seedInterview(t.db);
    const out = good();
    out.signals[0].rendering = "I checked every pallet against the delivery note, took photos and filed the claim in SAP before the driver left.";
    out.signals[1].rendering = "They filed claims very well and were an excellent communicator.";
    out.signals[2].rendering = "They speak about SAP in the interview.";
    out.signals[3].rendering = "They trained summer workers on the scanners and then did a lot of other things as well as all of the many tasks that were on the list for that day."; // 31 words
    setLlmFake(() => out);
    await synthesiseCard(t.db, INTERVIEW);
    const card = (await loadCard(t.db, TALENT, "draft"))!;
    expect(card.companyView.items.map((i) => i.text)).toEqual([
      "They list receiving and checking goods as a skill.",
      "They list filing supplier claims as a skill.",
      "They list SAP as a skill.",
      "They list training new workers as a skill.",
    ]);
  });

  it("replaces a rendering that carries a banned evaluative word such as junior", async () => {
    await seedInterview(t.db);
    const out = good();
    out.signals[0].rendering = "They worked as a junior receiver at a logistics centre.";
    setLlmFake(() => out);
    await synthesiseCard(t.db, INTERVIEW);
    const card = (await loadCard(t.db, TALENT, "draft"))!;
    expect(card.companyView.items[0].text).toBe("They list receiving and checking goods as a skill.");
    expect(card.companyView.items[3].text).toBe("They trained summer workers to use the scanners.");
  });

  it("writes the 'They list ... as a skill.' sentence in code for a signal with no described example", async () => {
    await seedInterview(t.db, { liveSignals: live });
    const out = good();
    out.signals[2].rendering = "They are strong at SAP and used it in the interview."; // s2 has no example
    out.signals[0].rendering = "They list Receiving and checking goods as a skill."; // model copied the pattern
    setLlmFake(() => out);
    await synthesiseCard(t.db, INTERVIEW);
    const card = (await loadCard(t.db, TALENT, "draft"))!;
    const text = (id: string) => card.companyView.items.find((i) => i.signalId === id)!.text;
    expect(text("s2")).toBe("They list SAP as a skill.");
    expect(text("s1")).toBe("They list receiving and checking goods as a skill.");
    expect(text("s4")).toBe("They documented a short delivery with photos and filed the claim before the driver left.");
  });

  it("gives the model a bounded wait and the same rules R1 to R8 as prompt B, with the patched texts", async () => {
    await seedInterview(t.db);
    let seen: LlmOptions | undefined;
    setLlmFake((o) => {
      if (o.purpose === "card.synthesis") seen = o;
      return good();
    });
    await synthesiseCard(t.db, INTERVIEW);
    expect(seen?.deadlineMs).toBe(90_000);
    expect(seen?.maxTokens).toBe(4000);
    const system = seen!.messages[0].content;
    expect(system).toContain("Never write \"strength\".");
    expect(system).toContain("found the cause of");
    expect(system).toContain("between two languages");
    expect(system).toContain("Studies, courses and shift preferences are not roles.");
    expect(system).toContain("Personality traits and work preferences");
    expect(system).toContain(RENDERING_RULES);
  });

  it.each([
    ["express", MAX_SIGNALS.express],
    ["full", 10],
  ] as const)("truncates to the %s maximum, keeping input order", async (mode, expected) => {
    await seedInterview(t.db, { mode });
    const out = good();
    out.signals = Array.from({ length: 10 }, (_, i) => ({
      phrase: `Handling item ${i}`,
      kind: "skill",
      evidence: ["T1.S1"],
      from: [] as string[],
      rendering: `They handled item number ${i} at work.`,
    }));
    setLlmFake(() => out);
    await synthesiseCard(t.db, INTERVIEW);
    const card = (await loadCard(t.db, TALENT, "draft"))!;
    expect(card.signals).toHaveLength(expected);
    expect(card.signals[0].phrase).toBe("Handling item 0");
    expect(card.companyView.items).toHaveLength(expected);
  });

  it("falls back to the live signals after two invalid outputs and audits it", async () => {
    await seedInterview(t.db, { liveSignals: live });
    let calls = 0;
    setLlmFake((o) => {
      if (o.purpose === "card.synthesis") calls++;
      return "not json at all";
    });
    const r = await synthesiseCard(t.db, INTERVIEW);
    expect(calls).toBe(2);
    expect(r.fallback).toBe(true);
    const card = (await loadCard(t.db, TALENT, "draft"))!;
    expect(card.signals.map((s) => [s.id, s.phrase])).toEqual([
      ["s1", "Receiving and checking goods"],
      ["s2", "SAP"],
      ["s4", "Filing supplier claims"],
    ]);
    expect(card.headline).toBe("Receiving and checking goods, SAP, Filing supplier claims");
    expect(card.companyView.summary).toBe("They talked about receiving and checking goods, SAP and filing supplier claims.");
    expect(card.companyView.items[0].text).toBe("They list receiving and checking goods as a skill.");
    expect(await listAudit(t.db, { action: "card.synthesis_fallback" })).toHaveLength(1);
  });

  it("stores an empty draft when there is nothing to cite, without calling the model", async () => {
    await seedInterview(t.db, { turns: {} });
    let calls = 0;
    setLlmFake(() => {
      calls++;
      return good();
    });
    const r = await synthesiseCard(t.db, INTERVIEW);
    expect(calls).toBe(0);
    expect(r).toEqual({ talentId: TALENT, version: 1, fallback: false });
    const card = (await loadCard(t.db, TALENT, "draft"))!;
    expect(card.signals).toEqual([]);
    expect(card.companyView.items).toEqual([]);
    expect(card.headline).toBe("");
  });

  it("stores an empty draft when the model fails and there are no live signals", async () => {
    await seedInterview(t.db);
    setLlmFake(() => "nope");
    const r = await synthesiseCard(t.db, INTERVIEW);
    expect(r.fallback).toBe(true);
    expect((await loadCard(t.db, TALENT, "draft"))!.signals).toEqual([]);
  });

  it("repairs a model that overshoots the evidence limit rather than failing", async () => {
    await seedInterview(t.db);
    const out = good();
    out.signals[0].evidence = ["T1.S1", "T1.S2", "T3.S1", "T3.S2"];
    setLlmFake(() => out);
    const r = await synthesiseCard(t.db, INTERVIEW);
    expect(r.fallback).toBe(false);
  });

  it("numbers the next draft after an approved version", async () => {
    await seedInterview(t.db);
    const { seedCard, signal } = await import("./test-helpers");
    await seedCard(t.db, TALENT, { status: "approved", version: 3, signals: [signal({ id: "s1", phrase: "SAP" })] });
    setLlmFake(() => good());
    expect((await synthesiseCard(t.db, INTERVIEW)).version).toBe(4);
    expect((await loadCard(t.db, TALENT, "approved"))!.version).toBe(3);
  });

  it("does not store interview language or input mode on the card", async () => {
    await seedInterview(t.db, { lang: "fi", inputMode: "voice" });
    setLlmFake(() => good());
    await synthesiseCard(t.db, INTERVIEW);
    const [row] = await t.db.select().from((await import("@/db/schema")).signalCard);
    expect(JSON.stringify(row.body)).not.toMatch(/"fi"|voice|inputMode|lang"/);
    void interview;
    void SENTENCES;
  });
});

describe("fallbackRendering case", () => {
  it("keeps product names and lower-cases ordinary lead words", async () => {
    const { fallbackRendering } = await import("./checks");
    expect(fallbackRendering("Excel")).toBe("They list Excel as a skill.");
    expect(fallbackRendering("Python")).toBe("They list Python as a skill.");
    expect(fallbackRendering("Customer service")).toBe("They list customer service as a skill.");
    expect(fallbackRendering("Welding")).toBe("They list welding as a skill.");
    expect(fallbackRendering("SAP")).toBe("They list SAP as a skill.");
  });
});
