import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationEvent } from "@/contracts";
import { resetLlmState, setLlmFake } from "@/lib/llm";
import { createTestDb, type TestDb } from "../../../../tests/helpers/db";
import { addTalent, seedJob } from "@/features/application/test-support";

const h = vi.hoisted(() => ({ db: null as unknown, talentId: undefined as string | undefined }));
vi.mock("@/db/client", () => ({ getDb: () => h.db }));
vi.mock("@/lib/session", async () => {
  const { HttpError } = await import("@/lib/http");
  return {
    requireTalent: async () => {
      if (!h.talentId) throw new HttpError(401, "unauthenticated", "Sign in to continue");
      return h.talentId;
    },
  };
});
vi.mock("@/features/card", () => ({ getApprovedCard: async () => ({ approved: true }) }));
vi.mock("@/features/application/rank", () => ({
  applicationPoints: () => ({ points: 0, maxPoints: 0, mustAtExample: 0 }),
  ownPosition: async () => null,
}));

import { GET as listJobs } from "./jobs/route";
import { POST as start } from "./route";
import { DELETE as withdraw, GET as getOwn } from "./[id]/route";
import { POST as turn } from "./[id]/turn/route";
import { POST as skip } from "./[id]/skip/route";
import { POST as stop } from "./[id]/stop/route";
import { POST as remove } from "./[id]/remove/route";
import { POST as submit } from "./[id]/submit/route";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  h.db = t.db;
}, 120_000);
afterAll(() => t.close());
beforeEach(() => {
  h.talentId = undefined;
  setLlmFake((o) => {
    if (o.purpose === "application.plan") {
      const labels = [...o.messages[1]!.content.matchAll(/^\[(R\d+)\]/gm)];
      return { questions: labels.map((m) => ({ requirement: m[1], question: "Tell me about a time you did this at work. What did you do?" })) };
    }
    return { evidence: [1], concrete: true, missing: "none", followUp: null };
  });
});
afterEach(() => resetLlmState());

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const post = (path: string, body?: unknown) =>
  new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });

function frames(text: string): ApplicationEvent[] {
  return text
    .split("\n\n")
    .filter((f) => f.includes("data:"))
    .map((f) => ApplicationEvent.parse(JSON.parse(/^data: (.*)$/m.exec(f)![1]!)));
}

describe("application routes", () => {
  it("needs a signed-in person, and refuses a start without the consent", async () => {
    const { jobId } = await seedJob(t.db);
    expect((await listJobs(post("/api/application/jobs"), undefined as never)).status).toBe(401);
    expect((await start(post("/api/application", { jobId, uiLang: "en", consent: { assessment: true } }), undefined as never)).status).toBe(401);
    h.talentId = await addTalent(t.db);
    const refused = await start(post("/api/application", { jobId, uiLang: "en", consent: { assessment: false } }), undefined as never);
    expect(refused.status).toBe(400);
    const none = await start(post("/api/application", { jobId, uiLang: "en" }), undefined as never);
    expect(none.status).toBe(400);
  });

  it("runs a whole job interview through the routes", async () => {
    const { jobId } = await seedJob(t.db);
    h.talentId = await addTalent(t.db);
    const jobs = await (await listJobs(post("/api/application/jobs"), undefined as never)).json();
    expect(jobs.jobs.find((j: { jobId: string }) => j.jobId === jobId)).toMatchObject({ application: null });

    const res = await start(post("/api/application", { jobId, uiLang: "en", consent: { assessment: true } }), undefined as never);
    expect(res.status).toBe(200);
    const { applicationId, opening } = await res.json();
    expect(opening.kind).toBe("opening");
    const again = await start(post("/api/application", { jobId, uiLang: "en", consent: { assessment: true } }), undefined as never);
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("already_applied");

    const a1 = await turn(post(`/api/application/${applicationId}/turn`, { text: "I booked goods in SAP.", inputMode: "text", clientTurnId: "client-turn-aaaa" }), ctx(applicationId));
    expect(a1.headers.get("content-type")).toContain("text/event-stream");
    const ev = frames(await a1.text());
    expect(ev.map((e) => e.type)).toContain("turn.done");

    const s = await skip(post(`/api/application/${applicationId}/skip`), ctx(applicationId));
    expect(frames(await s.text()).map((e) => e.type)).toContain("turn.done");

    const stopped = await (await stop(post(`/api/application/${applicationId}/stop`), ctx(applicationId))).json();
    expect(stopped.turn.kind).toBe("closing");
    // the answer can no longer be given, but a retry of one already stored replays
    const late = await turn(post(`/api/application/${applicationId}/turn`, { text: "More.", inputMode: "text" }), ctx(applicationId));
    expect(late.status).toBe(409);
    const replay = await turn(post(`/api/application/${applicationId}/turn`, { text: "I booked goods in SAP.", inputMode: "text", clientTurnId: "client-turn-aaaa" }), ctx(applicationId));
    expect(frames(await replay.text()).map((e) => e.type)).toContain("turn.done");

    expect((await remove(post(`/api/application/${applicationId}/remove`, { turnIndex: 1 }), ctx(applicationId))).status).toBe(200);
    expect((await submit(post(`/api/application/${applicationId}/submit`), ctx(applicationId))).status).toBe(409); // nothing left to send
    const own = await (await getOwn(post(""), ctx(applicationId))).json();
    expect(own).toMatchObject({ status: "review", masked: true });
    expect(own.turns[1]).toMatchObject({ text: "" });

    expect((await withdraw(post(""), ctx(applicationId))).status).toBe(200);
    expect((await getOwn(post(""), ctx(applicationId))).status).toBe(404);
  });

  it("keeps one person's application from another", async () => {
    const { jobId } = await seedJob(t.db);
    h.talentId = await addTalent(t.db);
    const { applicationId } = await (await start(post("/api/application", { jobId, uiLang: "en", consent: { assessment: true } }), undefined as never)).json();
    h.talentId = await addTalent(t.db);
    expect((await getOwn(post(""), ctx(applicationId))).status).toBe(404);
    expect((await withdraw(post(""), ctx(applicationId))).status).toBe(404);
    expect((await turn(post(`/api/application/${applicationId}/turn`, { text: "Hi there.", inputMode: "text" }), ctx(applicationId))).status).toBe(404);
  });
});
