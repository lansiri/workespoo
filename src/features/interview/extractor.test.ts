import { describe, expect, it } from "vitest";
import { ExtractorOutput, type EscoRef, type Signal } from "@/contracts";
import { applyCoverage, coerce, mergeSignals, resolveRefs, trigramSimilarity, type TurnView } from "./extractor";

const turns = new Map<number, TurnView>([
  [0, { role: "interviewer", sentences: ["What kind of work have you done?"], redacted: false }],
  [1, { role: "participant", sentences: ["I worked at a logistics centre.", "We used SAP for everything."], redacted: false }],
  [3, { role: "participant", sentences: ["I checked every pallet.", "Then I filed the claim.", "I told purchasing."], redacted: false }],
  [5, { role: "participant", sentences: ["Secret."], redacted: true }],
]);

const parse = (raw: unknown) => ExtractorOutput.parse(coerce(raw));
const sig = (over: Record<string, unknown>) => ({ ref: "new", phrase: "Receiving goods", kind: "skill", evidence: ["T1.S1"], hasExample: false, ...over });
const out = (signals: unknown[], extra: Record<string, unknown> = {}) =>
  parse({ lang: "en", signals, coverage: {}, flags: [], note: "", ...extra });
const noEsco = async () => null;
const merge = (signals: unknown[], known: Signal[] = [], liveCount = known.length, currentTurn = 1) =>
  mergeSignals({ output: out(signals), turns, known, liveCount, currentTurn, resolveEsco: noEsco });

function known(id: string, phrase: string, over: Partial<Signal> = {}): Signal {
  return { id, phrase, phraseOwn: null, kind: "skill", esco: null, evidence: [{ turnIndex: 1, sentenceFrom: 1, sentenceTo: 1 }], hasExample: false, status: "proposed", addedBy: "agent", ...over };
}

describe("lenient coercion", () => {
  it("drops unknown flags and coverage keys, coerces booleans, defaults the kind", () => {
    const o = parse({
      lang: "FI-fi",
      signals: [{ ref: "new", phrase: " Forklift driving ", kind: "ability", evidence: "T1.S1", hasExample: "true" }],
      coverage: { tools: "covered", mood: "covered", people: "great", example: "THIN" },
      flags: ["buzzwords", "rude", "injection"],
      note: "ok",
    });
    expect(o.lang).toBe("fi");
    expect(o.signals[0]).toMatchObject({ phrase: "Forklift driving", kind: "skill", evidence: ["T1.S1"], hasExample: true });
    expect(o.coverage).toEqual({ tools: "covered", example: "thin" });
    expect(o.flags).toEqual(["buzzwords", "injection"]);
  });

  it("drops malformed signals one by one and tolerates a missing body", () => {
    const o = parse({ signals: [null, { phrase: "x" }, { phrase: "Valid phrase", evidence: ["nonsense"] }, sig({})] });
    expect(o.signals).toHaveLength(1);
    expect(o.lang).toBe("und");
    expect(parse({}).signals).toEqual([]);
  });

  it("caps at 5 signals", () => {
    expect(parse({ signals: Array.from({ length: 9 }, (_, i) => sig({ phrase: `Skill number ${i}` })) }).signals).toHaveLength(5);
  });
});

describe("merge rules", () => {
  it("1. resolves labels, ranges and clamps; drops what does not resolve", () => {
    expect(resolveRefs(["T1.S1", "T3.S1-S3", "T9.S4", "T1.S9", "T0.S1", "T5.S1", "T3.S3-S1"], turns)).toEqual([
      { turnIndex: 1, sentenceFrom: 1, sentenceTo: 1 },
      { turnIndex: 3, sentenceFrom: 1, sentenceTo: 3 },
    ]);
  });

  it("20. an invented reference is dropped, and a signal with no refs is dropped", async () => {
    const r = await merge([sig({ evidence: ["T9.S4"] }), sig({ phrase: "Real one", evidence: ["T1.S2"] })]);
    expect(r.created.map((s) => s.phrase)).toEqual(["Real one"]);
    expect(r.unresolvedDropped).toBe(1);
  });

  it("2 (TE-1). drops a signal that cites only earlier turns, keeps one that also cites the current turn", async () => {
    const r = await merge(
      [sig({ phrase: "Stale skill", evidence: ["T1.S1"] }), sig({ phrase: "Fresh skill", evidence: ["T1.S1", "T3.S1"] })],
      [],
      0,
      3,
    );
    expect(r.created.map((s) => s.phrase)).toEqual(["Fresh skill"]);
    expect(r.unresolvedDropped).toBe(1);
  });

  it("2 (TE-1). a known-id reuse that cites only an earlier turn adds nothing", async () => {
    const r = await merge([sig({ ref: "s1", evidence: ["T1.S2"] })], [known("s1", "Receiving goods")], 1, 3);
    expect(r.created).toEqual([]);
    expect(r.updated).toEqual([]);
  });

  it("drops a reference to the interviewer or to a redacted turn", async () => {
    const r = await merge([sig({ evidence: ["T0.S1"] }), sig({ evidence: ["T5.S1"] })]);
    expect(r.created).toEqual([]);
  });

  it("3. drops a phrase that matches the card lexicon", async () => {
    const r = await merge([sig({ phrase: "Nigerian pharmacy stock" }), sig({ phrase: "Mother of two kids" }), sig({ phrase: "Stock management" })]);
    expect(r.created.map((s) => s.phrase)).toEqual(["Stock management"]);
    expect(r.protectedDropped).toBe(2);
  });

  it("3. strips quality words and years; drops what is left empty", async () => {
    const r = await merge([
      sig({ phrase: "Senior expert architect" }),
      sig({ phrase: "Advanced Excel, 5 years" }),
      sig({ phrase: "Expert" }),
    ]);
    expect(r.created.map((s) => s.phrase)).toEqual(["architect", "Excel"]);
    for (const s of r.created) expect(s.phrase).not.toMatch(/senior|expert|advanced|years/i);
  });

  it("4. an unknown ref becomes a new signal", async () => {
    const r = await merge([sig({ ref: "s9", phrase: "Pallet checking" })]);
    expect(r.created).toHaveLength(1);
    expect(r.created[0]?.id).toBe("s1");
  });

  it("5. de-duplicates a new signal against known ones (same text or trigram >= 0.8)", async () => {
    const existing = [known("s1", "Receiving goods"), known("s2", "Forklift driving")];
    const r = await merge([sig({ phrase: "receiving goods", evidence: ["T3.S1"] }), sig({ phrase: "Forklift drivin", evidence: ["T3.S2"] })], existing, 2, 3);
    expect(r.created).toEqual([]);
    expect(r.updated.map((s) => s.id).sort()).toEqual(["s1", "s2"]);
    expect(trigramSimilarity("Forklift driving", "Forklift drivin")).toBeGreaterThanOrEqual(0.8);
    expect(trigramSimilarity("Forklift driving", "Elderly care")).toBeLessThan(0.3);
  });

  it("6. merging unions refs, ORs hasExample and keeps the phrase", async () => {
    const existing = [known("s1", "Receiving goods")];
    const r = await merge([sig({ ref: "s1", phrase: "Receiving and checking goods", evidence: ["T3.S1-S2"], hasExample: true })], existing, 1, 3);
    const s = r.updated[0]!;
    expect(s.phrase).toBe("Receiving goods");
    expect(s.hasExample).toBe(true);
    expect(s.evidence).toEqual([
      { turnIndex: 1, sentenceFrom: 1, sentenceTo: 1 },
      { turnIndex: 3, sentenceFrom: 1, sentenceTo: 2 },
    ]);
  });

  it("6. a merge that adds nothing is not reported as an update", async () => {
    const r = await merge([sig({ ref: "s1", evidence: ["T1.S1"], hasExample: false })], [known("s1", "Receiving goods")]);
    expect(r.updated).toEqual([]);
    expect(r.touched).toEqual([]);
  });

  it("7. new signals get the next id, proposed, by the agent, with ESCO from the top match", async () => {
    const esco: EscoRef = { uri: "http://esco/x", labelEn: "SAP", labelFi: "SAP" };
    const r = await mergeSignals({
      output: out([sig({ phrase: "SAP", kind: "tool", evidence: ["T3.S2"] }), sig({ phrase: "Pallet checking", evidence: ["T3.S1"] })]),
      turns,
      known: [known("s4", "Old one", { status: "removed" })],
      liveCount: 0,
      currentTurn: 3,
      resolveEsco: async (p) => (p === "SAP" ? esco : null),
    });
    expect(r.created.map((s) => [s.id, s.status, s.addedBy, s.esco?.uri ?? null])).toEqual([
      ["s5", "proposed", "agent", "http://esco/x"],
      ["s6", "proposed", "agent", null],
    ]);
  });

  it("8. caps the interview at 20 live signals", async () => {
    const r = await merge([sig({ phrase: "Brand new skill" })], [], 20);
    expect(r.created).toEqual([]);
  });

  it("de-duplicates inside one extraction", async () => {
    const r = await merge([sig({ phrase: "Filing claims", evidence: ["T3.S2"] }), sig({ phrase: "filing claims", evidence: ["T3.S3"] })], [], 0, 3);
    expect(r.created).toHaveLength(1);
    expect(r.created[0]?.evidence).toHaveLength(2);
  });

  it("9. coverage: covered is never downgraded", () => {
    const current = { recent_work: "covered", example: "asked", tools: "open", people: "thin", beyond: "open", open_floor: "open", looking_for: "open" } as const;
    expect(applyCoverage({ ...current }, { recent_work: "thin", example: "covered", tools: "thin" })).toMatchObject({
      recent_work: "covered",
      example: "covered",
      tools: "thin",
    });
  });
});
