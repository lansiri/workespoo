import { describe, expect, it, vi } from "vitest";
import type { ApplicationEvent, ApplicationTurn } from "@/contracts";
import { fetchOwnApplication, initialJobState, readApplicationSse, reduceJob, currentRequirementId, type JobInterviewInitial, type JobInterviewState } from "./useJobInterview";

const REQS = ["r1", "r2", "r3"];

function turn(over: Partial<ApplicationTurn> & Pick<ApplicationTurn, "index" | "role">): ApplicationTurn {
  return {
    id: `turn-${over.index}`,
    applicationId: "app-1",
    kind: over.role === "participant" ? "answer" : "question",
    requirementId: null,
    text: "",
    sentences: [],
    inputMode: null,
    removedAt: null,
    at: "2026-11-14T10:00:00Z",
    ...over,
  };
}

function initial(over: Partial<JobInterviewInitial> = {}): JobInterviewInitial {
  return {
    id: "app-1",
    status: "interviewing",
    plan: {
      needCardId: "nc-1",
      needCardVersion: 1,
      lang: "en",
      requirements: REQS.map((id, i) => ({
        requirementId: id,
        text: `Requirement ${i + 1}`,
        kind: i === 0 ? ("must" as const) : ("nice" as const),
        category: "skill" as const,
        postingSentence: null,
        question: `Tell me about requirement ${i + 1}, please.`,
        wording: "code" as const,
      })),
    },
    state: { cursor: 0, followUps: {}, progress: { r1: "asked", r2: "waiting", r3: "waiting" }, noted: {} },
    turns: [turn({ index: 0, role: "interviewer", kind: "opening", requirementId: "r1", text: "Hello. Tell me about requirement 1.", sentences: ["Hello.", "Tell me about requirement 1."] })],
    ...over,
  };
}

const run = (state: JobInterviewState, ...events: ApplicationEvent[]) => events.reduce((s, event) => reduceJob(s, { type: "event", event }), state);

describe("job interview reducer", () => {
  it("starts from the stored picture", () => {
    const s = initialJobState(initial());
    expect(s.order).toEqual(REQS);
    expect(s.cursor).toBe(0);
    expect(s.progress.r1).toBe("asked");
    expect(s.ended).toBe(false);
    expect(initialJobState(initial({ status: "review" })).ended).toBe(true);
  });

  it("collects the interviewer's line sentence by sentence and clears it when stored", () => {
    let s = initialJobState(initial());
    s = run(s, { type: "turn.delta", text: "Next." }, { type: "turn.delta", text: "Tell me about requirement 2." });
    expect(s.streaming).toBe("Next. Tell me about requirement 2.");
    s = run(s, {
      type: "turn.done",
      ended: false,
      turn: turn({ index: 2, role: "interviewer", requirementId: "r2", text: "Next. Tell me about requirement 2.", sentences: ["Next.", "Tell me about requirement 2."] }),
    });
    expect(s.streaming).toBeNull();
    expect(s.turns.map((t) => t.index)).toEqual([0, 2]);
  });

  it("shows the answer being sent and replaces it with the stored turn", () => {
    let s = initialJobState(initial());
    s = reduceJob(s, { type: "pending", pending: { text: "I did X.", inputMode: "text", clientTurnId: "abcdefgh" } });
    expect(s.pending?.text).toBe("I did X.");
    s = run(s, { type: "answer.stored", turn: turn({ index: 1, role: "participant", requirementId: "r1", text: "I did X.", sentences: ["I did X."], inputMode: "text" }) });
    expect(s.pending).toBeNull();
    expect(s.turns.map((t) => t.index)).toEqual([0, 1]);
    // replaying the same event changes nothing
    const again = run(s, { type: "answer.stored", turn: s.turns[1]! });
    expect(again.turns).toHaveLength(2);
  });

  it("keeps a failed answer for a retry and clears the failure when it is tried again", () => {
    let s = initialJobState(initial());
    const pending = { text: "I did X.", inputMode: "text" as const, clientTurnId: "abcdefgh" };
    s = reduceJob(s, { type: "pending", pending });
    s = reduceJob(s, { type: "sendFailed", value: true });
    expect(s.sendFailed).toBe(true);
    expect(s.pending).toEqual(pending);
    s = reduceJob(s, { type: "pending", pending }); // the retry: same id, same text
    expect(s.sendFailed).toBe(false);
    expect(s.pending?.clientTurnId).toBe("abcdefgh");
  });

  it("an error event marks the send as failed without losing the answer", () => {
    let s = reduceJob(initialJobState(initial()), { type: "pending", pending: { text: "A.", inputMode: "voice", clientTurnId: "abcdefgh" } });
    s = run(s, { type: "error", message: "slow", retryable: true });
    expect(s.sendFailed).toBe(true);
    expect(s.pending?.text).toBe("A.");
  });

  it("notes words for a requirement, merges repeats and sets the progress", () => {
    let s = initialJobState(initial());
    const ev: ApplicationEvent = { type: "requirement.noted", requirementId: "r1", evidence: [{ turnIndex: 1, sentenceFrom: 1, sentenceTo: 1 }], progress: "answered" };
    s = run(s, ev, ev, { type: "requirement.noted", requirementId: "r1", evidence: [{ turnIndex: 1, sentenceFrom: 2, sentenceTo: 2 }], progress: "answered" });
    expect(s.noted.r1).toEqual([
      { turnIndex: 1, sentenceFrom: 1, sentenceTo: 1 },
      { turnIndex: 1, sentenceFrom: 2, sentenceTo: 2 },
    ]);
    expect(s.progress.r1).toBe("answered");
  });

  it("the next question marks that requirement asked and earlier asked ones answered; the cursor follows", () => {
    let s = initialJobState(initial());
    s = run(s, { type: "turn.done", ended: false, turn: turn({ index: 2, role: "interviewer", requirementId: "r2", text: "Q2?" }) });
    expect(s.progress).toMatchObject({ r1: "answered", r2: "asked", r3: "waiting" });
    expect(s.cursor).toBe(1);
  });

  it("a follow-up on the same requirement keeps its place", () => {
    let s = initialJobState(initial());
    s = run(s, { type: "turn.done", ended: false, turn: turn({ index: 2, role: "interviewer", kind: "follow_up", requirementId: "r1", text: "Can you say more?" }) });
    expect(s.cursor).toBe(0);
    expect(s.progress.r1).toBe("asked");
  });

  it("skip marks the requirement being asked at once, and never one already answered", () => {
    let s = reduceJob(initialJobState(initial()), { type: "skipping" });
    expect(s.progress.r1).toBe("skipped");
    s = run(s, { type: "turn.done", ended: false, turn: turn({ index: 1, role: "interviewer", requirementId: "r2", text: "Q2?" }) });
    expect(s.progress).toMatchObject({ r1: "skipped", r2: "asked" });
    s = reduceJob({ ...s, progress: { ...s.progress, r2: "answered" } }, { type: "skipping" });
    expect(s.progress.r2).toBe("answered");
  });

  it("the closing line ends the interview and settles what was asked", () => {
    let s = initialJobState(initial());
    s = run(s, { type: "turn.done", ended: true, turn: turn({ index: 3, role: "interviewer", kind: "closing", text: "That was the last one." }) });
    expect(s.ended).toBe(true);
    expect(s.progress.r1).toBe("answered");
    expect(s.cursor).toBe(REQS.length);
  });

  it("stop is the same closing event, with the stored closing turn", () => {
    const s = run(initialJobState(initial()), { type: "turn.done", ended: true, turn: turn({ index: 1, role: "interviewer", kind: "closing", text: "Stopped." }) });
    expect(s.ended).toBe(true);
    expect(s.turns.at(-1)?.kind).toBe("closing");
  });

  it("a 409 closes the room and drops the answer that was not taken", () => {
    let s = reduceJob(initialJobState(initial()), { type: "pending", pending: { text: "A.", inputMode: "text", clientTurnId: "abcdefgh" } });
    s = reduceJob(s, { type: "closed" });
    expect(s.ended).toBe(true);
    expect(s.pending).toBeNull();
  });

  it("a removal syncs the turns and progress from the server", () => {
    const base = initialJobState(initial({ turns: [...initial().turns, turn({ index: 1, role: "participant", requirementId: "r1", text: "I did X.", sentences: ["I did X."] })] }));
    const synced = reduceJob(base, {
      type: "synced",
      application: {
        status: "interviewing",
        turns: [initial().turns[0]!, turn({ index: 1, role: "participant", requirementId: "r1", text: "", removedAt: "2026-11-14T10:05:00Z" })],
        state: { cursor: 0, followUps: {}, progress: { r1: "asked", r2: "waiting", r3: "waiting" }, noted: {} },
      },
    });
    expect(synced.turns[1]?.text).toBe("");
    expect(synced.noted).toEqual({});
    expect(synced.progress.r1).toBe("asked");
    expect(synced.actionFailed).toBe(false);
  });

  it("an action that fails is flagged, and the flag clears", () => {
    let s = reduceJob(initialJobState(initial()), { type: "actionFailed", value: true });
    expect(s.actionFailed).toBe(true);
    s = reduceJob(s, { type: "actionFailed", value: false });
    expect(s.actionFailed).toBe(false);
  });

  it("an interrupt drops a half-arrived line", () => {
    const s = reduceJob(run(initialJobState(initial()), { type: "turn.delta", text: "Half" }), { type: "interrupt" });
    expect(s.streaming).toBeNull();
  });

  it("finds the requirement the interviewer last asked about", () => {
    expect(currentRequirementId(initialJobState(initial()))).toBe("r1");
  });
});

describe("readApplicationSse", () => {
  const sse = (...events: object[]) =>
    new Response(new ReadableStream({ start(c) { for (const e of events) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`)); c.close(); } }), { status: 200 });

  it("reads application events and ignores frames that are not one", async () => {
    const seen: ApplicationEvent[] = [];
    await readApplicationSse(
      sse({ type: "turn.delta", text: "Hello." }, { type: "something.else" }, { type: "error", message: "x", retryable: false }),
      (e) => seen.push(e),
    );
    expect(seen.map((e) => e.type)).toEqual(["turn.delta", "error"]);
  });

  it("throws when the response is not ok", async () => {
    await expect(readApplicationSse(new Response("no", { status: 500 }), () => {})).rejects.toThrow();
  });
});

describe("delete that", () => {
  it("synced replaces the removed answer and its noted marks with the server's picture", () => {
    const t1 = turn({ index: 1, role: "participant", text: "I worked at the clinic." });
    const start = initialJobState(initial({ turns: [t1] }));
    const noted = { ...start, noted: { r1: [{ turnIndex: 1, sentenceFrom: 0, sentenceTo: 0 }] } };
    const next = reduceJob(noted, {
      type: "synced",
      application: {
        status: "interviewing",
        turns: [{ ...t1, text: "", removedAt: "2026-11-14T10:01:00Z" }],
        state: { cursor: 0, followUps: {}, progress: { r1: "asked", r2: "waiting", r3: "waiting" }, noted: {} },
      },
    });
    expect(next.turns[0].text).toBe("");
    expect(next.noted).toEqual({});
    expect(next.progress.r1).toBe("asked");
  });

  it("fetchOwnApplication reads the own-application route", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ turns: [], state: {}, status: "interviewing" })));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await fetchOwnApplication("app-1");
      expect(fetchMock).toHaveBeenCalledWith("/api/application/app-1", { cache: "no-store" });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
