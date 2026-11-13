import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../../../../tests/helpers/db";
import { HttpError } from "@/lib/http";
import { setLlmFake } from "@/lib/llm";

let t: TestDb;
let organiser = false;

vi.mock("@/db/client", async (original) => ({
  ...(await original<typeof import("@/db/client")>()),
  getDb: () => t.db,
}));
vi.mock("@/lib/session", async (original) => ({
  ...(await original<typeof import("@/lib/session")>()),
  getSession: async () => ({ organiser }),
  requireOrganiser: async () => {
    if (!organiser) throw new HttpError(401, "unauthenticated", "Organiser sign-in required");
  },
}));

import { POST as draftPost } from "./draft/route";
import { GET as needGet } from "./[id]/route";
import { POST as answerPost } from "./[id]/answer/route";
import { POST as confirmPost } from "./[id]/confirm/route";
import { addCompany, addJobRow, draftOutput, makeCard } from "@/features/needs/test-helpers";
import { listAudit } from "@/lib/audit";

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());
beforeEach(() => {
  organiser = false;
});
afterEach(() => setLlmFake(null));

const REAL = "Kalle Kehitys Oy";
const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const draft = (req: Request) => draftPost(req, {} as never);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

async function card() {
  const jobId = await addJobRow(t.db, { employerName: REAL, sentences: [`${REAL} hakee tiimipelaajaa.`, "Edellytämme tiimipelaajaa."] });
  const co = await addCompany(t.db, { realName: REAL });
  const c = await makeCard(t.db, {
    jobId,
    companyId: co.id,
    requirements: [
      {
        text: "Team player",
        category: "other",
        postingSentence: 1,
        question: {
          type: "vague",
          text: "What does 'team player' look like in this job? One concrete example helps us find people who have done it.",
          why: "The posting does not say what this means in practice.",
          answer: null,
        },
        pool: { scope: "relevant", relevant: 9, speakTo: 4, hardFilterWouldExclude: 5, selfDeclaredOnly: null, computedAt: "2026-11-14T06:02:11Z" },
      },
    ],
  });
  return { jobId, co, card: c };
}

describe("POST /api/needs/draft", () => {
  it("lets the organiser draft a card, and refuses anyone else", async () => {
    const jobId = await addJobRow(t.db, { sentences: ["Edellytämme Pythonia."] });
    const co = await addCompany(t.db);
    setLlmFake(() => draftOutput("Python developer", [{ text: "Python", sentence: 0 }]));
    expect((await draft(json({ jobId, companyId: co.id }))).status).toBe(401);
    organiser = true;
    const res = await draft(json({ jobId, companyId: co.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ jobId, companyId: co.id, version: 1, status: "draft" });
    expect(body.requirements[0].text).toBe("Python");
    // a second press drafts again
    const again = await (await draft(json({ jobId, companyId: co.id }))).json();
    expect(again.version).toBe(2);
  });

  it("answers 400 for a bad body, 404 for an unknown posting or company, and 502 when the model fails", async () => {
    organiser = true;
    expect((await draft(json({}))).status).toBe(400);
    expect((await draft(json({ jobId: "job_missing" }))).status).toBe(404);
    const jobId = await addJobRow(t.db, { sentences: ["x"] });
    expect((await draft(json({ jobId, companyId: "co_missing" }))).status).toBe(404);
    setLlmFake(() => "garbage");
    const res = await draft(json({ jobId }));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("draft_failed");
  });
});

describe("GET /api/needs/[id]", () => {
  it("gives the company its masked view by token (header, bearer or query), never the real name", async () => {
    const { co, card: c } = await card();
    for (const req of [
      new Request("http://localhost/api", { headers: { "x-company-token": co.token } }),
      new Request("http://localhost/api", { headers: { authorization: `Bearer ${co.token}` } }),
      new Request(`http://localhost/api?token=${co.token}`),
    ]) {
      const res = await needGet(req, ctx(c.id));
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toContain(REAL);
      const body = JSON.parse(text);
      expect(body.company).toEqual({ displayName: "Demo company 07", masked: true });
      expect(body.requirements[0].postingSentence).toBe("Edellytämme tiimipelaajaa.");
      expect(body.requirements[0].question.type).toBe("vague");
    }
  });

  it("refuses without a link or organiser session, and for another company's link", async () => {
    const a = await card();
    const b = await card();
    expect((await needGet(new Request("http://localhost/api"), ctx(a.card.id))).status).toBe(401);
    expect((await needGet(new Request("http://localhost/api", { headers: { "x-company-token": "nope" } }), ctx(a.card.id))).status).toBe(401);
    expect((await needGet(new Request("http://localhost/api", { headers: { "x-company-token": b.co.token } }), ctx(a.card.id))).status).toBe(404);
  });

  it("gives the organiser the whole card", async () => {
    const { card: c } = await card();
    organiser = true;
    const res = await needGet(new Request("http://localhost/api"), ctx(c.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.needCard.id).toBe(c.id);
    expect(body.needCard.droppedSentences).toEqual([]);
    expect(body.visibleQuestionIds).toEqual([c.requirements[0]!.id]);
    expect((await needGet(new Request("http://localhost/api"), ctx("nc_missing"))).status).toBe(404);
  });
});

describe("POST /api/needs/[id]/answer and /confirm", () => {
  it("records an answer for the company and returns its new view", async () => {
    const { co, card: c } = await card();
    const requirementId = c.requirements[0]!.id;
    expect((await answerPost(json({ requirementId, choice: "keep" }), ctx(c.id))).status).toBe(401);
    expect((await answerPost(json({ requirementId, choice: "keep" }, { "x-company-token": "bad" }), ctx(c.id))).status).toBe(401);
    expect((await answerPost(json({ requirementId, choice: "maybe" }, { "x-company-token": co.token }), ctx(c.id))).status).toBe(400);
    const res = await answerPost(json({ requirementId, choice: "make_nice" }, { "x-company-token": co.token }), ctx(c.id));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(REAL);
    const body = JSON.parse(text);
    expect(body.version).toBe(2);
    expect(body.requirements[0].kind).toBe("nice");
    expect(body.requirements[0].question.answer.choice).toBe("make_nice");
    expect((await answerPost(json({ requirementId, choice: "keep" }, { "x-company-token": co.token }), ctx(c.id))).status).toBe(409);
    const events = await listAudit(t.db, { subjectType: "need_card", subjectId: c.id });
    expect(events.map((e) => e.action).sort()).toEqual(["needcard.edited", "needcard.question_answered"]);
  });

  it("maps a protected rewording to 422 with the code the page uses", async () => {
    const { co, card: c } = await card();
    const res = await answerPost(
      json({ requirementId: c.requirements[0]!.id, choice: "reworded", text: "native Finnish speaker" }, { "x-company-token": co.token }),
      ctx(c.id),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("protected_text_native");
  });

  it("confirms for the company, and not for an organiser session without a link", async () => {
    const { co, card: c } = await card();
    organiser = true;
    expect((await confirmPost(json({}), ctx(c.id))).status).toBe(401); // confirming is the company's act
    const res = await confirmPost(json({}, { "x-company-token": co.token }), ctx(c.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("confirmed");
    expect(body.version).toBe(2);
    expect(body.confirmedAt).toBeTruthy();
    const events = await listAudit(t.db, { subjectType: "need_card", subjectId: c.id });
    expect(events.map((e) => e.action)).toEqual(["needcard.confirmed"]);
    expect(events[0]!.actor).toBe(`company:${co.id}`);
  });
});
