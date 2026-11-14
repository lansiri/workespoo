import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { ApplicationEvent, ApplicationTurnRequest, StartApplicationRequest } from "@/contracts";
import { applicantRanking, application, applicationTurn, consent, jobQueue } from "@/db/schema";
import { listAudit } from "@/lib/audit";
import { hasConsent } from "@/lib/consent";
import { resetLlmState, setLlmFake, type LlmOptions } from "@/lib/llm";
import { ASSESS_QUEUE_DELAY_MS } from "./jobs";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";

const h = vi.hoisted(() => ({ approved: new Set<string>(), sessionTalent: undefined as string | undefined }));
vi.mock("@/features/card", () => ({ getApprovedCard: async (_db: unknown, id: string) => (h.approved.has(id) ? { approved: true } : null) }));
vi.mock("@/lib/session", async () => {
  const { HttpError } = await import("@/lib/http");
  return {
    requireTalent: async () => {
      if (!h.sessionTalent) throw new HttpError(401, "unauthenticated", "Sign in to continue");
      return h.sessionTalent;
    },
  };
});
vi.mock("./rank", () => ({
  applicationPoints: (ratings: Array<{ level: number }>) => ({ points: ratings.reduce((n, r) => n + r.level, 0), maxPoints: ratings.length * 3, mustAtExample: 0 }),
  ownPosition: async () => null,
}));

import {
  exportApplications,
  loadOwnApplication,
  removeApplicationAnswer,
  requireOwnApplication,
  skipApplicationQuestion,
  startApplication,
  stopApplicationInterview,
  submitApplication,
  submitApplicationTurn,
  withdrawApplication,
} from "./engine";
import { followUpProblem, questionProblem, TURN_SYSTEM } from "./prompts-interview";
import { loadApp, loadTurns } from "./engine-store";
import { APPLICATION_LINES } from "./lines";
import { addTalent, EMPLOYER, seedJob } from "./test-support";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
}, 120_000);
afterAll(() => t.close());

type Model = {
  plan?: (o: LlmOptions) => unknown;
  turn?: (o: LlmOptions, n: number) => unknown;
};
let calls: { plan: LlmOptions[]; turn: LlmOptions[] };

/** A model whose questions mention each requirement's text and whose turn reading is set per test. */
function installModel(model: Model = {}) {
  calls = { plan: [], turn: [] };
  setLlmFake((o) => {
    if (o.purpose === "application.plan") {
      calls.plan.push(o);
      if (model.plan) return model.plan(o) as object;
      const labels = [...o.messages[1]!.content.matchAll(/^\[(R\d+)\] \((?:must-have|nice-to-have)\) (.*)$/gm)];
      return { questions: labels.map((m) => ({ requirement: m[1], question: `Tell me about a time you worked on this: ${m[2]}. What did you do yourself?` })) };
    }
    if (o.purpose === "application.turn") {
      calls.turn.push(o);
      if (model.turn) return model.turn(o, calls.turn.length) as object;
      return { evidence: [1], concrete: true, missing: "none", followUp: null };
    }
    throw new Error(`unexpected purpose ${o.purpose}`);
  });
}

beforeEach(() => {
  h.approved.clear();
  h.sessionTalent = undefined;
  installModel();
});
afterEach(() => resetLlmState());

const startRequest = (jobId: string, over: Partial<StartApplicationRequest> = {}): StartApplicationRequest => ({
  jobId,
  uiLang: "en",
  consent: { assessment: true },
  ...over,
});

async function person() {
  const id = await addTalent(t.db);
  h.approved.add(id);
  return id;
}

async function begin(over: Parameters<typeof seedJob>[1] = {}) {
  const seeded = await seedJob(t.db, over);
  const talentId = await person();
  const started = await startApplication(t.db, talentId, startRequest(seeded.jobId));
  return { ...seeded, talentId, applicationId: started.applicationId, opening: started.opening };
}

async function run(gen: AsyncGenerator<ApplicationEvent, void, void>) {
  const events: ApplicationEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

const answer = (applicationId: string, text: string, clientTurnId?: string) =>
  run(submitApplicationTurn(t.db, applicationId, { text, inputMode: "text", clientTurnId } satisfies ApplicationTurnRequest));

const done = (events: ApplicationEvent[]) => events.find((e) => e.type === "turn.done") as Extract<ApplicationEvent, { type: "turn.done" }>;
const lineOf = (events: ApplicationEvent[]) => events.filter((e) => e.type === "turn.delta").map((e) => (e as { text: string }).text).join(" ");

/** Progress per requirement in the plan's order. */
const progressOf = (app: NonNullable<Awaited<ReturnType<typeof loadApp>>>) => app.plan.requirements.map((r) => app.state.progress[r.requirementId]);

const CONCRETE = { evidence: [1], concrete: true, missing: "none", followUp: null };

describe("startApplication", () => {
  it("refuses without the consent, without an approved card and for an unknown job, and stores nothing", async () => {
    const { jobId } = await seedJob(t.db);
    const talentId = await addTalent(t.db);
    await expect(startApplication(t.db, talentId, { ...startRequest(jobId), consent: { assessment: false as never } })).rejects.toMatchObject({ status: 400 });
    await expect(startApplication(t.db, talentId, startRequest(jobId))).rejects.toMatchObject({ status: 409, code: "no_approved_card" });
    h.approved.add(talentId);
    await expect(startApplication(t.db, talentId, startRequest("job_nope00000001"))).rejects.toMatchObject({ status: 404, code: "unknown_job" });
    expect(await t.db.select().from(application).where(eq(application.talentId, talentId))).toHaveLength(0);
    expect(await hasConsent(t.db, { subjectType: "talent", subjectId: talentId, kind: "job_assessment" })).toBe(false);
    expect(calls.plan).toHaveLength(0);
  });

  it("stores the plan, the opening turn, the consent and an audit event, and refuses a second application", async () => {
    const { applicationId, opening, talentId, jobId } = await begin();
    const app = (await loadApp(t.db, applicationId))!;
    expect(app.status).toBe("interviewing");
    // statutory and authorisation requirements are never asked; must-haves come first
    expect(app.plan.requirements.map((r) => r.text)).toEqual(["Booking goods in SAP", "Receiving deliveries", "Finnish at work"]);
    expect(app.state).toMatchObject({ cursor: 0, progress: { [app.plan.requirements[0]!.requirementId]: "asked" } });
    expect(progressOf(app)).toEqual(["asked", "waiting", "waiting"]);
    expect(opening).toMatchObject({ index: 0, role: "interviewer", kind: "opening", requirementId: app.plan.requirements[0]!.requirementId });
    expect(opening.text).toContain("3 things");
    expect(opening.text).toContain(app.plan.requirements[0]!.question);
    expect(await hasConsent(t.db, { subjectType: "talent", subjectId: talentId, kind: "job_assessment" })).toBe(true);
    const [event] = await listAudit(t.db, { action: "application.started" as never, subjectId: applicationId });
    expect(event?.detail).toEqual({ talentId, jobId });
    await expect(startApplication(t.db, talentId, startRequest(jobId))).rejects.toMatchObject({ status: 409, code: "already_applied" });
  });

  it("gives two applicants the same questions with one model call, and keeps the employer out of everything shown", async () => {
    const seeded = await seedJob(t.db);
    const a = await startApplication(t.db, await person(), startRequest(seeded.jobId));
    const b = await startApplication(t.db, await person(), startRequest(seeded.jobId));
    expect(calls.plan).toHaveLength(1);
    const planA = (await loadApp(t.db, a.applicationId))!.plan;
    const planB = (await loadApp(t.db, b.applicationId))!.plan;
    expect(planA.requirements.map((r) => r.question)).toEqual(planB.requirements.map((r) => r.question));
    expect(a.opening.text).toBe(b.opening.text);
    expect(JSON.stringify([planA, a.opening, calls.plan[0]!.messages])).not.toContain("Academic");
  });

  it("starts two applicants at the same moment with one model call and the same wording", async () => {
    const seeded = await seedJob(t.db);
    const [p1, p2] = [await person(), await person()];
    const [a, b] = await Promise.all([startApplication(t.db, p1, startRequest(seeded.jobId)), startApplication(t.db, p2, startRequest(seeded.jobId))]);
    expect(calls.plan).toHaveLength(1);
    expect(a.opening.text).toBe(b.opening.text);
  });

  it("replaces a question that names the employer, is protected, evaluative or not a question with the scripted one", async () => {
    installModel({
      plan: () => ({
        questions: [
          { requirement: "R1", question: `Tell me about your work at ${EMPLOYER} with SAP, please?` },
          { requirement: "R2", question: "How old are you and have you received deliveries?" },
          { requirement: "R3", question: "Describe how you used Finnish at work in your own words." },
        ],
      }),
    });
    const { applicationId } = await begin({ displayName: "Demo company 04" });
    const reqs = (await loadApp(t.db, applicationId))!.plan.requirements;
    expect(reqs.map((r) => r.wording)).toEqual(["code", "code", "model"]);
    expect(reqs[0]!.question).toBe(`The ad asks for this: Booking goods in SAP. Tell me about a time you did this yourself. What was the situation, and what did you do?`);
    expect(JSON.stringify(reqs)).not.toContain("Academic");
  });

  it("uses scripted questions for everyone when the call fails, and keeps that wording for the next person", async () => {
    installModel({ plan: () => { throw new Error("model down"); } });
    const seeded = await seedJob(t.db);
    const a = await startApplication(t.db, await person(), startRequest(seeded.jobId));
    expect((await loadApp(t.db, a.applicationId))!.plan.requirements.every((r) => r.wording === "code")).toBe(true);
    installModel();
    const b = await startApplication(t.db, await person(), startRequest(seeded.jobId));
    expect(calls.plan).toHaveLength(0);
    expect((await loadApp(t.db, b.applicationId))!.plan.requirements.map((r) => r.question)).toEqual(
      (await loadApp(t.db, a.applicationId))!.plan.requirements.map((r) => r.question),
    );
  });

  it("writes the scripted lines in the interview's language", async () => {
    const seeded = await seedJob(t.db);
    const talentId = await person();
    installModel({ plan: () => { throw new Error("down"); } });
    const { opening } = await startApplication(t.db, talentId, startRequest(seeded.jobId, { uiLang: "fi" }));
    expect(opening.text).toContain("Tämä haastattelu koskee yhtä työtä");
    expect(opening.text).toContain("Ilmoituksessa pyydetään tätä");
  });
});

describe("submitApplicationTurn", () => {
  it("stores the answer, notes the words, and asks the next question behind a bridge without commenting", async () => {
    const { applicationId } = await begin();
    const events = await answer(applicationId, "I booked goods in SAP every day. I fixed the stock counts.");
    expect(events.map((e) => e.type)).toEqual(["answer.stored", "requirement.noted", "turn.delta", "turn.delta", "turn.delta", "turn.done"]);
    const stored = events[0] as Extract<ApplicationEvent, { type: "answer.stored" }>;
    expect(stored.turn).toMatchObject({ index: 1, role: "participant", kind: "answer", inputMode: "text" });
    expect(stored.turn.sentences).toHaveLength(2);
    const noted = events[1] as Extract<ApplicationEvent, { type: "requirement.noted" }>;
    expect(noted.evidence).toEqual([{ turnIndex: 1, sentenceFrom: 1, sentenceTo: 1 }]);
    expect(noted.progress).toBe("answered");
    const turn = done(events);
    expect(turn.ended).toBe(false);
    expect(turn.turn).toMatchObject({ index: 2, kind: "question" });
    expect(turn.turn.text.startsWith("Next. ")).toBe(true);
    expect(lineOf(events)).toBe(turn.turn.text);
    const app = (await loadApp(t.db, applicationId))!;
    expect(app.state.cursor).toBe(1);
    expect(progressOf(app)).toEqual(["answered", "asked", "waiting"]);
    expect(app.state.noted[app.plan.requirements[0]!.requirementId]).toHaveLength(1);
    // the model was given the masked requirement and numbered sentences, and no person details
    const prompt = calls.turn[0]!.messages[1]!.content;
    expect(prompt).toContain("[S1] I booked goods in SAP every day.");
    expect(prompt).toContain("FOLLOW-UP ALREADY ASKED: no");
  });

  it("asks one follow-up when the answer is not concrete, never a second, and never when it was concrete", async () => {
    installModel({ turn: () => ({ evidence: [1], concrete: false, missing: "own_part", followUp: "What was your own part in booking those goods?" }) });
    const { applicationId } = await begin();
    const first = await answer(applicationId, "We always booked goods in SAP.");
    expect(done(first).turn).toMatchObject({ kind: "follow_up", text: "What was your own part in booking those goods?" });
    expect(requirementOf(first)).toBeDefined();
    const second = await answer(applicationId, "I did the bookings myself.");
    expect(done(second).turn.kind).toBe("question");
    expect(calls.turn[1]!.messages[1]!.content).toContain("FOLLOW-UP ALREADY ASKED: yes");
    const app = (await loadApp(t.db, applicationId))!;
    expect(Object.values(app.state.followUps)).toEqual([1]);

    installModel({ turn: () => ({ evidence: [1], concrete: true, missing: "own_part", followUp: "Could you say more about your part?" }) });
    const other = await begin();
    expect(done(await answer(other.applicationId, "I rebuilt the nightly import in SAP.")).turn.kind).toBe("question");
  });

  it("asks the scripted follow-up once when the model proposes none, and moves on when the person has not done it or the question fails a check", async () => {
    installModel({ turn: () => ({ evidence: [], concrete: false, missing: "example", followUp: null }) });
    const a = await begin();
    expect(done(await answer(a.applicationId, "I know SAP.")).turn.text).toBe(APPLICATION_LINES.en.followUp);

    installModel({ turn: () => ({ evidence: [], concrete: false, missing: "none", followUp: null }) });
    const b = await begin();
    expect(done(await answer(b.applicationId, "I have not done that.")).turn.kind).toBe("question");

    for (const bad of [
      "How did you balance that with your family at the time?", "Miten perheesi suhtautui vuorotyöhön?", "Hur påverkade det din familj?",
      "Which country did you grow up in?", "Where did you learn to speak Finnish at work?", "Missä opit suomen kielen?",
      "Tell me about your military service.", "Kerro varusmiespalveluksestasi.", "Do you have a criminal record?", "What was your salary in that job?",
      "Good, and what came of that change?", "Interesting. What was your own part in that?", "That sounds like a lot. What did you do yourself?",
      "Hyvä, mikä oli oma osuutesi siinä?", "Bra, vad blev resultatet av det?",
    ]) {
      expect(followUpProblem(bad, [])).not.toBeNull();
      expect(questionProblem(bad, [])).not.toBeNull();
    }
    for (const ok of ["What did you do yourself in that change?", "How have you used Finnish at work?"]) {
      expect(followUpProblem(ok, [])).toBeNull();
    }
    for (const bad of ["Great, how old were you then?", "Were you employed by Academic Work Finland Oy?", "Thanks, that was clear. Any example?"]) {
      installModel({ turn: () => ({ evidence: [1], concrete: false, missing: "example", followUp: bad }) });
      const c = await begin();
      expect(done(await answer(c.applicationId, "I used SAP.")).turn.kind).toBe("question");
    }
  });

  it("moves on without a follow-up and without notes when the model call fails", async () => {
    installModel({ turn: () => { throw new Error("late"); } });
    const { applicationId } = await begin();
    const events = await answer(applicationId, "I booked goods in SAP.");
    expect(events.map((e) => e.type)).not.toContain("requirement.noted");
    expect(done(events).turn.kind).toBe("question");
    const app = (await loadApp(t.db, applicationId))!;
    expect(app.state.noted).toEqual({});
    expect(progressOf(app)[0]).toBe("answered");
  });

  it("drops note numbers outside the answer and never notes a sentence with a protected detail", async () => {
    installModel({ turn: () => ({ evidence: [1, 2, 9], concrete: true, missing: "none", followUp: null }) });
    const { applicationId } = await begin();
    const events = await answer(applicationId, "I booked goods in SAP. I am a 45 years old mother of two.");
    const noted = events.find((e) => e.type === "requirement.noted") as Extract<ApplicationEvent, { type: "requirement.noted" }>;
    expect(noted.evidence).toEqual([{ turnIndex: 1, sentenceFrom: 1, sentenceTo: 1 }]);
  });

  it("closes after the last question: status review, the closing line, ended", async () => {
    const { applicationId } = await begin();
    await answer(applicationId, "I booked goods in SAP.");
    await answer(applicationId, "I received deliveries at the dock.");
    const last = await answer(applicationId, "I used Finnish with drivers every day.");
    expect(done(last)).toMatchObject({ ended: true, turn: { kind: "closing", requirementId: null, text: APPLICATION_LINES.en.closing } });
    const app = (await loadApp(t.db, applicationId))!;
    expect(app.status).toBe("review");
    expect(app.state.cursor).toBe(3);
    expect(progressOf(app)).toEqual(["answered", "answered", "answered"]);
    await expect(answer(applicationId, "More.")).rejects.toMatchObject({ status: 409 });
  });

  it("replays a retry with the same clientTurnId without storing a second answer or calling the model", async () => {
    const { applicationId } = await begin();
    const first = await answer(applicationId, "I booked goods in SAP.", "client-turn-0001");
    const calls0 = calls.turn.length;
    const again = await answer(applicationId, "I booked goods in SAP.", "client-turn-0001");
    expect(calls.turn).toHaveLength(calls0);
    expect(again.filter((e) => e.type !== "requirement.noted").map((e) => e.type)).toEqual(first.filter((e) => e.type !== "requirement.noted").map((e) => e.type));
    expect(done(again).turn).toEqual(done(first).turn);
    expect((await loadTurns(t.db, applicationId)).filter((x) => x.role === "participant")).toHaveLength(1);
  });

  it("makes the reply for a stored answer whose reply was lost", async () => {
    const { applicationId } = await begin();
    await answer(applicationId, "I booked goods in SAP.", "client-turn-0002");
    await t.db.delete(applicationTurn).where(eq(applicationTurn.index, 2));
    const events = await answer(applicationId, "I booked goods in SAP.", "client-turn-0002");
    expect(done(events).turn.index).toBe(2);
    expect((await loadTurns(t.db, applicationId)).filter((x) => x.role === "participant")).toHaveLength(1);
  });

  it("answers an empty answer with the repair line and keeps the question open; the third empty one in a row is a skip", async () => {
    const { applicationId } = await begin();
    const one = await answer(applicationId, "...");
    expect(done(one).turn).toMatchObject({ kind: "repair" });
    expect(calls.turn).toHaveLength(0);
    expect(((await loadApp(t.db, applicationId))!).state.cursor).toBe(0);
    await answer(applicationId, "um");
    const third = await answer(applicationId, "?");
    expect(done(third).turn.kind).toBe("question");
    const app = (await loadApp(t.db, applicationId))!;
    expect(app.state.progress[app.plan.requirements[0]!.requirementId]).toBe("skipped");
    expect(app.state.cursor).toBe(1);
  });

  it("treats skip, stop and delete commands without calling the model", async () => {
    const { applicationId } = await begin();
    expect(done(await answer(applicationId, "skip")).turn.kind).toBe("question");
    expect(calls.turn).toHaveLength(0);
    await answer(applicationId, "I received deliveries at the dock.");
    const stop = await answer(applicationId, "stop");
    expect(done(stop)).toMatchObject({ ended: true, turn: { kind: "closing", text: APPLICATION_LINES.en.closingStopped } });
    const app = (await loadApp(t.db, applicationId))!;
    expect(app.status).toBe("review");
    expect(progressOf(app)).toEqual(["skipped", "answered", "asked"]);
  });

  it("removes the previous answer on 'delete that' and asks its question again", async () => {
    const { applicationId } = await begin();
    await answer(applicationId, "I booked goods in SAP.");
    const events = await answer(applicationId, "delete that");
    const turn = done(events).turn;
    expect(turn.kind).toBe("question");
    expect(turn.requirementId).toBe((await loadApp(t.db, applicationId))!.plan.requirements[0]!.requirementId);
    expect(turn.text.startsWith("Done, I've removed that answer.")).toBe(true);
    const turns = await loadTurns(t.db, applicationId);
    expect(turns[1]).toMatchObject({ text: "", sentences: [] });
    expect(turns[1]!.removedAt).not.toBeNull();
    const app = (await loadApp(t.db, applicationId))!;
    expect(app.state.cursor).toBe(0);
    expect(progressOf(app)).toEqual(["asked", "waiting", "waiting"]);
    expect(app.state.noted).toEqual({});
    // with nothing to delete it is an empty answer
    const fresh = await begin();
    expect(done(await answer(fresh.applicationId, "delete that")).turn.kind).toBe("repair");
  });

  it("tells the model that 'missing' is none when the person has not done it, so the scripted follow-up is not asked", () => {
    expect(TURN_SYSTEM).toContain('"missing" is always "none"');
  });

  it("'delete that' only removes the previous turn when it was a live answer", async () => {
    const { applicationId } = await begin();
    await answer(applicationId, "I booked goods in SAP.");
    await answer(applicationId, "I received deliveries at the dock.");
    expect(done(await answer(applicationId, "delete that")).turn.kind).toBe("question");
    expect(done(await answer(applicationId, "delete that")).turn.kind).toBe("repair");
    const turns = await loadTurns(t.db, applicationId);
    expect(turns.filter((x) => x.removedAt)).toHaveLength(1);
    expect(turns[1]!.removedAt).toBeNull();
  });

  it("skip names the question it skips and is a no-op when that question is no longer current", async () => {
    const { applicationId } = await begin();
    const reqs = (await loadApp(t.db, applicationId))!.plan.requirements;
    await run(skipApplicationQuestion(t.db, applicationId, { requirementId: reqs[0]!.requirementId }));
    const again = await run(skipApplicationQuestion(t.db, applicationId, { requirementId: reqs[0]!.requirementId }));
    expect(again).toEqual([]);
    expect(progressOf((await loadApp(t.db, applicationId))!)).toEqual(["skipped", "asked", "waiting"]);
  });

  it("stores what is already there and stops quietly when the request is aborted", async () => {
    const { applicationId } = await begin();
    const ac = new AbortController();
    setLlmFake(() => {
      ac.abort();
      return CONCRETE;
    });
    const events: ApplicationEvent[] = [];
    for await (const e of submitApplicationTurn(t.db, applicationId, { text: "I booked goods in SAP.", inputMode: "voice" }, { signal: ac.signal })) events.push(e);
    expect(events.map((e) => e.type)).toEqual(["answer.stored"]);
    const turns = await loadTurns(t.db, applicationId);
    expect(turns).toHaveLength(2);
    expect(turns[1]!.inputMode).toBe("voice");
  });

  it("serialises two answers sent at the same moment", async () => {
    const { applicationId } = await begin();
    const [a, b] = await Promise.all([answer(applicationId, "I booked goods in SAP."), answer(applicationId, "I received deliveries at the dock.")]);
    expect(done(a).turn.index).toBe(2);
    expect(done(b).turn.index).toBe(4);
    expect((await loadApp(t.db, applicationId))!.state.cursor).toBe(2);
  });
});

function requirementOf(events: ApplicationEvent[]) {
  return events.find((e) => e.type === "requirement.noted");
}

describe("skip, stop, remove, submit, withdraw", () => {
  it("skips the current question and yields the next line like a turn", async () => {
    const { applicationId } = await begin();
    const events = await run(skipApplicationQuestion(t.db, applicationId));
    expect(events.map((e) => e.type)).not.toContain("answer.stored");
    expect(done(events).turn.kind).toBe("question");
    const app = (await loadApp(t.db, applicationId))!;
    expect(progressOf(app)).toEqual(["skipped", "asked", "waiting"]);
    await run(skipApplicationQuestion(t.db, applicationId));
    const last = await run(skipApplicationQuestion(t.db, applicationId));
    expect(done(last).ended).toBe(true);
    expect((await loadApp(t.db, applicationId))!.status).toBe("review");
  });

  it("stops: the closing after a stop is stored, the rest stays unanswered", async () => {
    const { applicationId } = await begin();
    const turn = await stopApplicationInterview(t.db, applicationId);
    expect(turn).toMatchObject({ kind: "closing", text: APPLICATION_LINES.en.closingStopped });
    const app = (await loadApp(t.db, applicationId))!;
    expect(app.status).toBe("review");
    await expect(stopApplicationInterview(t.db, applicationId)).rejects.toMatchObject({ status: 409 });
  });

  it("removes an answer: text blanked, notes dropped, the requirement counts as unanswered", async () => {
    const { applicationId } = await begin();
    await answer(applicationId, "I booked goods in SAP.");
    await removeApplicationAnswer(t.db, applicationId, 1);
    const turns = await loadTurns(t.db, applicationId);
    expect(turns[1]).toMatchObject({ text: "", sentences: [] });
    const app = (await loadApp(t.db, applicationId))!;
    expect(app.state.noted).toEqual({});
    expect(app.state.progress[app.plan.requirements[0]!.requirementId]).toBe("asked");
    await expect(removeApplicationAnswer(t.db, applicationId, 1)).rejects.toMatchObject({ status: 404 });
    await expect(removeApplicationAnswer(t.db, applicationId, 0)).rejects.toMatchObject({ status: 404 });
    await expect(removeApplicationAnswer(t.db, applicationId, 99)).rejects.toMatchObject({ status: 404 });
  });

  it("keeps a requirement answered when another answer of the person still speaks to it", async () => {
    installModel({ turn: (_o, n) => (n === 1 ? { evidence: [1], concrete: false, missing: "example", followUp: "Could you name one case you handled?" } : CONCRETE) });
    const { applicationId } = await begin();
    await answer(applicationId, "I used SAP.");
    await answer(applicationId, "I booked the Monday delivery myself.");
    await removeApplicationAnswer(t.db, applicationId, 1);
    const app = (await loadApp(t.db, applicationId))!;
    expect(app.state.progress[app.plan.requirements[0]!.requirementId]).toBe("answered");
    expect(app.state.noted[app.plan.requirements[0]!.requirementId]).toEqual([{ turnIndex: 3, sentenceFrom: 1, sentenceTo: 1 }]);
  });

  it("sends only from review with at least one answer, enqueues the assessment once and audits", async () => {
    const { applicationId, talentId } = await begin();
    await expect(submitApplication(t.db, applicationId)).rejects.toMatchObject({ status: 409 });
    await stopApplicationInterview(t.db, applicationId);
    await expect(submitApplication(t.db, applicationId)).rejects.toMatchObject({ status: 409, code: "no_answers" });

    const ok = await begin();
    await answer(ok.applicationId, "I booked goods in SAP.");
    await stopApplicationInterview(t.db, ok.applicationId);
    await submitApplication(t.db, ok.applicationId);
    const app = (await loadApp(t.db, ok.applicationId))!;
    expect(app.status).toBe("submitted");
    expect(app.submittedAt).not.toBeNull();
    const queued = await t.db.select().from(jobQueue).where(eq(jobQueue.dedupeKey, `application.assess:${ok.applicationId}`));
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ kind: "application.assess", payload: { applicationId: ok.applicationId } });
    // The queued rating is the safety net: it waits, because the sender starts the rating at once.
    expect(queued[0]!.runAfter.getTime() - app.submittedAt!.getTime()).toBe(ASSESS_QUEUE_DELAY_MS);
    const [event] = await listAudit(t.db, { action: "application.submitted" as never, subjectId: ok.applicationId });
    expect(event?.detail).toMatchObject({ talentId: ok.talentId });
    void talentId;
    // refused in every status but review
    await expect(submitApplication(t.db, ok.applicationId)).rejects.toMatchObject({ status: 409 });
    await expect(removeApplicationAnswer(t.db, ok.applicationId, 1)).rejects.toMatchObject({ status: 409 });
    await expect(stopApplicationInterview(t.db, ok.applicationId)).rejects.toMatchObject({ status: 409 });
    await expect(run(skipApplicationQuestion(t.db, ok.applicationId))).rejects.toMatchObject({ status: 409 });
    await expect(answer(ok.applicationId, "More.")).rejects.toMatchObject({ status: 409 });
  });

  it("withdraws in any status: the application and its turns are gone and withdrawal is audited", async () => {
    const { applicationId, talentId } = await begin();
    await answer(applicationId, "I booked goods in SAP.");
    await stopApplicationInterview(t.db, applicationId);
    await submitApplication(t.db, applicationId);
    const app0 = (await loadApp(t.db, applicationId))!;
    const published = {
      needCardVersion: 1, requirements: [], publishedAt: new Date().toISOString(),
      applicants: [{ applicationId, talentId, handle: "h", position: 1, points: 0, maxPoints: 0, moved: false, ratings: [], summary: { en: "", fi: "", sv: "" } }],
    };
    const pins = [{ applicationId, position: 1, reason: "because", at: new Date().toISOString() }];
    await t.db.insert(applicantRanking).values({ jobId: app0.jobId, companyId: app0.companyId, pins, published: published as never });
    await withdrawApplication(t.db, applicationId);
    const [ranking] = await t.db.select().from(applicantRanking).where(eq(applicantRanking.jobId, app0.jobId));
    expect(ranking!.pins).toEqual([]);
    expect(ranking!.published!.applicants).toEqual([]);
    expect(await loadApp(t.db, applicationId)).toBeNull();
    expect(await t.db.select().from(applicationTurn).where(eq(applicationTurn.applicationId, applicationId))).toHaveLength(0);
    const [event] = await listAudit(t.db, { action: "application.withdrawn" as never, subjectId: applicationId });
    expect(event?.detail).toMatchObject({ talentId });
    await expect(withdrawApplication(t.db, applicationId)).rejects.toMatchObject({ status: 404 });
    const fresh = await begin();
    await withdrawApplication(t.db, fresh.applicationId);
    expect(await loadApp(t.db, fresh.applicationId)).toBeNull();
  });
});

describe("reading", () => {
  it("lets only the owner read, through requireOwnApplication and loadOwnApplication", async () => {
    const { applicationId, talentId, jobId } = await begin();
    await expect(requireOwnApplication(t.db, applicationId)).rejects.toMatchObject({ status: 401 });
    h.sessionTalent = await person();
    await expect(requireOwnApplication(t.db, applicationId)).rejects.toMatchObject({ status: 404 });
    h.sessionTalent = talentId;
    expect(await requireOwnApplication(t.db, applicationId)).toBe(talentId);
    await expect(requireOwnApplication(t.db, "app_missing00001")).rejects.toMatchObject({ status: 404 });

    expect(await loadOwnApplication(t.db, "tal_other", applicationId)).toBeNull();
    const own = (await loadOwnApplication(t.db, talentId, applicationId))!;
    expect(own).toMatchObject({ id: applicationId, jobId, companyName: "Demo company 03", masked: true, status: "interviewing", assessment: null, points: null, position: null });
    expect(own.turns).toHaveLength(1);
    expect(JSON.stringify(own)).not.toContain("Academic");
    expect(JSON.stringify(own)).not.toContain("clientTurnId");
  });

  it("shows points once assessed, and exports the person's applications with removed answers as null", async () => {
    const { applicationId, talentId, card } = await begin();
    await answer(applicationId, "I booked goods in SAP.");
    await answer(applicationId, "I received deliveries.");
    await removeApplicationAnswer(t.db, applicationId, 3);
    const rid = card.requirements[0]!.id;
    await t.db
      .update(application)
      .set({
        status: "assessed",
        assessment: {
          rubricVersion: "x",
          ratings: [{ requirementId: rid, level: 2, evidence: [], reason: { en: "a", fi: "b", sv: "c" }, wording: "code" }],
          summary: { en: "a", fi: "b", sv: "c" },
          assessedAt: new Date().toISOString(),
        },
      })
      .where(eq(application.id, applicationId));
    expect((await loadOwnApplication(t.db, talentId, applicationId))!.points).toEqual({ points: 2, maxPoints: 3 });
    const exported = (await exportApplications(t.db, talentId)) as Array<{ turns: Array<{ index: number; text: string | null; removed: boolean }> }>;
    expect(exported).toHaveLength(1);
    expect(exported[0]!.turns.find((x) => x.index === 3)).toMatchObject({ text: null, removed: true });
    expect(exported[0]!.turns.find((x) => x.index === 1)!.text).toBe("I booked goods in SAP.");
    expect(await t.db.select().from(consent).where(eq(consent.subjectId, talentId))).not.toHaveLength(0);
  });
});
