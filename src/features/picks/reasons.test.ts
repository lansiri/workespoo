import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setLlmFake, resetLlmState } from "@/lib/llm";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import {
  buildReasonPrompt,
  checkModelReasons,
  codeReasons,
  computeAllowedPairs,
  reasonTextAllowed,
  writeReasons,
} from "./reasons";
import { addCompany, addNeed, addTalent, resetDb } from "./test-helpers";
import { llmCalls } from "./test-llm";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());
beforeEach(async () => {
  await resetDb(t.db);
});
afterEach(() => resetLlmState());

async function setup() {
  await addCompany(t.db, { id: "co_1" });
  const need = await addNeed(t.db, {
    id: "nc_1",
    companyId: "co_1",
    requirements: [
      { id: "req_1", text: "Python programming", kind: "must", postingSentence: 2, escoSkillUris: ["esco:python"] },
      { id: "req_2", text: "SQL queries", kind: "must", postingSentence: 3 },
      { id: "req_3", text: "Fluent Finnish", kind: "must", category: "language", languageCode: "fi" },
      { id: "req_4", text: "Apache Airflow", kind: "nice" },
    ],
  });
  const card = await addTalent(t.db, {
    id: "tal_1",
    handle: "Maple-42",
    signals: [
      { id: "s1", phrase: "Python data pipelines", escoUri: "esco:python", rendering: "Built nightly pipelines in Python that load sensor data (English rendering)." },
      { id: "s2", phrase: "SQL queries", rendering: "Wrote SQL queries for data quality checks (English rendering)." },
    ],
  });
  const touched = new Set(["req_1", "req_2", "req_3"]);
  const pairs = await computeAllowedPairs(t.db, need, touched, card);
  return { need, card, touched, pairs };
}

describe("allowed pairs", () => {
  it("pairs a touched requirement with the signal that made it touched, and nothing for untouched ones", async () => {
    const { pairs } = await setup();
    expect(pairs).toContainEqual({ requirementId: "req_1", signalId: "s1" });
    expect(pairs).toContainEqual({ requirementId: "req_2", signalId: "s2" });
    // Finnish rests on a declared language only: no signal, so no pair.
    expect(pairs.some((p) => p.requirementId === "req_3")).toBe(false);
    // Not touched, so not allowed even though a model might like it.
    expect(pairs.some((p) => p.requirementId === "req_4")).toBe(false);
  });

  it("uses a shared ESCO skill as well as phrase similarity", async () => {
    await addCompany(t.db, { id: "co_1" });
    const need = await addNeed(t.db, {
      id: "nc_1",
      companyId: "co_1",
      requirements: [{ id: "req_1", text: "Data wrangling", escoSkillUris: ["http://esco/skill/1"] }],
    });
    const card = await addTalent(t.db, {
      id: "tal_1",
      signals: [{ id: "s1", phrase: "Cleaning tables", escoUri: "http://esco/skill/1" }],
    });
    const pairs = await computeAllowedPairs(t.db, need, new Set(["req_1"]), card);
    expect(pairs).toEqual([{ requirementId: "req_1", signalId: "s1" }]);
  });
});

describe("the reason prompt", () => {
  it("holds the need, the signals and the pairs, and no transcript, name, handle, language or input mode (M12)", async () => {
    const { need, card, pairs } = await setup();
    const prompt = buildReasonPrompt(need, card, pairs);
    const all = prompt.messages.map((m) => m.content).join("\n");
    expect(all).toContain("R1 (must): Python programming");
    expect(all).toContain("S1: Python data pipelines.");
    expect(all).toContain("R1, S1");
    expect(all).not.toContain("Maple-42");
    expect(all).not.toMatch(/interview|input mode|voice|transcript|T\d+\.S\d+|tal_1/i);
    expect(all).not.toContain("Acme");
  });
});

describe("code checks on model output", () => {
  const out = (reasons: Array<{ req: string; signal: string; text: string }>) => ({ reasons });

  it("keeps a good reason and stores its evidence and posting sentence by reference", async () => {
    const { need, card, pairs } = await setup();
    const prompt = buildReasonPrompt(need, card, pairs);
    const reasons = checkModelReasons(
      out([{ req: "R1", signal: "S1", text: "The card describes nightly Python pipelines, which relates to Python programming." }]),
      prompt,
      need,
      card,
      pairs,
    );
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatchObject({
      requirementId: "req_1",
      signalId: "s1",
      postingSentence: 2,
      evidence: { turnIndex: 1, sentenceFrom: 1, sentenceTo: 1 },
    });
  });

  it.each([
    ["a pronoun and praise", "She has strong Python experience."],
    ["praise without a cited pair", "This person is a great fit for the team."],
    ["a percentage", "The card describes Python, which relates to Python programming at 90%."],
    ["a ratio", "The card describes Python, which relates to 3/4 of the needs."],
    ["a grading word", "The card describes Python, which is the best answer to Python programming."],
    ["a recommendation", "The card describes Python and we recommend it."],
    ["a level word", "The card describes senior Python work, which relates to Python programming."],
  ])("drops a reason with %s", async (_label, text) => {
    const { need, card, pairs } = await setup();
    const prompt = buildReasonPrompt(need, card, pairs);
    expect(checkModelReasons(out([{ req: "R1", signal: "S1", text }]), prompt, need, card, pairs)).toEqual([]);
    expect(reasonTextAllowed(text)).toBe(false);
  });

  it("drops a reason whose pair is not allowed (M18)", async () => {
    const { need, card, pairs } = await setup();
    const prompt = buildReasonPrompt(need, card, pairs);
    const reasons = checkModelReasons(
      out([
        { req: "R2", signal: "S1", text: "The card describes Python pipelines, which relates to SQL queries." },
        { req: "R4", signal: "S1", text: "The card describes Python pipelines, which relates to Apache Airflow." },
        { req: "R9", signal: "S9", text: "The card describes something, which relates to something." },
      ]),
      prompt,
      need,
      card,
      pairs,
    );
    expect(reasons).toEqual([]);
  });

  it("keeps one reason per requirement", async () => {
    const { need, card, pairs } = await setup();
    const prompt = buildReasonPrompt(need, card, pairs);
    const reasons = checkModelReasons(
      out([
        { req: "R1", signal: "S1", text: "The card describes Python pipelines, which relates to Python programming." },
        { req: "R1", signal: "S1", text: "The card describes loading sensor data, which relates to Python programming." },
      ]),
      prompt,
      need,
      card,
      pairs,
    );
    expect(reasons).toHaveLength(1);
  });
});

describe("writeReasons", () => {
  it("uses model wording when it passes every check, and logs the call with its purpose and role", async () => {
    const { need, card, pairs } = await setup();
    setLlmFake(() => ({
      reasons: [
        { req: "R1", signal: "S1", text: "The card describes nightly Python pipelines, which relates to Python programming." },
        { req: "R2", signal: "S2", text: "The card describes SQL data-quality checks, which relates to SQL queries." },
      ],
    }));
    const { reasons, source } = await writeReasons(t.db, need, card, pairs);
    expect(source).toBe("model");
    expect(reasons.map((r) => r.requirementId)).toEqual(["req_1", "req_2"]);
    expect(await llmCalls(t.db)).toEqual([{ role: "analyst", purpose: "picks.reasons" }]);
  });

  it("falls back to code-rendered reasons when nothing survives", async () => {
    const { need, card, pairs } = await setup();
    setLlmFake(() => ({ reasons: [{ req: "R1", signal: "S1", text: "She is a perfect fit." }] }));
    const { reasons, source } = await writeReasons(t.db, need, card, pairs);
    expect(source).toBe("code");
    expect(reasons).toHaveLength(2);
    expect(reasons[0].text).toBe("The card describes Python data pipelines, which relates to Python programming.");
  });

  it("falls back when the model returns unparseable output", async () => {
    const { need, card, pairs } = await setup();
    setLlmFake(() => "this is not json");
    const { source, reasons } = await writeReasons(t.db, need, card, pairs);
    expect(source).toBe("code");
    expect(reasons.length).toBeGreaterThan(0);
  });

  it("falls back when the model call throws", async () => {
    const { need, card, pairs } = await setup();
    setLlmFake(() => {
      throw new Error("provider down");
    });
    const { source } = await writeReasons(t.db, need, card, pairs);
    expect(source).toBe("code");
  });

  it("falls back to code when no model is configured", async () => {
    const { need, card, pairs } = await setup();
    const { source } = await writeReasons(t.db, need, card, pairs);
    expect(source).toBe("code");
  });

  it("code reasons put must-haves first, use distinct signals and stay within 200 characters", async () => {
    const { need, card, pairs } = await setup();
    const reasons = codeReasons(need, card, pairs);
    expect(reasons.map((r) => r.signalId)).toEqual(["s1", "s2"]);
    expect(reasons.every((r) => r.text.length <= 200)).toBe(true);
  });
});

describe("check 2 covers every word of the spec regex", () => {
  const words = [
    "he", "she", "him", "her", "his", "hers", "strong", "excellent", "great", "impressive", "perfect", "ideal",
    "expert", "talented", "skilled", "qualified", "senior", "junior", "fit", "match", "matches", "matched", "best",
    "top", "highly", "recommend", "recommended", "score", "percent",
  ];
  for (const w of words) {
    it(`drops a reason containing "${w}"`, () => {
      expect(reasonTextAllowed(`The card describes Python pipelines, ${w} for this.`)).toBe(false);
    });
  }
});
