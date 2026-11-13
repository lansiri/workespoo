import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { resetLlmState, setLlmFake } from "@/lib/llm";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { settleInterview, startInterview, submitTurn } from "./index";
import { listRecentInterviews, loadInterviewView } from "./views";

vi.mock("@/features/card", () => ({ synthesiseCard: async () => ({ talentId: "x", version: 1, fallback: false }) }));

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());
afterEach(() => resetLlmState());

describe("interview read models", () => {
  it("the page view holds the transcript, public signals and coverage; the list holds counts only", async () => {
    setLlmFake((o) =>
      o.purpose === "interview.live"
        ? "Thanks. Could you describe one task you handled yourself?"
        : { lang: "en", signals: [{ ref: "new", phrase: "Receiving goods", kind: "skill", evidence: ["T1.S1"], hasExample: false }], coverage: { recent_work: "covered" }, flags: [], note: "" },
    );
    const { interviewId } = await startInterview(t.db, { mode: "express", uiLang: "fi", consent: { interview: true, voiceVendor: false, liveDemo: false } });
    for await (const _ of submitTurn(t.db, interviewId, { text: "Otin vastaan tavaroita logistiikkakeskuksessa.", inputMode: "voice" })) void _;
    await settleInterview(t.db, interviewId);

    const view = (await loadInterviewView(t.db, interviewId))!;
    expect(view.mode).toBe("express");
    expect(view.uiLang).toBe("fi");
    expect(view.ended).toBe(false);
    expect(view.transcript.map((l) => [l.index, l.role])).toEqual([[0, "interviewer"], [1, "participant"], [2, "interviewer"]]);
    expect(view.signals).toHaveLength(1);
    expect(view.signals[0]).not.toHaveProperty("hasExample");
    expect(view.coverage.recent_work).toBe("covered");

    const list = await listRecentInterviews(t.db);
    const item = list.find((i) => i.id === interviewId)!;
    expect(item).toMatchObject({ mode: "express", status: "active", questionsAsked: 2, signalCount: 1 });
    expect(item.topicsTouched).toBeGreaterThanOrEqual(2);
    expect(Object.keys(item).sort()).toEqual(["id", "mode", "questionsAsked", "signalCount", "startedAt", "status", "topicsTotal", "topicsTouched"]);
    expect(await loadInterviewView(t.db, "int_missing")).toBeNull();
  });
});
