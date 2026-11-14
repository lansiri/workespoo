import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { APPLICATION_RUBRIC_VERSION, type ApplicationPlan, type ApplicationTurn } from "@/contracts";
import { application, auditLog, llmCall } from "@/db/schema";
import type { Db } from "@/db/client";
import { resetLlmState, setLlmFake } from "@/lib/llm/testing";
import { addCompany, addNeed, addTalent, resetDb } from "@/features/picks/test-helpers";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { assessApplication, buildAssessorInput, checkAssessment, type AssessorInput } from "./assess";
import { CODE_REASONS, CODE_SUMMARY, NOT_ANSWERED_REASON } from "./levels";
import { assessUserMessage } from "./prompts-assess";
import { REQS, addApplication, planFor } from "./rank-fixtures";

const NOW = new Date("2026-11-14T13:00:00.000Z");

function turn(index: number, requirementId: string, sentences: string[], extra: Partial<ApplicationTurn> = {}): ApplicationTurn {
  return {
    id: `t${index}`,
    applicationId: "a1",
    index,
    role: "participant",
    kind: "answer",
    requirementId,
    text: sentences.join(" "),
    sentences,
    inputMode: "voice",
    removedAt: null,
    at: "2026-11-14T10:00:00.000Z",
    ...extra,
  };
}

const plan: ApplicationPlan = planFor("n1");
const opening: ApplicationTurn = {
  ...turn(0, "r1", []),
  role: "interviewer",
  kind: "opening",
  text: "Hello, I am the interviewer. Tell me about a time you used Python data pipelines in your own work.",
};

function inputFrom(turns: ApplicationTurn[]): AssessorInput {
  return buildAssessorInput({ jobTitle: "Data engineer", plan, turns, adSentences: ["We need Python pipelines."] });
}

const goodReasons = (s: string) => ({ reason_en: s, reason_fi: `${s} (fi)`, reason_sv: `${s} (sv)` });
const SUMMARY = { summary_en: "Two requirements had examples.", summary_fi: "Kaksi vaatimusta.", summary_sv: "Två krav." };

describe("buildAssessorInput", () => {
  it("labels requirements and sentences, takes only the question part of the opening, skips removed answers", () => {
    const input = inputFrom([
      opening,
      turn(1, "r1", ["I rebuilt the nightly import.", "The counts matched afterwards."]),
      turn(3, "r2", ["Secret sentence."], { removedAt: "2026-11-14T11:00:00.000Z", text: "", sentences: [] }),
    ]);
    expect(input.requirements.map((r) => r.label)).toEqual(["R1", "R2", "R3"]);
    const r1 = input.requirements[0];
    expect(r1.questions).toEqual([plan.requirements[0].question]);
    expect(r1.adSentence).toBe("We need Python pipelines.");
    expect(r1.sentences.map((s) => s.label)).toEqual(["T1.S1", "T1.S2"]);
    expect(input.requirements[1].sentences).toEqual([]);
    expect(input.requirements[2].adSentence).toBeNull();
  });

  it("leaves out a sentence with a protected detail and keeps its label", () => {
    const input = inputFrom([opening, turn(1, "r1", ["I am a mother of two and 45 years old.", "I rebuilt the import."])]);
    const [first, second] = input.requirements[0].sentences;
    expect(first).toMatchObject({ label: "T1.S1", text: "[left out]", leftOut: true });
    expect(second).toMatchObject({ label: "T1.S2", leftOut: false });
    expect(JSON.stringify(input)).not.toContain("mother");
  });

  it("holds no name, nickname, language field or input mode", () => {
    const input = inputFrom([opening, turn(1, "r1", ["I rebuilt the import."], { inputMode: "voice" })]);
    const text = JSON.stringify(input) + assessUserMessage(input);
    expect(text).not.toMatch(/voice/i);
    expect(text).not.toMatch(/inputMode|handle|nickname|lang|displayName|talentId/i);
    expect(Object.keys(input).sort()).toEqual(["jobTitle", "requirements"]);
  });
});

describe("checkAssessment", () => {
  const input = inputFrom([
    opening,
    turn(1, "r1", ["I rebuilt the nightly import.", "I am a mother of two and 45 years old."]),
    turn(3, "r2", ["I write SQL for reports."]),
  ]);
  const check = (output: unknown, terms: string[] = []) => checkAssessment({ input, output, employerTerms: terms, now: NOW });

  it("keeps a good rating and stores the version and time", () => {
    const a = check({
      ratings: [
        { requirement: "R1", level: 3, evidence: ["T1.S1"], ...goodReasons("The answer describes rebuilding a nightly import.") },
        { requirement: "R2", level: 1, evidence: ["T3.S1"], ...goodReasons("The answer says SQL is used for reports.") },
      ],
      ...SUMMARY,
    })!;
    expect(a.rubricVersion).toBe(APPLICATION_RUBRIC_VERSION);
    expect(a.assessedAt).toBe(NOW.toISOString());
    expect(a.ratings.map((r) => [r.requirementId, r.level, r.wording])).toEqual([
      ["r1", 3, "model"],
      ["r2", 1, "model"],
      ["r3", 0, "code"],
    ]);
    expect(a.ratings[0].evidence).toEqual([{ turnIndex: 1, sentenceFrom: 1, sentenceTo: 1 }]);
    expect(a.summary.en).toBe(SUMMARY.summary_en);
  });

  it("returns null when the call failed or the output is not the schema", () => {
    expect(check(null)).toBeNull();
    expect(check({ nope: true })).toBeNull();
  });

  it("makes a level without a resolving reference level 0 and words it by code", () => {
    const a = check({
      ratings: [
        { requirement: "R1", level: 3, evidence: ["T9.S1"], ...goodReasons("The answer describes a nightly import.") },
        { requirement: "R2", level: 2, evidence: [], ...goodReasons("The answer describes SQL work.") },
      ],
      ...SUMMARY,
    })!;
    expect(a.ratings[0]).toMatchObject({ level: 0, evidence: [], wording: "code", reason: CODE_REASONS[0] });
    expect(a.ratings[1]).toMatchObject({ level: 0, wording: "code" });
  });

  it("does not accept a citation of a sentence that was left out, or a range that includes one", () => {
    const a = check({
      ratings: [{ requirement: "R1", level: 2, evidence: ["T1.S2", "T1.S1-S2"], ...goodReasons("The answer describes a nightly import.") }],
      ...SUMMARY,
    })!;
    expect(a.ratings[0].level).toBe(0);
  });

  it("accepts a citation under another requirement and drops duplicates and more than four", () => {
    const a = check({
      ratings: [{ requirement: "R2", level: 2, evidence: ["T1.S1", "T1.S1", "T3.S1"], ...goodReasons("The answers describe SQL work.") }],
      ...SUMMARY,
    })!;
    expect(a.ratings[1].level).toBe(2);
    expect(a.ratings[1].evidence).toHaveLength(2);
  });

  it("replaces reasons that judge, name a protected detail or name the employer, and replaces all three languages", () => {
    const a = check(
      {
        ratings: [
          { requirement: "R1", level: 2, evidence: ["T1.S1"], reason_en: "A strong answer.", reason_fi: "Hyvä.", reason_sv: "Bra." },
          { requirement: "R2", level: 1, evidence: ["T3.S1"], reason_en: "The answer says SQL is used at Acme.", reason_fi: "SQL.", reason_sv: "SQL." },
        ],
        ...SUMMARY,
      },
      ["Acme"],
    )!;
    expect(a.ratings[0]).toMatchObject({ level: 2, wording: "code", reason: CODE_REASONS[2] });
    expect(a.ratings[1]).toMatchObject({ level: 1, wording: "code", reason: CODE_REASONS[1] });
    const protectedReason = check({
      ratings: [{ requirement: "R1", level: 2, evidence: ["T1.S1"], ...goodReasons("The person is 45 years old and a mother of two.") }],
      ...SUMMARY,
    })!;
    expect(protectedReason.ratings[0].wording).toBe("code");
  });

  it("replaces an empty reason in one language", () => {
    const a = check({
      ratings: [{ requirement: "R1", level: 2, evidence: ["T1.S1"], reason_en: "The answer describes an import.", reason_fi: "", reason_sv: "Svar." }],
      ...SUMMARY,
    })!;
    expect(a.ratings[0].wording).toBe("code");
  });

  it("rates a requirement without answers as not answered, whatever the model said", () => {
    const a = check({
      ratings: [{ requirement: "R3", level: 3, evidence: ["T1.S1"], ...goodReasons("The answer describes Airflow.") }],
      ...SUMMARY,
    })!;
    expect(a.ratings[2]).toMatchObject({ level: 0, evidence: [], wording: "code", reason: NOT_ANSWERED_REASON });
  });

  it("drops unknown requirements and replaces a judging or too long summary by the code's", () => {
    const a = check({
      ratings: [
        { requirement: "R9", level: 3, evidence: ["T1.S1"], ...goodReasons("x") },
        { requirement: "R1", level: 2, evidence: ["T1.S1"], ...goodReasons("The answer describes an import.") },
      ],
      summary_en: "An impressive set of answers.",
      summary_fi: "a",
      summary_sv: "b",
    })!;
    expect(a.ratings).toHaveLength(3);
    expect(a.summary.en).toBe(CODE_SUMMARY.en.replace("{n}", "1").replace("{m}", "3"));
    const long = check({ ratings: [], summary_en: "One. Two. Three.", summary_fi: "Yksi.", summary_sv: "Ett." })!;
    expect(long.summary.en).toContain("0 of 3");
  });
});

describe("assessApplication", () => {
  let t: TestDb;
  let db: Db;
  let calls: string[];
  beforeAll(async () => {
    t = await createTestDb();
    db = t.db;
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(db);
    calls = [];
    await addCompany(db, { id: "c1" });
    await addNeed(db, { id: "n1", companyId: "c1", requirements: REQS.map((r) => ({ id: r.id, text: r.text, kind: r.kind })), sentences: ["Acme Robotics needs Python pipelines."] });
    await addTalent(db, { id: "t1" });
  });
  afterEach(() => resetLlmState());

  const fakeGood = () =>
    setLlmFake((opts) => {
      calls.push(opts.purpose);
      expect(opts.role).toBe("analyst");
      const text = JSON.stringify(opts.messages);
      expect(text).not.toContain("Acme");
      return {
        ratings: [{ requirement: "R1", level: 2, evidence: ["T1.S1"], ...goodReasons("The answer describes Python pipeline work.") }],
        ...SUMMARY,
      };
    });

  it("stores the checked assessment, sets the status and audits without levels", async () => {
    fakeGood();
    await addApplication(db, { id: "a1", talentId: "t1", jobId: "job_n1", companyId: "c1", needCardId: "n1" });
    const result = await assessApplication(db, "a1", { now: () => NOW });
    expect(calls).toEqual(["application.assess"]);
    expect(result?.ratings[0].level).toBe(2);
    const [row] = await db.select().from(application).where(eq(application.id, "a1"));
    expect(row.status).toBe("assessed");
    expect(row.assessedAt?.toISOString()).toBe(NOW.toISOString());
    expect(row.assessment?.ratings).toHaveLength(3);
    const events = await db.select().from(auditLog).where(eq(auditLog.action, "application.assessed"));
    expect(events).toHaveLength(1);
    expect(events[0].subjectType).toBe("application");
    expect(events[0].detail).toEqual({ talentId: "t1", jobId: "job_n1", rubricVersion: APPLICATION_RUBRIC_VERSION });
    expect((await db.select().from(llmCall)).length).toBe(1);
  });

  it("is idempotent: an assessed or missing application causes no call", async () => {
    fakeGood();
    await addApplication(db, { id: "a1", talentId: "t1", jobId: "job_n1", companyId: "c1", needCardId: "n1" });
    await assessApplication(db, "a1", { now: () => NOW });
    await assessApplication(db, "a1");
    expect(await assessApplication(db, "gone")).toBeNull();
    expect(calls).toHaveLength(1);
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "application.assessed"))).toHaveLength(1);
  });

  it("makes no call when nothing was answered and rates every requirement 0", async () => {
    fakeGood();
    await addApplication(db, { id: "a1", talentId: "t1", jobId: "job_n1", companyId: "c1", needCardId: "n1", answers: { r1: [], r2: [], r3: [] } });
    const result = await assessApplication(db, "a1", { now: () => NOW });
    expect(calls).toHaveLength(0);
    expect(result?.ratings.map((r) => r.level)).toEqual([0, 0, 0]);
    expect(result?.ratings[0].reason).toEqual(NOT_ANSWERED_REASON);
  });

  it("throws when the model does not deliver, and stores nothing", async () => {
    setLlmFake(() => "this is not json at all");
    await addApplication(db, { id: "a1", talentId: "t1", jobId: "job_n1", companyId: "c1", needCardId: "n1" });
    await expect(assessApplication(db, "a1")).rejects.toThrow();
    const [row] = await db.select().from(application).where(eq(application.id, "a1"));
    expect(row.status).toBe("submitted");
    expect(row.assessment).toBeNull();
  });

  it("leaves an application that was not sent alone", async () => {
    fakeGood();
    await addApplication(db, { id: "a1", talentId: "t1", jobId: "job_n1", companyId: "c1", needCardId: "n1", status: "review" });
    expect(await assessApplication(db, "a1")).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
