import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { setLlmFake } from "@/lib/llm";
import { HttpError } from "@/lib/http";
import { answerQuestion, confirmNeedCard } from "./actions";
import { draftNeedCard, getNeedCard, recomputePoolEvidence } from "./index";
import { computePoolEvidence } from "./pool";
import { classifyStatutory } from "./rules";
import { addCompany, addEligibility, addJobRow, addTalent, draftOutput, makeCard } from "./test-helpers";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());
afterEach(() => setLlmFake(null));

const POOL = { scope: "relevant", relevant: 10, speakTo: 6, hardFilterWouldExclude: 4, selfDeclaredOnly: null, computedAt: "2026-11-14T06:02:11Z" } as const;
const vague = (phrase: string) => ({
  type: "vague" as const,
  text: `What does '${phrase}' look like in this job? One concrete example helps us find people who have done it.`,
  why: "The posting does not say what this means in practice.",
  answer: null,
});

describe("protected lint on drafts (6.3)", () => {
  it("drops age, health and gender asks even when the model lists nothing as dropped", async () => {
    const jobId = await addJobRow(t.db, {
      lang: "fi",
      sentences: ["Etsimme nuorta ja energistä tiimiläistä.", "Good health required.", "Python", "Ikä 25-35 vuotta"],
    });
    const { id: companyId } = await addCompany(t.db);
    setLlmFake(() =>
      draftOutput("Dev", [
        { text: "Young and energetic team member", sentence: 0, category: "other", questionType: "vague" },
        { text: "Good health", sentence: 1, category: "other" },
        { text: "Python", sentence: 2 },
        { text: "Between 25 and 35", sentence: 3, category: "other" },
      ]),
    );
    const card = await draftNeedCard(t.db, jobId, companyId);
    expect(card.requirements.map((r) => r.text)).toEqual(["Python"]);
    expect(card.droppedSentences).toEqual([0, 1, 3]);
  });
});

describe("work permit (s2-spec-2)", () => {
  it("is kept as authorisation with other_law, no question", async () => {
    const jobId = await addJobRow(t.db, { sentences: ["Valid EU work permit required.", "Python"] });
    const { id: companyId } = await addCompany(t.db);
    setLlmFake(() =>
      draftOutput("Dev", [
        { text: "Valid work permit", sentence: 0, category: "other", questionType: "vague" },
        { text: "Python", sentence: 1 },
      ]),
    );
    const card = await draftNeedCard(t.db, jobId, companyId);
    const wp = card.requirements.find((r) => /work permit/i.test(r.text))!;
    expect(wp.category).toBe("authorisation");
    expect(wp.statutory).toBe("other_law");
    expect(wp.question).toBeNull();
    expect(wp.pool).toBeNull();
    expect(card.droppedSentences).toEqual([]);
  });
});

describe("statutory from the cited sentence (s2-spec-4)", () => {
  const job = { source: "tmt", sector: "private", employerName: "Acme Oy" } as const;
  it("sees a clearance named only in the sentence, for any category", () => {
    expect(
      classifyStatutory({ category: "other", text: "Willing to undergo background check", sentence: "Valmius turvallisuusselvitykseen", modelLaw: false, job }),
    ).toBe("clearance");
    expect(
      classifyStatutory({ category: "skill", text: "Forklift", sentence: "Voimassa oleva työlupa", modelLaw: false, job }),
    ).toBe("other_law");
  });
});

describe("redrafting a company's card (s2-spec-3)", () => {
  it("is refused once the company has answered or confirmed, and changes nothing", async () => {
    const jobId = await addJobRow(t.db, { sentences: ["Python", "Team player"] });
    const { id: companyId } = await addCompany(t.db);
    setLlmFake(() => draftOutput("Dev", [{ text: "Python", sentence: 0 }, { text: "Team player", sentence: 1, category: "other" }]));
    const first = await draftNeedCard(t.db, jobId, companyId);
    // a plain re-draft before any answer is fine
    const second = await draftNeedCard(t.db, jobId, companyId);
    expect(second.version).toBe(first.version + 1);
    const confirmed = await confirmNeedCard(t.db, second.id, companyId);
    await expect(draftNeedCard(t.db, jobId, companyId)).rejects.toMatchObject({ status: 409, code: "has_company_answers" });
    const after = await getNeedCard(t.db, second.id);
    expect(after?.status).toBe("confirmed");
    expect(after?.version).toBe(confirmed.version);
  });

  it("is refused after a removal, which leaves no trace in the card itself", async () => {
    const jobId = await addJobRow(t.db, { sentences: ["Team player", "Calm"] });
    const { id: companyId } = await addCompany(t.db);
    const card = await makeCard(t.db, {
      jobId,
      companyId,
      requirements: [
        { text: "Team player", category: "other", postingSentence: 0, question: vague("team player"), pool: { ...POOL } },
        { text: "Calm", category: "other", postingSentence: 1 },
      ],
    });
    await answerQuestion(t.db, card.id, companyId, { requirementId: card.requirements[0]!.id, choice: "remove" });
    setLlmFake(() => draftOutput("Dev", [{ text: "Team player", sentence: 0, category: "other" }]));
    await expect(draftNeedCard(t.db, jobId, companyId)).rejects.toBeInstanceOf(HttpError);
  });
});

describe("concurrent company edits (s2-cs-1)", () => {
  it("does not lose an answer: the second write gets a 409", async () => {
    const jobId = await addJobRow(t.db, { sentences: ["a", "b"] });
    const { id: companyId } = await addCompany(t.db);
    const card = await makeCard(t.db, {
      jobId,
      companyId,
      requirements: [
        { text: "Team player", category: "other", postingSentence: 0, question: vague("team player"), pool: { ...POOL } },
        { text: "Calm person", category: "other", postingSentence: 1, question: vague("calm"), pool: { ...POOL } },
      ],
    });
    const [a, b] = card.requirements;
    const results = await Promise.allSettled([
      answerQuestion(t.db, card.id, companyId, { requirementId: a!.id, choice: "make_nice" }),
      answerQuestion(t.db, card.id, companyId, { requirementId: b!.id, choice: "remove" }),
    ]);
    const stored = await getNeedCard(t.db, card.id);
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(fulfilled).toBe(1);
    expect(rejected[0]!.reason).toMatchObject({ status: 409, code: "conflict" });
    expect(stored?.version).toBe(2);
    // the card matches the single applied answer
    const applied = stored!.requirements.some((r) => r.kind === "nice") || stored!.requirements.length === 1;
    expect(applied).toBe(true);
  });

  it("a pool recompute does not overwrite an answer that landed meanwhile", async () => {
    const jobId = await addJobRow(t.db, { sentences: ["a"] });
    const { id: companyId } = await addCompany(t.db);
    const card = await makeCard(t.db, {
      jobId,
      companyId,
      requirements: [{ text: "Team player", category: "other", postingSentence: 0, question: vague("team player"), pool: { ...POOL } }],
    });
    await Promise.all([
      recomputePoolEvidence(t.db, card.id),
      answerQuestion(t.db, card.id, companyId, { requirementId: card.requirements[0]!.id, choice: "make_nice" }),
    ]);
    const stored = await getNeedCard(t.db, card.id);
    expect(stored?.requirements[0]?.kind).toBe("nice");
  });
});

describe("touches argument order (s2-int-1)", () => {
  it("a 'Java' signal touches '5 years of Java development'", async () => {
    const jobId = await addJobRow(t.db, { sentences: ["Java"] });
    const { id: companyId } = await addCompany(t.db);
    const card = await makeCard(t.db, {
      jobId,
      companyId,
      requirements: [{ text: "5 years of Java development", category: "experience" }],
    });
    const ids = [await addTalent(t.db, { signals: [{ phrase: "Java" }] }), await addTalent(t.db)];
    await addEligibility(t.db, card.id, 1, ids);
    const evidence = await computePoolEvidence(t.db, card, new Date(), []);
    expect(evidence.get(card.requirements[0]!.id)?.speakTo).toBe(1);
  });
});
