import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { runReadyJobs } from "@/lib/queue";
import { jobs as matchingJobs } from "@/features/matching/jobs";
import { answerQuestion, companyNeedView } from "./actions";
import { jobs as needJobs } from "./jobs";
import { getNeedCard } from "./index";
import { buildCompanyView } from "./view";
import { addCompany, addJobRow, addTalent, makeCard } from "./test-helpers";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

const OLD_POOL = { scope: "relevant", relevant: 5, speakTo: 3, hardFilterWouldExclude: 2, selfDeclaredOnly: null, computedAt: "2026-11-14T06:02:11Z" } as const;

describe("pool numbers after an answer (brief item 8)", () => {
  it("remove: the answer route's job chain ends in needs.recompute_pool and the page then shows the new numbers", async () => {
    const jobId = await addJobRow(t.db, { sentences: ["Kubernetes", "Terraform", "Edellytämme tiimipelaajaa."] });
    const { id: companyId, token } = await addCompany(t.db);
    const toolQuestion = {
      type: "tool" as const,
      text: "Would experience with a comparable tool be enough, if the person learns Terraform on the job?",
      why: "Many people have used comparable tools for the same work.",
      answer: null,
    };
    const card = await makeCard(t.db, {
      jobId,
      companyId,
      requirements: [
        { text: "Kubernetes", category: "skill", postingSentence: 0, pool: { ...OLD_POOL } },
        { text: "Terraform", category: "skill", postingSentence: 1, question: toolQuestion, pool: { ...OLD_POOL } },
      ],
    });
    await addTalent(t.db, { signals: [{ phrase: "Kubernetes" }] });
    await addTalent(t.db, { signals: [{ phrase: "Terraform" }] });
    await addTalent(t.db, { signals: [{ phrase: "Terraform" }] });

    const terraform = card.requirements[1]!;
    const saved = await answerQuestion(t.db, card.id, companyId, { requirementId: terraform.id, choice: "remove" });
    expect(saved.version).toBe(2);

    // The worker: need_changed (eligibility for version 2), then recompute_pool.
    let ran = 0;
    for (let round = 0; round < 4; round++) ran += await runReadyJobs(t.db, [...matchingJobs, ...needJobs]);
    expect(ran).toBeGreaterThanOrEqual(2);

    const after = (await getNeedCard(t.db, card.id))!;
    expect(after.version).toBe(2); // the recompute is not an edit
    const k = after.requirements[0]!;
    expect(k.pool).toMatchObject({ scope: "relevant", relevant: 1, speakTo: 1 });
    expect(k.pool?.computedAt).not.toBe(OLD_POOL.computedAt);

    // "after a reload": the page's payload carries the new numbers.
    const view = await companyNeedView(t.db, card.id, token);
    expect(view.requirements[0]!.pool).toMatchObject({ relevant: 1, speakTo: 1 });
  });

  it("make_nice: the chain recomputes too and keeps the answer", async () => {
    const jobId = await addJobRow(t.db, { sentences: ["Kubernetes"] });
    const { id: companyId } = await addCompany(t.db);
    const q = {
      type: "tool" as const,
      text: "Would experience with a comparable tool be enough, if the person learns Kubernetes on the job?",
      why: "Many people have used comparable tools for the same work.",
      answer: null,
    };
    const card = await makeCard(t.db, {
      jobId,
      companyId,
      requirements: [{ text: "Kubernetes", category: "skill", postingSentence: 0, question: q, pool: { ...OLD_POOL } }],
    });
    await addTalent(t.db, { signals: [{ phrase: "Kubernetes" }] });
    await answerQuestion(t.db, card.id, companyId, { requirementId: card.requirements[0]!.id, choice: "make_nice" });
    for (let round = 0; round < 4; round++) await runReadyJobs(t.db, [...matchingJobs, ...needJobs]);
    const after = (await getNeedCard(t.db, card.id))!;
    expect(after.requirements[0]!.kind).toBe("nice");
    expect(after.requirements[0]!.question?.answer?.choice).toBe("make_nice");
    expect(after.requirements[0]!.pool?.computedAt).not.toBe(OLD_POOL.computedAt);
  });
});

describe("shared masking in the company view (brief item 7)", () => {
  it("replaces the employer in title, summary, text, cited sentence, question and why, with or without the legal form", async () => {
    const jobId = await addJobRow(t.db, {
      employerName: "Nordic Pixel Studio Oy",
      sentences: ["Nordic Pixel Studio hakee tiimipelaajaa."],
    });
    const { id: companyId } = await addCompany(t.db, { realName: "Nordic Pixel Studio Oy" });
    const q = {
      type: "vague" as const,
      text: "What does 'Nordic Pixel team player' look like in this job? One concrete example helps us find people who have done it.",
      why: "Nordic Pixel Studio does not say what this means.",
      answer: null,
    };
    const pool = { scope: "relevant", relevant: 10, speakTo: 6, hardFilterWouldExclude: 4, selfDeclaredOnly: null, computedAt: "2026-11-14T06:02:11Z" } as const;
    const card = await makeCard(t.db, {
      jobId,
      companyId,
      requirements: [{ text: "Nordic Pixel Studio tools", category: "other", postingSentence: 0, question: q, pool }],
    });
    const view = await buildCompanyView(
      t.db,
      { ...card, title: "Developer at Nordic Pixel Studio Oy", summary: "nordic pixel studio builds games." },
      { displayName: "Demo company 03", masked: true, realName: "Nordic Pixel Studio Oy" },
    );
    expect(view.requirements[0]!.question).toBeDefined();
    expect(JSON.stringify(view).toLowerCase()).not.toContain("nordic");
    const unmasked = await buildCompanyView(t.db, card, { displayName: "Nordic Pixel Studio Oy", masked: false, realName: "Nordic Pixel Studio Oy" });
    expect(JSON.stringify(unmasked)).toContain("Nordic Pixel");
  });
});
