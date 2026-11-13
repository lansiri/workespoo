import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { HttpError } from "@/lib/http";
import { listAudit } from "@/lib/audit";
import type { NeedCard, Requirement } from "@/contracts";
import { UI_LANGS } from "@/lib/i18n/types";
import { AnswerInput, answerQuestion, companyNeedView, confirmNeedCard, organiserNeedView, resolveNeedAccess } from "./actions";
import { getNeedCard } from "./index";
import { NeedCardPageView } from "./NeedCardPageView";
import { needMessages } from "./messages";
import { buildCompanyView } from "./view";
import { addCompany, addEscoSkill, addJobRow, makeCard, queued } from "./test-helpers";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

const REAL = "Academic Work Finland Oy";
const EMPLOYER_IN_POSTING = "Testiyhtiö Oy";
const POOL = { scope: "relevant", relevant: 10, speakTo: 6, hardFilterWouldExclude: 4, selfDeclaredOnly: null, computedAt: "2026-11-14T06:02:11Z" } as const;

const vague = (phrase: string) => ({
  type: "vague" as const,
  text: `What does '${phrase}' look like in this job? One concrete example helps us find people who have done it.`,
  why: "The posting does not say what this means in practice.",
  answer: null,
});

async function scenario(over: { masked?: boolean } = {}) {
  const jobId = await addJobRow(t.db, {
    employerName: EMPLOYER_IN_POSTING,
    sentences: [`${EMPLOYER_IN_POSTING} hakee kehittäjää.`, "Edellytämme tiimipelaajaa.", "Valmius turvallisuusselvitykseen", "Kokemus Java-kehityksestä"],
  });
  const co = await addCompany(t.db, { realName: REAL, masked: over.masked ?? true });
  const card = await makeCard(t.db, {
    jobId,
    companyId: co.id,
    requirements: [
      { text: "Team player", category: "other", postingSentence: 1, question: vague("team player"), pool: { ...POOL } },
      { text: `Java at ${REAL}`, category: "skill", postingSentence: 3, pool: { ...POOL, speakTo: 2, hardFilterWouldExclude: 8 } },
      { text: "Security clearance", category: "authorisation", statutory: "clearance", postingSentence: 2, pool: { ...POOL, hardFilterWouldExclude: null } },
      { text: "Added by company", source: "company", postingSentence: null, category: "skill", pool: null },
      // a question the company cannot see yet: nobody would be set aside
      { text: "Calm under pressure", category: "other", postingSentence: 1, question: vague("calm"), pool: { ...POOL, speakTo: 10, hardFilterWouldExclude: 0 } },
    ],
  });
  return { jobId, co, card };
}

describe("the company's payload", () => {
  it("never carries the real employer name while masked, and omits what is hidden", async () => {
    const { co, card } = await scenario();
    const view = await companyNeedView(t.db, card.id, co.token);
    const json = JSON.stringify(view);
    expect(json).not.toContain(REAL);
    expect(json).not.toContain("Academic");
    expect(json).not.toContain("Testiyhtiö");
    expect(json).toContain("Demo company 07");
    expect(json).toContain("the company");
    expect(view.company).toEqual({ displayName: "Demo company 07", masked: true });
    expect(view.requirements[0]!.postingSentence).toBe("Edellytämme tiimipelaajaa.");
    expect(view.requirements[1]!.text).toBe("Java at the company");
    expect(view.requirements[1]!.postingSentence).toBe("Kokemus Java-kehityksestä");
    expect(view.requirements[3]!.postingSentence).toBeNull();
    // ids of the posting and the company are not sent
    expect(json).not.toContain(card.jobId);
    expect(json).not.toContain(co.id);
    // statutory: no exclusion key at all, and no question
    const clearance = view.requirements[2]!;
    expect(clearance.pool).toBeDefined();
    expect("hardFilterWouldExclude" in clearance.pool!).toBe(false);
    expect(clearance.question).toBeUndefined();
    // a question that is not shown is absent, not hidden
    expect(view.requirements[0]!.question?.type).toBe("vague");
    expect("question" in view.requirements[4]!).toBe(false);
    expect("pool" in view.requirements[3]!).toBe(false);
  });

  it("masks the posting sentence even when the employer name differs only in case", async () => {
    const { co, card } = await scenario();
    const view = await companyNeedView(t.db, card.id, co.token);
    expect(view.requirements.every((r) => !/testiyhti/i.test(r.postingSentence ?? ""))).toBe(true);
    const direct = await buildCompanyView(t.db, card, { displayName: "X", masked: true, realName: "TESTIYHTIÖ" });
    expect(JSON.stringify(direct).toLowerCase()).not.toContain("testiyhti");
  });

  it("shows no masked banner flag for an unmasked company", async () => {
    const { co, card } = await scenario({ masked: false });
    const view = await companyNeedView(t.db, card.id, co.token);
    expect(view.company.masked).toBe(false);
  });
});

describe("access", () => {
  it("lets a company see its own card and no one else's, and an organiser see any", async () => {
    const a = await scenario();
    const b = await scenario();
    expect((await resolveNeedAccess(t.db, a.card.id, { token: a.co.token, organiser: false })).access.kind).toBe("company");
    await expect(resolveNeedAccess(t.db, a.card.id, { token: b.co.token, organiser: false })).rejects.toMatchObject({ status: 404 });
    await expect(resolveNeedAccess(t.db, a.card.id, { token: "wrong", organiser: false })).rejects.toMatchObject({ status: 401 });
    await expect(resolveNeedAccess(t.db, a.card.id, { token: null, organiser: false })).rejects.toMatchObject({ status: 401 });
    await expect(resolveNeedAccess(t.db, "nc_missing", { token: a.co.token, organiser: false })).rejects.toMatchObject({ status: 404 });
    const org = await resolveNeedAccess(t.db, a.card.id, { token: null, organiser: true });
    expect(org.access.kind).toBe("organiser");
    expect(organiserNeedView(org.card).needCard.id).toBe(a.card.id);
    await expect(resolveNeedAccess(t.db, "nc_missing", { token: null, organiser: true })).rejects.toMatchObject({ status: 404 });
    // a link always gets the company's view, even from a browser that is signed in as organiser
    expect((await resolveNeedAccess(t.db, a.card.id, { token: a.co.token, organiser: true })).access.kind).toBe("company");
  });

  it("does not give a feed-only card (no company) to any link", async () => {
    const jobId = await addJobRow(t.db, { sentences: ["x"] });
    const card = await makeCard(t.db, { jobId, companyId: null, requirements: [{ text: "x" }] });
    const co = await addCompany(t.db);
    await expect(resolveNeedAccess(t.db, card.id, { token: co.token, organiser: false })).rejects.toMatchObject({ status: 404 });
  });
});

async function version(card: NeedCard) {
  return (await getNeedCard(t.db, card.id))!;
}
const req = (c: NeedCard, text: string): Requirement => c.requirements.find((r) => r.text.startsWith(text))!;

describe("answering a question", () => {
  it("keep: records the answer, bumps the version, audits twice, enqueues matching", async () => {
    const { co, card } = await scenario();
    const target = req(card, "Team player");
    const saved = await answerQuestion(t.db, card.id, co.id, { requirementId: target.id, choice: "keep", note: "It matters." });
    expect(saved.version).toBe(2);
    const r = req(saved, "Team player");
    expect(r.kind).toBe("must");
    expect(r.question?.answer).toMatchObject({ choice: "keep", note: "It matters." });
    expect(r.question?.answer?.at).toBeTruthy();
    expect(r.pool).toEqual(target.pool); // numbers stay until matching recomputes
    const events = await listAudit(t.db, { subjectType: "need_card", subjectId: card.id });
    expect(events.map((e) => e.action).sort()).toEqual(["needcard.edited", "needcard.question_answered"]);
    expect(events.every((e) => e.actor === `company:${co.id}`)).toBe(true);
    expect(JSON.stringify(events.map((e) => e.detail))).not.toContain("It matters"); // ids and counts only
    expect(await queued(t.db, "matching.need_changed")).toContainEqual({ needCardId: card.id, version: 2 });
    // stored row follows
    const row = await version(card);
    expect(row.version).toBe(2);
  });

  it("make_nice changes the kind; remove deletes the requirement; reworded replaces the text and maps ESCO again", async () => {
    await addEscoSkill(t.db, "http://esco/teamwork", "Teamwork principles");
    const a = await scenario();
    const niced = await answerQuestion(t.db, a.card.id, a.co.id, { requirementId: req(a.card, "Team player").id, choice: "make_nice" });
    expect(req(niced, "Team player").kind).toBe("nice");
    expect(req(niced, "Team player").question?.answer?.choice).toBe("make_nice");

    const b = await scenario();
    const removed = await answerQuestion(t.db, b.card.id, b.co.id, { requirementId: req(b.card, "Team player").id, choice: "remove" });
    expect(removed.requirements.map((r) => r.text)).not.toContain("Team player");
    expect(removed.requirements).toHaveLength(b.card.requirements.length - 1);

    const c = await scenario();
    const reworded = await answerQuestion(t.db, c.card.id, c.co.id, {
      requirementId: req(c.card, "Team player").id,
      choice: "reworded",
      text: "  Works well in a small team  ",
    });
    const r = req(reworded, "Works well");
    expect(r.text).toBe("Works well in a small team");
    expect(r.pool).toBeNull(); // old numbers described the old wording
    expect(r.question?.answer?.choice).toBe("reworded");
  });

  it("reworded: a skill is mapped to ESCO again by trigram", async () => {
    await addEscoSkill(t.db, "http://esco/terraform", "Terraform");
    const jobId = await addJobRow(t.db, { sentences: ["x"] });
    const co = await addCompany(t.db);
    const card = await makeCard(t.db, {
      jobId,
      companyId: co.id,
      requirements: [
        {
          text: "Tool X",
          category: "skill",
          escoSkillUris: ["http://esco/old"],
          question: { type: "tool", text: "Would experience with a comparable tool be enough, if the person learns Tool X on the job?", why: "w", answer: null },
          pool: { ...POOL },
        },
      ],
    });
    const saved = await answerQuestion(t.db, card.id, co.id, { requirementId: card.requirements[0]!.id, choice: "reworded", text: "Terraform" });
    expect(saved.requirements[0]!.escoSkillUris).toEqual(["http://esco/terraform"]);
  });

  it("rejects protected wording with a hint, and saves nothing (N12)", async () => {
    const { co, card } = await scenario();
    const target = req(card, "Team player");
    const err = await answerQuestion(t.db, card.id, co.id, { requirementId: target.id, choice: "reworded", text: "native Finnish speaker" }).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(422);
    expect(err.code).toBe("protected_text_native");
    expect(err.message).toContain("Try 'fluent working Finnish'.");
    const plain = await answerQuestion(t.db, card.id, co.id, { requirementId: target.id, choice: "reworded", text: "Young and energetic" }).catch((e) => e);
    expect(plain.code).toBe("protected_text");
    const stored = await version(card);
    expect(stored.version).toBe(1);
    expect(req(stored, "Team player").question?.answer).toBeNull();
    expect(await listAudit(t.db, { subjectType: "need_card", subjectId: card.id })).toEqual([]);
    await expect(answerQuestion(t.db, card.id, co.id, { requirementId: target.id, choice: "reworded", text: "   " })).rejects.toMatchObject({ code: "text_required" });
    await expect(answerQuestion(t.db, card.id, co.id, { requirementId: target.id, choice: "reworded", text: "x".repeat(81) })).rejects.toMatchObject({ code: "text_too_long" });
  });

  it("refuses a second answer, a hidden question, a statutory one, another company's card and a stale card", async () => {
    const { co, card } = await scenario();
    const target = req(card, "Team player");
    await answerQuestion(t.db, card.id, co.id, { requirementId: target.id, choice: "keep" });
    await expect(answerQuestion(t.db, card.id, co.id, { requirementId: target.id, choice: "keep" })).rejects.toMatchObject({ status: 409, code: "already_answered" });
    await expect(answerQuestion(t.db, card.id, co.id, { requirementId: req(card, "Calm").id, choice: "keep" })).rejects.toMatchObject({ status: 404 });
    await expect(answerQuestion(t.db, card.id, co.id, { requirementId: req(card, "Security").id, choice: "keep" })).rejects.toMatchObject({ status: 404 });
    await expect(answerQuestion(t.db, card.id, co.id, { requirementId: "req_missing", choice: "keep" })).rejects.toMatchObject({ status: 404 });
    const other = await scenario();
    await expect(answerQuestion(t.db, card.id, other.co.id, { requirementId: target.id, choice: "keep" })).rejects.toMatchObject({ status: 404 });
    const stale = await scenario();
    const { needCard } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await t.db.update(needCard).set({ body: { ...stale.card, status: "stale" }, status: "stale" }).where(eq(needCard.id, stale.card.id));
    await expect(answerQuestion(t.db, stale.card.id, stale.co.id, { requirementId: req(stale.card, "Team player").id, choice: "keep" })).rejects.toMatchObject({ status: 409, code: "stale" });
    await expect(confirmNeedCard(t.db, stale.card.id, stale.co.id)).rejects.toMatchObject({ status: 409 });
  });

  it("validates the request body shape", () => {
    expect(AnswerInput.safeParse({ requirementId: "r", choice: "nope" }).success).toBe(false);
    expect(AnswerInput.safeParse({ requirementId: "r", choice: "keep" }).success).toBe(true);
  });
});

describe("confirming", () => {
  it("N13: sets confirmed and confirmedAt, bumps the version, audits as the company; unanswered questions do not block", async () => {
    const { co, card } = await scenario();
    const now = new Date("2026-11-14T09:00:00Z");
    const saved = await confirmNeedCard(t.db, card.id, co.id, now);
    expect(saved.status).toBe("confirmed");
    expect(saved.confirmedAt).toBe(now.toISOString());
    expect(saved.version).toBe(2);
    expect(req(saved, "Team player").question?.answer).toBeNull();
    const events = await listAudit(t.db, { subjectType: "need_card", subjectId: card.id });
    expect(events.map((e) => [e.action, e.actor])).toEqual([["needcard.confirmed", `company:${co.id}`]]);
    expect(await queued(t.db, "matching.need_changed")).toContainEqual({ needCardId: card.id, version: 2 });
    // confirming again changes nothing
    const again = await confirmNeedCard(t.db, card.id, co.id);
    expect(again.version).toBe(2);
    expect(await listAudit(t.db, { subjectType: "need_card", subjectId: card.id })).toHaveLength(1);
    // another company cannot confirm it
    const other = await scenario();
    await expect(confirmNeedCard(t.db, card.id, other.co.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("the page", () => {
  it("renders the banner, requirements, exact pool wording and test ids in all three languages", async () => {
    const { co, card } = await scenario();
    const view = await companyNeedView(t.db, card.id, co.token);
    const expectations = {
      en: {
        normal: "6 of 10",
        wording: "people in the pool whose cards relate to this role speak to this. A hard filter on it would set aside",
        notLack: "that does not mean they lack it. No filter is applied.",
        statutory: "Set by law or regulation. Not questioned here; the employer checks it at hiring.",
        statutoryPool: "6 of 10",
        banner: "Demo company 07.",
      },
      fi: { normal: "6/10", wording: "Tiukka suodatin sulkisi pois", notLack: "se ei tarkoita, ettei heillä sitä ole. Suodatinta ei käytetä.", statutory: "Laissa tai määräyksissä säädetty. Siitä ei kysytä tässä", statutoryPool: "6/10", banner: "Demo company 07." },
      sv: { normal: "6 av 10", wording: "Ett strikt filter skulle sålla bort", notLack: "det betyder inte att de saknar det. Inget filter tillämpas.", statutory: "Fastställt i lag eller föreskrift. Vi frågar inte om det här", statutoryPool: "6 av 10", banner: "Demo company 07." },
    } as const;
    for (const lang of UI_LANGS) {
      const html = renderToStaticMarkup(createElement(NeedCardPageView, { view, m: needMessages[lang], lang, token: co.token }));
      const e = expectations[lang];
      expect(html).toContain('data-testid="masked-banner"');
      expect(html).toContain(e.banner);
      expect(html).toContain('data-testid="need-title"');
      expect((html.match(/data-testid="requirement"/g) ?? []).length).toBe(5);
      expect(html).toContain(`data-requirement-id="${view.requirements[0]!.id}"`);
      expect(html).toContain('data-testid="requirement-question"');
      expect(html).toContain('data-testid="question-answer-keep"');
      expect(html).toContain('data-testid="question-answer-make_nice"');
      expect(html).toContain('data-testid="pool-evidence"');
      expect(html).toContain('data-testid="confirm-need"');
      expect(html).toContain('data-testid="posting-sentence"');
      expect(html).toContain("<strong>" + e.normal + "</strong>");
      expect(html).toContain(e.wording);
      expect(html).toContain(e.notLack);
      expect(html).toContain(e.statutory);
      expect(html).not.toContain(REAL);
      expect(html).not.toContain("Testiyhtiö");
      expect(html).not.toMatch(/undefined|\{speakTo\}|\{relevant\}|\{exclude\}/);
    }
    // statutory: no exclusion wording next to the legal duty (N4)
    const en = renderToStaticMarkup(createElement(NeedCardPageView, { view, m: needMessages.en, lang: "en", token: co.token }));
    const clearanceItem = en.split('data-testid="requirement"').find((s) => s.includes("Security clearance"))!;
    expect(clearanceItem).toContain("Set by law or regulation; the employer checks it at hiring.");
    expect(clearanceItem).not.toContain("hard filter");
    expect(clearanceItem).not.toContain("set aside");
    expect(clearanceItem).not.toContain('data-testid="requirement-question"');
    // the question that is not shown is not in the page at all
    expect(en).not.toContain("'calm'");
    // as-of time
    expect(en).toContain("as of");
  });

  it("words the whole-pool and language cases exactly, and the empty pool", async () => {
    const jobId = await addJobRow(t.db, { sentences: ["x"] });
    const co = await addCompany(t.db);
    const card = await makeCard(t.db, {
      jobId,
      companyId: co.id,
      requirements: [
        { text: "Fluent Finnish", category: "language", languageCode: "fi", pool: { scope: "relevant", relevant: 8, speakTo: 5, hardFilterWouldExclude: 3, selfDeclaredOnly: 2, computedAt: "2026-11-14T06:02:11Z" } },
        { text: "Kubernetes", pool: { scope: "whole_pool", relevant: 40, speakTo: 3, hardFilterWouldExclude: null, selfDeclaredOnly: null, computedAt: "2026-11-14T06:02:11Z" } },
        { text: "Rust", pool: { scope: "whole_pool", relevant: 0, speakTo: 0, hardFilterWouldExclude: null, selfDeclaredOnly: null, computedAt: "2026-11-14T06:02:11Z" } },
      ],
    });
    const view = await companyNeedView(t.db, card.id, co.token);
    const html = renderToStaticMarkup(createElement(NeedCardPageView, { view, m: needMessages.en, lang: "en", token: co.token }));
    const text = html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");
    expect(text).toContain("(2 of them by naming it as a work language.)");
    expect(text).toContain("Nobody in the pool relates to this role yet. Across the whole pool of 40, 3 speak to this requirement.");
    expect(html).toContain("<strong>3</strong>");
    expect(text).toContain("Nobody has joined the pool yet");
  });
});
