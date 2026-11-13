import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { InterviewEvent } from "@/contracts";
import { resetLlmState, setLlmFake } from "@/lib/llm";
import { settleInterview } from "@/features/interview";
import { createTestDb, type TestDb } from "../../../../tests/helpers/db";

const h = vi.hoisted(() => ({ db: null as unknown, talentId: undefined as string | undefined }));
vi.mock("@/db/client", () => ({ getDb: () => h.db }));
vi.mock("@/lib/session", async () => {
  const { HttpError } = await import("@/lib/http");
  return {
    requireTalent: async () => {
      if (!h.talentId) throw new HttpError(401, "unauthenticated", "Sign in to continue");
      return h.talentId;
    },
    setTalentSession: async (id: string) => {
      h.talentId = id;
    },
  };
});
vi.mock("@/features/card", () => ({
  synthesiseCard: async () => ({ talentId: "x", version: 1, fallback: false }),
}));

import { POST as start } from "./route";
import { POST as turn } from "./[id]/turn/route";
import { GET as events } from "./[id]/events/route";
import { POST as remove } from "./[id]/remove/route";
import { POST as stop } from "./[id]/stop/route";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  h.db = t.db;
});
afterAll(() => t.close());
beforeEach(() => {
  h.talentId = undefined;
  let extractions = 0;
  setLlmFake((o) => {
    if (o.purpose === "interview.live") return "Thanks. Which tools do you use in that work?";
    const labels = [...o.messages[1]!.content.matchAll(/\[T(\d+)\.S1\]/g)];
    return {
      lang: "en",
      signals: [{ ref: "new", phrase: `Skill number ${++extractions}`, kind: "skill", evidence: [`T${labels.at(-1)![1]}.S1`], hasExample: false }],
      coverage: {},
      flags: [],
      note: "",
    };
  });
});
afterEach(() => resetLlmState());

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

function frames(text: string): { id?: number; event: InterviewEvent }[] {
  return text
    .split("\n\n")
    .filter((f) => f.includes("data:"))
    .map((f) => ({
      id: /^id: (\d+)$/m.exec(f)?.[1] ? Number(/^id: (\d+)$/m.exec(f)![1]) : undefined,
      event: InterviewEvent.parse(JSON.parse(/^data: (.*)$/m.exec(f)![1]!)),
    }));
}

const START = { mode: "express", uiLang: "en", consent: { interview: true, voiceVendor: false, liveDemo: true } };

describe("interview routes", () => {
  it("POST /api/interview starts an interview and sets the talent session", async () => {
    const res = await start(post("/api/interview", START), undefined as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.opening.kind).toBe("opening");
    expect(h.talentId).toBe(body.talentId);
  });

  it("rejects a start without consent and a malformed body", async () => {
    const noConsent = await start(post("/api/interview", { ...START, consent: { ...START.consent, interview: false } }), undefined as never);
    expect(noConsent.status).toBe(400);
    const noDemo = await start(post("/api/interview", { ...START, consent: { ...START.consent, liveDemo: false } }), undefined as never);
    expect(noDemo.status).toBe(400);
    expect(h.talentId).toBeUndefined();
    const junk = await start(post("/api/interview", { nope: 1 }), undefined as never);
    expect(junk.status).toBe(400);
  });

  it("runs a turn as server-sent events, then serves the background events with ids and honours Last-Event-ID", async () => {
    const { interviewId } = await (await start(post("/api/interview", START), undefined as never)).json();

    const res = await turn(post(`/api/interview/${interviewId}/turn`, { text: "I worked at a logistics centre receiving goods.", inputMode: "text", clientTurnId: "client-abc" }), ctx(interviewId));
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const turnEvents = frames(await res.text()).map((f) => f.event);
    expect(turnEvents.map((e) => e.type)).toEqual(["turn.delta", "turn.delta", "turn.done"]);
    expect(turnEvents.at(-1)).toMatchObject({ kind: "question", closing: false });
    await settleInterview(t.db, interviewId);

    async function readUntil(request: Request, until: (e: InterviewEvent) => boolean) {
      const res = await events(request, ctx(interviewId));
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (frames(buffer).some((f) => until(f.event))) break;
      }
      await reader.cancel();
      return frames(buffer);
    }
    const get = (headers: Record<string, string> = {}) => new Request(`http://localhost/api/interview/${interviewId}/events`, { headers });

    const all = await readUntil(get(), (e) => e.type === "signal.proposed");
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((f) => typeof f.id === "number")).toBe(true);
    expect(all.map((f) => f.event.type)).toContain("signal.proposed");

    const lastId = Math.max(...all.map((f) => f.id!));
    // Add another event after the last one the client saw, then reconnect with Last-Event-ID.
    await turn(post(`/api/interview/${interviewId}/turn`, { text: "A truck came with the wrong pallets and I checked each.", inputMode: "text" }), ctx(interviewId)).then((r) => r.text());
    await settleInterview(t.db, interviewId);
    const resumed = await readUntil(get({ "last-event-id": String(lastId) }), (e) => e.type === "signal.proposed");
    expect(resumed.every((f) => f.id! > lastId)).toBe(true);
    expect(resumed.some((f) => f.event.type === "signal.proposed")).toBe(true);
  });

  it("refuses without a session (401), for another person's interview (403), and for an unknown one (404)", async () => {
    const { interviewId } = await (await start(post("/api/interview", START), undefined as never)).json();
    const mine = h.talentId;
    h.talentId = undefined;
    expect((await turn(post(`/api/interview/${interviewId}/turn`, { text: "hi", inputMode: "text" }), ctx(interviewId))).status).toBe(401);
    expect((await events(new Request("http://localhost/x"), ctx(interviewId))).status).toBe(401);
    h.talentId = "tal_someoneelse";
    expect((await turn(post(`/api/interview/${interviewId}/turn`, { text: "hi", inputMode: "text" }), ctx(interviewId))).status).toBe(403);
    expect((await stop(post(`/api/interview/${interviewId}/stop`, {}), ctx(interviewId))).status).toBe(403);
    h.talentId = mine;
    expect((await turn(post("/api/interview/int_missing/turn", { text: "hi", inputMode: "text" }), ctx("int_missing"))).status).toBe(404);
    expect((await turn(post(`/api/interview/${interviewId}/turn`, { text: "", inputMode: "text" }), ctx(interviewId))).status).toBe(400);
  });

  it("POST remove redacts one of the person's answers and replies with the confirmation and the same question again", async () => {
    const { interviewId } = await (await start(post("/api/interview", START), undefined as never)).json();
    await (await turn(post(`/api/interview/${interviewId}/turn`, { text: "I worked at a logistics centre receiving goods.", inputMode: "text" }), ctx(interviewId))).text();
    await settleInterview(t.db, interviewId);
    const res = await remove(post(`/api/interview/${interviewId}/remove`, { turnIndex: 1 }), ctx(interviewId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text.startsWith("Done, I've removed your last answer.")).toBe(true);
    expect((await remove(post(`/api/interview/${interviewId}/remove`, { turnIndex: 1 }), ctx(interviewId))).status).toBe(404);
    expect((await remove(post(`/api/interview/${interviewId}/remove`, { turnIndex: "x" }), ctx(interviewId))).status).toBe(400);
    const mine = h.talentId;
    h.talentId = "tal_someoneelse";
    expect((await remove(post(`/api/interview/${interviewId}/remove`, { turnIndex: 1 }), ctx(interviewId))).status).toBe(403);
    h.talentId = undefined;
    expect((await remove(post(`/api/interview/${interviewId}/remove`, { turnIndex: 1 }), ctx(interviewId))).status).toBe(401);
    h.talentId = mine;
    await settleInterview(t.db, interviewId);
  });

  it("stop ends the interview, and a turn after it is refused with 409", async () => {
    const { interviewId } = await (await start(post("/api/interview", START), undefined as never)).json();
    expect((await stop(post(`/api/interview/${interviewId}/stop`, {}), ctx(interviewId))).status).toBe(200);
    await settleInterview(t.db, interviewId);
    const late = await turn(post(`/api/interview/${interviewId}/turn`, { text: "wait", inputMode: "text" }), ctx(interviewId));
    expect(late.status).toBe(409);
    expect((await late.json()).error.code).toBe("interview_closed");
    const again = await stop(post(`/api/interview/${interviewId}/stop`, {}), ctx(interviewId));
    expect(again.status).toBe(200);
  });

  it("a retry of the answer that triggered the closing replays the closing line instead of 409, and the line is on the events stream", async () => {
    const { interviewId } = await (await start(post("/api/interview", START), undefined as never)).json();
    const answers = ["I worked at a logistics centre receiving goods.", "I used a scanner and a forklift every day.", "I work with drivers and the warehouse team."];
    let last: InterviewEvent[] = [];
    for (const [i, text] of answers.entries()) {
      const res = await turn(post(`/api/interview/${interviewId}/turn`, { text, inputMode: "text", clientTurnId: `client-key-${i}` }), ctx(interviewId));
      last = frames(await res.text()).map((f) => f.event);
    }
    const done = last.find((e) => e.type === "turn.done");
    expect(done).toMatchObject({ kind: "closing", closing: true });
    const retry = await turn(post(`/api/interview/${interviewId}/turn`, { text: answers[2], inputMode: "text", clientTurnId: "client-key-2" }), ctx(interviewId));
    expect(retry.status).toBe(200);
    expect(frames(await retry.text()).map((f) => f.event).find((e) => e.type === "turn.done")).toEqual(done);
    // A genuinely new answer is still refused.
    const fresh = await turn(post(`/api/interview/${interviewId}/turn`, { text: "More", inputMode: "text", clientTurnId: "client-key-new" }), ctx(interviewId));
    expect(fresh.status).toBe(409);
    await settleInterview(t.db, interviewId);
  });
});
