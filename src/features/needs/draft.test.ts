import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { loadJobFixtures } from "../../../fixtures/load";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { jobSkill, llmCall, needCard } from "@/db/schema";
import { NeedCardDraftOutput } from "@/contracts";
import { listAudit } from "@/lib/audit";
import { setLlmFake } from "@/lib/llm";
import { runReadyJobs } from "@/lib/queue";
import { getJob } from "@/features/jobs";
import { draftNeedCard, getNeedCard, getNeedCardForJob, listNeedCards } from "./index";
import { RequirementQuestion } from "@/contracts";
import { coerceDraftOutput, validateDraft } from "./draft";
import { jobs as needJobs } from "./jobs";
import {
  addCompany,
  addEscoSkill,
  addJobRow,
  draftOutput,
  jobIdByTitle,
  kLabel,
  queued,
  userMessage,
} from "./test-helpers";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await loadJobFixtures(t.db);
});
afterAll(() => t.close());
afterEach(() => setLlmFake(null));

const EN = "FullStack Developer (Java, SpringBoot)";
const FI_PUBLIC = "Sairaanhoitaja, Kauniaisten terveysasema";

describe("drafting from an English posting (fixture)", () => {
  it("stores a draft with rendered sentences, no employer name, questions by the rules, and everything around it", async () => {
    const jobId = await jobIdByTitle(t.db, EN);
    const { id: companyId } = await addCompany(t.db);
    let prompt = "";
    let seen: { role?: string; purpose?: string } = {};
    setLlmFake((opts) => {
      prompt = userMessage(opts);
      seen = { role: opts.role, purpose: opts.purpose };
      return draftOutput(
        "Full-stack developer (Java)",
        [
          { text: "Java and Spring Boot work experience", sentence: 9, category: "experience", years: 1, questionType: "years", question: "Would someone who has done Java and Spring Boot, with fewer than 1 years, be worth a conversation?" },
          { text: "Full-stack development", sentence: 10, category: "skill" },
          { text: "Fluent English", sentence: 12, category: "language", language: "en", questionType: "language", question: "Is English needed from day one, or could someone start in English and build up English on the job?" },
          { text: "Self-motivated, open-minded", sentence: 11, category: "other", questionType: "vague", question: "What does 'self-motivated and open-minded' look like in this job? One concrete example helps us find people who have done it.", why: "The posting does not say what this means in practice." },
          { text: ".NET or Clojure", sentence: 14, kind: "nice" },
          { text: "DevOps practices (Academic Work standard)", sentence: 15, kind: "nice" },
          { text: "Web UI development", sentence: 16, kind: "nice" },
        ],
        [],
        "Builds Java solutions for a Wärtsilä-like company via Academic Work.",
      );
    });

    const card = await draftNeedCard(t.db, jobId, companyId);

    expect(seen).toEqual({ role: "analyst", purpose: "needs.draft" });
    expect(prompt).toContain("[P9] Relevant work experience with Java and Spring Boot");
    expect(prompt).toContain("Work languages listed by the source: en");
    expect(prompt).toMatch(/ESCO skills you may use in "esco":\nK1: /);

    expect(card.status).toBe("draft");
    expect(card.version).toBe(1);
    expect(card.jobId).toBe(jobId);
    expect(card.companyId).toBe(companyId);
    expect(card.id).toMatch(/^nc_/);
    expect(card.requirements.length).toBeGreaterThanOrEqual(5); // N1
    expect(card.requirements.map((r) => r.postingSentence)).toEqual([9, 10, 11, 12, 14, 15, 16]); // posting order
    const job = (await getJob(t.db, jobId))!;
    for (const r of card.requirements) {
      expect(r.id).toMatch(/^req_/);
      expect(job.sentences[r.postingSentence!]).toBeTruthy();
      expect(r.text.toLowerCase()).not.toContain("academic work");
      expect(r.source).toBe("agent");
    }
    expect(card.summary.toLowerCase()).not.toContain("academic work");
    // English requirement in an English posting: no question. Years < 3: none. Vague: kept (code-checked).
    const byText = (s: string) => card.requirements.find((r) => r.text.startsWith(s))!;
    expect(byText("Fluent English").question).toBeNull();
    expect(byText("Fluent English").languageCode).toBe("en");
    expect(byText("Java and Spring").question).toBeNull();
    expect(byText("Self-motivated").question?.type).toBe("vague");
    expect(byText("Self-motivated").question?.answer).toBeNull();
    expect(byText("Full-stack").languageCode).toBeNull();
    // the pool was counted right after drafting; nobody is eligible, so it is a whole-pool count
    expect(card.requirements[0]!.pool).toMatchObject({ scope: "whole_pool", hardFilterWouldExclude: null });

    // stored, retrievable and validated
    expect(await getNeedCard(t.db, card.id)).toEqual(card);
    expect(await getNeedCardForJob(t.db, jobId)).toEqual(card);
    expect((await listNeedCards(t.db, { companyId })).map((c) => c.id)).toEqual([card.id]);
    expect(await listNeedCards(t.db, { status: "confirmed" })).toEqual([]);

    // audit, queue and model-call log
    const events = await listAudit(t.db, { subjectType: "need_card", subjectId: card.id });
    expect(events.map((e) => e.action)).toEqual(["needcard.drafted"]);
    expect(events[0]!.actor).toBe("agent:analyst");
    expect(events[0]!.detail).toMatchObject({ jobId, version: 1, requirements: 7 });
    expect(await queued(t.db, "matching.need_changed")).toContainEqual({ needCardId: card.id, version: 1 });
    const [call] = await t.db.select().from(llmCall).where(eq(llmCall.purpose, "needs.draft"));
    expect(call?.role).toBe("analyst");
  });

  it("re-drafting keeps the card, bumps the version and rewrites job_skill; a card with company answers is refused", async () => {
    const jobId = await jobIdByTitle(t.db, EN);
    const existing = (await getNeedCardForJob(t.db, jobId))!;
    // The company answered the vague question in version 1.
    const answered = {
      ...existing,
      requirements: existing.requirements.map((r) =>
        r.question ? { ...r, question: { ...r.question, answer: { choice: "keep" as const, at: "2026-11-14T08:00:00Z" } } } : r,
      ),
    };
    await t.db.update(needCard).set({ body: answered }).where(eq(needCard.id, existing.id));
    setLlmFake(() => draftOutput("x", [{ text: "Python", sentence: 9 }]));
    await expect(draftNeedCard(t.db, jobId, null)).rejects.toMatchObject({ status: 409, code: "has_company_answers" });
    await t.db.update(needCard).set({ body: existing }).where(eq(needCard.id, existing.id));

    setLlmFake(() => draftOutput("Full-stack developer", [
      { text: "Self-motivated, open-minded", sentence: 11, category: "other", questionType: "vague" },
      { text: "Java development", sentence: 9 },
    ]));
    const card = await draftNeedCard(t.db, jobId, null);
    expect(card.id).toBe(existing.id);
    expect(card.version).toBe(2);
    expect(card.companyId).toBe(existing.companyId); // a feed re-draft does not detach the company
    expect(card.status).toBe("draft");
    expect(card.requirements).toHaveLength(2);
    const rows = await t.db.select().from(needCard).where(eq(needCard.jobId, jobId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.version).toBe(2);
    const events = await listAudit(t.db, { subjectType: "need_card", subjectId: card.id });
    expect(events.filter((e) => e.action === "needcard.drafted")).toHaveLength(2);
    expect(await queued(t.db, "matching.need_changed")).toContainEqual({ needCardId: card.id, version: 2 });
  });

  it("uses the bulk role for a card that only explains a posting in a feed", async () => {
    const jobId = await addJobRow(t.db, { sentences: ["We need Python."], title: "Feed role" });
    let role = "";
    setLlmFake((opts) => {
      role = opts.role;
      return draftOutput("Python developer", [{ text: "Python", sentence: 0 }]);
    });
    const card = await draftNeedCard(t.db, jobId, null);
    expect(role).toBe("bulk");
    expect(card.companyId).toBeNull();
    const events = await listAudit(t.db, { subjectType: "need_card", subjectId: card.id });
    expect(events[0]!.actor).toBe("agent:bulk");
  });
});

describe("drafting from a Finnish public-sector posting (fixture)", () => {
  it("applies the statutory rules: language act, licence, other law; never a question, never an exclusion count", async () => {
    const jobId = await jobIdByTitle(t.db, FI_PUBLIC);
    const { id: companyId } = await addCompany(t.db, { realName: "Länsi-Uudenmaan hyvinvointialue" });
    setLlmFake(() =>
      draftOutput("Registered nurse", [
        { text: "Fluent Finnish", sentence: 12, category: "language", language: "fi", questionType: "language", question: "Is Finnish needed from day one, or could someone start in English and build up Finnish on the job?" },
        { text: "Registered nurse", sentence: 22, category: "authorisation", statutory: "law", questionType: "tool", question: "Would experience with a comparable tool be enough, if the person learns it on the job?" },
        { text: "Vaccination cover", sentence: 23, category: "authorisation", statutory: "law" },
        { text: "Swedish and English", sentence: 13, category: "language", language: "sv", kind: "nice" },
        { text: "Pressure tolerance", sentence: 16, category: "other", questionType: "vague" },
      ]),
    );
    const card = await draftNeedCard(t.db, jobId, companyId);
    const by = (s: string) => card.requirements.find((r) => r.text.startsWith(s))!;
    expect(by("Fluent Finnish").statutory).toBe("language_act"); // N4
    expect(by("Fluent Finnish").question).toBeNull();
    expect(by("Fluent Finnish").languageCode).toBe("fi");
    expect(by("Registered nurse").statutory).toBe("licence");
    expect(by("Registered nurse").question).toBeNull();
    expect(by("Vaccination cover").statutory).toBe("other_law");
    expect(by("Swedish and English").statutory).toBe("language_act");
    expect(by("Pressure tolerance").statutory).toBe("none");
    expect(by("Pressure tolerance").question?.type).toBe("vague");
    for (const r of card.requirements.filter((x) => x.statutory !== "none")) {
      expect(r.question).toBeNull();
      expect(r.pool?.hardFilterWouldExclude ?? null).toBeNull();
    }
  });
});

describe("a private-sector Finnish requirement (N3) and protected content (N7)", () => {
  it("keeps the language question for a private employer and records dropped sentences", async () => {
    const jobId = await addJobRow(t.db, {
      lang: "fi",
      title: "Ohjelmistokehittäjä",
      employerName: "Esimerkki Oy",
      workLanguages: ["fi"],
      sentences: [
        "Edellytämme:",
        "Erinomainen suomen kielen taito suullisesti ja kirjallisesti",
        "Valmius turvallisuusselvitykseen",
        "Etsimme nuorta ja energistä tiimiläistä.",
        "Hae viimeistään 30.11.",
        "Ikä 25-35 vuotta",
      ],
    });
    const { id: companyId } = await addCompany(t.db);
    setLlmFake(() =>
      draftOutput(
        "Software developer",
        [
          { text: "Excellent spoken and written Finnish", sentence: 1, category: "language", language: "fi", questionType: "language", question: "(model wording is replaced)", why: "The posting asks for Finnish but does not say which tasks need it." },
          { text: "Security clearance", sentence: 2, category: "authorisation", statutory: "law", questionType: "vague", question: "What does 'security' look like in this job? One concrete example helps us find people who have done it." },
          { text: "Aged 25-35", sentence: 5, category: "other" },
        ],
        [3],
      ),
    );
    const card = await draftNeedCard(t.db, jobId, companyId);
    const fi = card.requirements.find((r) => r.category === "language")!;
    expect(fi.statutory).toBe("none");
    expect(fi.kind).toBe("must");
    expect(fi.languageCode).toBe("fi");
    expect(fi.question?.type).toBe("language");
    expect(fi.question?.text).toBe(
      "Is Finnish needed from day one, or could someone start in English and build up Finnish on the job?",
    );
    expect(fi.question?.why).toBe("The posting asks for Finnish but does not say which tasks need it.");
    const clearance = card.requirements.find((r) => r.category === "authorisation")!;
    expect(clearance.statutory).toBe("clearance"); // N5, from "turvallisuusselvitykseen"
    expect(clearance.question).toBeNull();
    expect(card.requirements.some((r) => /aged/i.test(r.text))).toBe(false); // lint drop
    expect(card.droppedSentences).toEqual([3, 5]); // N7: the model's and the lint's
    expect(card.requirements).toHaveLength(2);
  });

  it("records a work permit as authorisation with other_law: no question, no count", async () => {
    const jobId = await addJobRow(t.db, {
      lang: "fi",
      sentences: ["Edellytämme:", "Voimassa oleva työlupa Suomessa", "Python-osaaminen"],
    });
    const { id: companyId } = await addCompany(t.db);
    setLlmFake(() =>
      draftOutput("Developer", [
        { text: "Right to work in Finland", sentence: 1, category: "authorisation", statutory: "law", questionType: "vague", question: "What does 'right to work in Finland' look like in this job? One concrete example helps us find people who have done it." },
        { text: "Python", sentence: 2 },
      ]),
    );
    const card = await draftNeedCard(t.db, jobId, companyId);
    const permit = card.requirements.find((r) => r.category === "authorisation")!;
    expect(permit.statutory).toBe("other_law");
    expect(permit.question).toBeNull();
    expect(permit.pool).toBeNull();
    expect(card.requirements.find((r) => r.text === "Python")!.pool).not.toBeNull();
  });
});

describe("validation of the model output", () => {
  it("drops a requirement citing a sentence that does not exist (N2) and keeps the rest", async () => {
    const jobId = await jobIdByTitle(t.db, EN);
    const job = (await getJob(t.db, jobId))!;
    const out = NeedCardDraftOutput.parse(
      draftOutput("Dev", [
        { text: "Java", sentence: 9 },
        { text: "Ghost", sentence: 99 },
        { text: "Edge", sentence: job.sentences.length },
      ], [99, 3]),
    );
    const v = await validateDraft(t.db, job, out, []);
    expect(v.requirements.map((r) => r.text)).toEqual(["Java"]);
    expect(v.droppedSentences).toEqual([3]); // an out-of-range dropped index is ignored
  });

  it("resolves K labels to URIs, drops unknown ones and ESCO on language, authorisation and other", async () => {
    const jobId = await addJobRow(t.db, { sentences: ["Python", "Finnish", "Team player", "Licence"] });
    const job = (await getJob(t.db, jobId))!;
    const candidates = [
      { uri: "http://esco/py", labelEn: "Python", labelFi: null },
      { uri: "http://esco/sql", labelEn: "SQL", labelFi: null },
    ];
    const out = NeedCardDraftOutput.parse(
      draftOutput("Dev", [
        { text: "Python and SQL", sentence: 0, esco: ["K1", "K2", "K9"] },
        { text: "Finnish", sentence: 1, category: "language", language: "fi", esco: ["K1"] },
        { text: "Team player", sentence: 2, category: "other", esco: ["K2"] },
        { text: "Driving licence", sentence: 3, category: "authorisation", esco: ["K1"] },
      ]),
    );
    const v = await validateDraft(t.db, job, out, candidates);
    expect(v.requirements[0]!.escoSkillUris).toEqual(["http://esco/py", "http://esco/sql"]);
    for (const r of v.requirements.slice(1)) expect(r.escoSkillUris).toEqual([]);
  });

  it("dedupes by text and by ESCO set, and caps at 12 with all must-haves first", async () => {
    const jobId = await addJobRow(t.db, { sentences: Array.from({ length: 20 }, (_, i) => `Sentence ${i}`) });
    const job = (await getJob(t.db, jobId))!;
    const candidates = [{ uri: "http://esco/py", labelEn: "Python", labelFi: null }];
    const dup = NeedCardDraftOutput.parse(
      draftOutput("Dev", [
        { text: "Python", sentence: 0, esco: ["K1"] },
        { text: "python", sentence: 1 },
        { text: "Python programming", sentence: 2, esco: ["K1"] },
        { text: "Rust", sentence: 3 },
      ]),
    );
    expect((await validateDraft(t.db, job, dup, candidates)).requirements.map((r) => r.text)).toEqual(["Python", "Rust"]);

    // The schema caps the model at 12, so feed the validator more directly.
    const many = {
      ...draftOutput("Dev", []),
      requirements: Array.from({ length: 15 }, (_, i) => ({
        ...draftOutput("x", [{ text: `Ask ${i}`, sentence: i, kind: i < 5 ? "nice" : "must" } as never]).requirements[0]!,
      })),
    } as unknown as NeedCardDraftOutput;
    const v = await validateDraft(t.db, job, many, []);
    expect(v.requirements).toHaveLength(12);
    const kinds = v.requirements.map((r) => r.kind);
    expect(kinds.filter((k) => k === "must")).toHaveLength(10); // all ten must-haves survive
    expect(kinds.filter((k) => k === "nice")).toHaveLength(2);
    expect(v.requirements.map((r) => r.postingSentence)).toEqual([...v.requirements.map((r) => r.postingSentence)].sort((a, b) => a! - b!));
  });

  it("maps a skill with no K label by trigram, only when the best match is clear", async () => {
    await addEscoSkill(t.db, "http://esco/kubernetes", "Kubernetes");
    await addEscoSkill(t.db, "http://esco/sewing-a", "operate sewing machines");
    await addEscoSkill(t.db, "http://esco/sewing-b", "service sewing machines");
    const jobId = await addJobRow(t.db, { sentences: ["Kubernetes", "sewing machines"] });
    const job = (await getJob(t.db, jobId))!;
    const out = NeedCardDraftOutput.parse(
      draftOutput("Dev", [
        { text: "Kubernetes", sentence: 0 },
        { text: "sewing machines", sentence: 1 },
        { text: "Kubernetes", sentence: 1, category: "other" },
      ]),
    );
    const v = await validateDraft(t.db, job, out, []);
    expect(v.requirements[0]!.escoSkillUris).toEqual(["http://esco/kubernetes"]);
    expect(v.requirements[1]!.escoSkillUris).toEqual([]); // two equally good labels: no single winner
  });

  it("masks the employer name in titles, summaries and requirement texts", async () => {
    const jobId = await addJobRow(t.db, { employerName: "Nordic Pixel Studio Oy", sentences: ["Python"] });
    const job = (await getJob(t.db, jobId))!;
    const out = NeedCardDraftOutput.parse(draftOutput("Dev at Nordic Pixel", [{ text: "Python at Nordic Pixel Studio Oy", sentence: 0 }], [], "Nordic Pixel Studio Oy builds games."));
    const v = await validateDraft(t.db, job, out, []);
    const all = JSON.stringify(v).toLowerCase();
    expect(all).not.toContain("nordic");
    expect(all).toContain("the company");
  });

  it("builds the prompt's ESCO list from the posting's own skills, then its occupation's skills", async () => {
    const jobId = await jobIdByTitle(t.db, "Fullstack Developer / Uusimaa");
    let prompt = "";
    setLlmFake((opts) => {
      prompt = userMessage(opts);
      return draftOutput("Dev", [{ text: "Java", sentence: 0 }]);
    });
    const { id: companyId } = await addCompany(t.db);
    await draftNeedCard(t.db, jobId, companyId);
    const list = prompt.split('ESCO skills you may use in "esco":\n')[1]!.split("\n\n")[0]!.split("\n");
    expect(list.length).toBeGreaterThan(5);
    expect(list.length).toBeLessThanOrEqual(40);
    expect(list[0]).toMatch(/^K1: .+ \/ .+/);
    expect(kLabel({ messages: [{ role: "user", content: prompt }] } as never, "")).toBe("K1");
  });
});

describe("queue definitions and retries", () => {
  it("needs.draft drafts once and skips an unchanged posting", async () => {
    const jobId = await addJobRow(t.db, { sentences: ["Edellytämme Pythonia."], lang: "fi", title: "Queue role" });
    const { id: companyId } = await addCompany(t.db);
    let calls = 0;
    setLlmFake(() => {
      calls++;
      return draftOutput("Python developer", [{ text: "Python", sentence: 0 }]);
    });
    const { enqueue } = await import("@/lib/queue");
    await enqueue(t.db, "needs.draft", { jobId, companyId });
    expect(await runReadyJobs(t.db, needJobs)).toBe(1);
    expect(calls).toBe(1);
    expect((await getNeedCardForJob(t.db, jobId))?.version).toBe(1);
    await enqueue(t.db, "needs.draft", { jobId, companyId });
    expect(await runReadyJobs(t.db, needJobs)).toBe(1);
    expect(calls).toBe(1); // cached by posting
    // the posting changes: drafted again
    const { job } = await import("@/db/schema");
    await t.db.update(job).set({ sentences: ["Edellytämme Pythonia ja SQL:ää."] }).where(eq(job.id, jobId));
    await enqueue(t.db, "needs.draft", { jobId, companyId });
    await runReadyJobs(t.db, needJobs);
    expect(calls).toBe(2);
    expect((await getNeedCardForJob(t.db, jobId))?.version).toBe(2);
  });

  it("fails the draft when the model returns nothing valid, and stores nothing", async () => {
    const jobId = await addJobRow(t.db, { sentences: ["Python"] });
    setLlmFake(() => "not json at all");
    await expect(draftNeedCard(t.db, jobId, null)).rejects.toThrow(/no valid draft/);
    expect(await getNeedCardForJob(t.db, jobId)).toBeNull();
  });

  it("adds job_skill rows with origin needcard for grounded requirements", async () => {
    await addEscoSkill(t.db, "http://esco/golang", "Go (programming language)");
    const jobId = await addJobRow(t.db, { sentences: ["Go programming language"] });
    setLlmFake((opts) =>
      draftOutput("Dev", [{ text: "Go programming", sentence: 0, esco: [kLabel(opts, "Go (programming") ?? "K9"] }]),
    );
    const { id: companyId } = await addCompany(t.db);
    await draftNeedCard(t.db, jobId, companyId);
    const rows = await t.db.select().from(jobSkill).where(eq(jobSkill.jobId, jobId));
    // the candidate came from phrase matching on the short sentence
    expect(rows.map((r) => [r.skillUri, r.origin])).toEqual([["http://esco/golang", "needcard"]]);
  });
});

describe("second pass: what the real model needs", () => {
  it("states rule 14, the F4, F5 and F7 wording, and asks for 4000 tokens and a 90 s budget", async () => {
    const jobId = await addJobRow(t.db, { sentences: ["Python"] });
    const { id: companyId } = await addCompany(t.db);
    let seen: { maxTokens?: number; deadlineMs?: number; system?: string } = {};
    setLlmFake((opts) => {
      seen = { maxTokens: opts.maxTokens, deadlineMs: opts.deadlineMs, system: opts.messages[0]?.content };
      return draftOutput("Dev", [{ text: "Python", sentence: 0 }]);
    });
    await draftNeedCard(t.db, jobId, companyId);
    expect(seen.maxTokens).toBe(4000);
    expect(seen.deadlineMs).toBe(90000);
    expect(seen.system).toContain("14. Every requirement has all of these keys: text, kind, category, sentence, esco, language, years, statutory, questionType, question, why.");
    expect(seen.system).toContain('"Native speaker", "mother tongue" and "experience in Finland" count as nationality');
    expect(seen.system).toContain("Never for English when the posting is written in English.");
    expect(seen.system).toContain('If there are more, keep every "must" first, then "nice" in posting order.');
  });

  it("uses role bulk and the same budget for a card with no company", async () => {
    const jobId = await addJobRow(t.db, { sentences: ["Python"] });
    let seen: { role?: string; deadlineMs?: number } = {};
    setLlmFake((opts) => {
      seen = { role: opts.role, deadlineMs: opts.deadlineMs };
      return draftOutput("Dev", [{ text: "Python", sentence: 0 }]);
    });
    await draftNeedCard(t.db, jobId, null);
    expect(seen).toEqual({ role: "bulk", deadlineMs: 90000 });
  });

  it("coerces a bad language code or year count to null instead of failing the card", async () => {
    const jobId = await addJobRow(t.db, { sentences: ["Edellytämme suomea.", "Python"] });
    const { id: companyId } = await addCompany(t.db);
    setLlmFake(() => {
      const out = draftOutput("Dev", [
        { text: "Finnish", sentence: 0, category: "language", language: "fi" },
        { text: "Python", sentence: 1 },
      ]) as { requirements: Array<Record<string, unknown>> };
      out.requirements[0]!.language = "Finnish";
      out.requirements[0]!.years = 2.5;
      out.requirements[1]!.language = "";
      out.requirements[1]!.years = "3";
      return out;
    });
    const card = await draftNeedCard(t.db, jobId, companyId);
    expect(card.requirements).toHaveLength(2);
    expect(card.requirements[0]!.languageCode).toBeNull();
    const keep = coerceDraftOutput({ requirements: [{ language: "sv", years: 4 }, { language: "Sv", years: null }] }) as {
      requirements: Array<{ language: unknown; years: unknown }>;
    };
    expect(keep.requirements).toEqual([{ language: "sv", years: 4 }, { language: null, years: null }]);
    expect(coerceDraftOutput("junk")).toBe("junk");
  });

  it("drops a requirement whose text asks for a protected trait and counts it in the audit detail", async () => {
    const jobId = await addJobRow(t.db, { sentences: ["Native Finnish speaker wanted.", "Work at a health centre.", "Fluent Swedish.", "Python"] });
    const { id: companyId } = await addCompany(t.db);
    setLlmFake(() =>
      draftOutput("Dev", [
        { text: "Native Finnish speaker", sentence: 0, category: "language", language: "fi" },
        { text: "Work at a health centre", sentence: 1, category: "other" },
        { text: "Fluent Swedish", sentence: 2, category: "language", language: "sv" },
        { text: "Python", sentence: 3 },
      ]),
    );
    const card = await draftNeedCard(t.db, jobId, companyId);
    expect(card.requirements.map((r) => r.text)).toEqual(["Work at a health centre", "Fluent Swedish", "Python"]);
    expect(card.droppedSentences).toEqual([0]);
    const [event] = await listAudit(t.db, { subjectType: "need_card", subjectId: card.id, action: "needcard.drafted" });
    expect(event!.detail).toMatchObject({ droppedProtected: 1 });
  });

  it("masks the employer in question text and reason as well", async () => {
    const jobId = await addJobRow(t.db, { employerName: "Nordic Pixel Studio Oy", sentences: ["Hyvä tiimityöskentely"] });
    const job = (await getJob(t.db, jobId))!;
    const out = NeedCardDraftOutput.parse(
      draftOutput("Dev", [
        {
          text: "Team work",
          sentence: 0,
          category: "other",
          questionType: "vague",
          question: "What does 'Team work' look like in this job? One concrete example helps us find people who have done it.",
          why: "Nordic Pixel does not say what this means.",
        },
      ]),
    );
    const v = await validateDraft(t.db, job, out, []);
    expect(v.requirements[0]!.question?.why.toLowerCase()).not.toContain("nordic");
  });

  it("drops a question that masking would push past the contract maximum", async () => {
    const jobId = await addJobRow(t.db, { employerName: "Vala Group Oy", sentences: ["Jira"] });
    const job = (await getJob(t.db, jobId))!;
    const tail = "Would experience with a comparable tool be enough, if the person learns ";
    const text = `${tail}${"Vala ".repeat(21)}on the job?`;
    expect(text.length).toBeLessThanOrEqual(240);
    const out = NeedCardDraftOutput.parse(
      draftOutput("Dev", [{ text: "Jira", sentence: 0, category: "skill", questionType: "tool", question: text, why: "Vala is not specific." }]),
    );
    const v = await validateDraft(t.db, job, out, []);
    for (const r of v.requirements) {
      if (r.question) expect(() => RequirementQuestion.parse(r.question)).not.toThrow();
    }
  });

  it("a failed draft leaves no card behind and the queue job fails so it is retried", async () => {
    const jobId = await addJobRow(t.db, { sentences: ["Python"] });
    const { id: companyId } = await addCompany(t.db);
    setLlmFake(() => "broken");
    const { enqueue } = await import("@/lib/queue");
    const { jobQueue } = await import("@/db/schema");
    await enqueue(t.db, "needs.draft", { jobId, companyId });
    await runReadyJobs(t.db, needJobs);
    expect(await getNeedCardForJob(t.db, jobId)).toBeNull();
    const rows = (await t.db.select().from(jobQueue)).filter((r) => r.kind === "needs.draft" && (r.payload as { jobId: string }).jobId === jobId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.doneAt).toBeNull();
    expect(rows[0]!.attempts).toBe(1);
  });
});

describe("re-drafting while the company acts on its card", () => {
  it("keeps the company's version and drops the draft when an answer lands during the model call", async () => {
    const { answerQuestion } = await import("./actions");
    const { makeCard } = await import("./test-helpers");
    const jobId = await addJobRow(t.db, { sentences: ["Edellytämme tiimipelaajaa.", "Python"] });
    const { id: companyId } = await addCompany(t.db);
    const question = {
      type: "vague" as const,
      text: "What does 'Team player' look like in this job? One concrete example helps us find people who have done it.",
      why: "The posting does not say what this means in practice.",
      answer: null,
    };
    const pool = { scope: "relevant", relevant: 10, speakTo: 6, hardFilterWouldExclude: 4, selfDeclaredOnly: null, computedAt: "2026-11-14T06:02:11Z" } as const;
    const card = await makeCard(t.db, {
      jobId,
      companyId,
      requirements: [{ text: "Team player", category: "other", postingSentence: 0, question, pool }],
    });
    setLlmFake(async () => {
      // the company answers after the first check, while the model is still working
      await answerQuestion(t.db, card.id, companyId, { requirementId: card.requirements[0]!.id, choice: "make_nice" });
      return draftOutput("Dev", [{ text: "Python", sentence: 1 }]);
    });
    await expect(draftNeedCard(t.db, jobId, companyId)).rejects.toMatchObject({ status: 409, code: "has_company_answers" });
    const stored = (await getNeedCardForJob(t.db, jobId))!;
    expect(stored.version).toBe(2);
    expect(stored.requirements.map((r) => [r.text, r.kind])).toEqual([["Team player", "nice"]]);
    expect(stored.requirements[0]!.question?.answer?.choice).toBe("make_nice");
  });

  it("a write that finds another version fails with a conflict and changes nothing", async () => {
    const { makeCard } = await import("./test-helpers");
    const { saveNeedCard } = await import("./store");
    const jobId = await addJobRow(t.db, { sentences: ["Python"] });
    const { id: companyId } = await addCompany(t.db);
    const card = await makeCard(t.db, { jobId, companyId, requirements: [{ text: "Python", category: "skill", postingSentence: 0 }] });
    await expect(saveNeedCard(t.db, { ...card, version: 2 }, new Date(), 7)).rejects.toMatchObject({ code: "conflict" });
    expect((await getNeedCardForJob(t.db, jobId))!.version).toBe(1);
  });
});
