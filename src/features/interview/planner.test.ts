import { describe, expect, it } from "vitest";
import type { CoverageArea, CoverageStatus } from "@/contracts";
import { planNext, type PlanInput } from "./planner";

const OPEN: Record<CoverageArea, CoverageStatus> = {
  recent_work: "asked",
  example: "open",
  tools: "open",
  people: "open",
  beyond: "open",
  open_floor: "open",
  looking_for: "open",
};

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    mode: "full",
    questionsAsked: 1,
    elapsedSeconds: 30,
    coverage: { ...OPEN },
    askedTargets: new Set<CoverageArea>(["recent_work"]),
    reasked: [],
    probesUsed: 0,
    probed: [],
    distressSeen: false,
    answer: { words: 20, area: "recent_work" },
    latestSignals: [],
    ...over,
  };
}

const asked = (...areas: CoverageArea[]) => new Set<CoverageArea>(["recent_work", ...areas]);

describe("planner, express", () => {
  it.each([
    [1, "ask", "example"],
    [2, "ask", "looking_for"],
    [3, "close", undefined],
  ])("after %i question(s) asked: %s %s", (questionsAsked, action, target) => {
    const targets = questionsAsked === 1 ? asked() : questionsAsked === 2 ? asked("example") : asked("example", "looking_for");
    const plan = planNext(input({ mode: "express", questionsAsked, askedTargets: targets }));
    expect(plan.action).toBe(action);
    if (plan.action === "ask") expect(plan.target).toBe(target);
  });

  it("never re-asks or probes, whatever the answer", () => {
    const plan = planNext(
      input({
        mode: "express",
        answer: { words: 1, area: "recent_work" },
        coverage: { ...OPEN, example: "asked" },
        latestSignals: [{ id: "s1", kind: "skill", hasExample: false }],
      }),
    );
    expect(plan).toMatchObject({ action: "ask", target: "example", kind: "question", reask: false });
  });
});

describe("planner, full", () => {
  it("1. closes once looking_for was asked", () => {
    expect(planNext(input({ askedTargets: asked("looking_for"), questionsAsked: 5 }))).toEqual({
      action: "close",
      reason: "done",
    });
  });

  it("2. closes at the 420 s cap, even before looking_for", () => {
    expect(planNext(input({ elapsedSeconds: 420 }))).toEqual({ action: "close", reason: "time_cap" });
  });

  it("3. asks looking_for as question 7", () => {
    const plan = planNext(input({ questionsAsked: 6, askedTargets: asked("example", "tools", "people", "beyond") }));
    expect(plan).toMatchObject({ action: "ask", target: "looking_for" });
  });

  it("3b. question 7 wins over a pending probe or re-ask", () => {
    const plan = planNext(
      input({
        questionsAsked: 6,
        answer: { words: 2, area: "tools" },
        coverage: { ...OPEN, example: "covered" },
        latestSignals: [{ id: "s1", kind: "skill", hasExample: false }],
      }),
    );
    expect(plan).toMatchObject({ action: "ask", target: "looking_for", reask: false, kind: "question" });
  });

  it("4. asks looking_for from 300 s once question 5 is next", () => {
    expect(planNext(input({ questionsAsked: 3, elapsedSeconds: 310 }))).toMatchObject({ target: "example" });
    expect(planNext(input({ questionsAsked: 4, elapsedSeconds: 310 }))).toMatchObject({ target: "looking_for" });
  });

  it("5. re-asks the area after a short answer, once, with the short_answer situation", () => {
    const plan = planNext(input({ answer: { words: 3, area: "recent_work" } }));
    expect(plan).toMatchObject({ action: "ask", target: "recent_work", reask: true, situation: "short_answer" });
    const again = planNext(input({ answer: { words: 3, area: "recent_work" }, reasked: ["recent_work"] }));
    expect(again).toMatchObject({ target: "example", reask: false });
  });

  it("5b. a short answer to looking_for or after a skip is not re-asked", () => {
    expect(planNext(input({ answer: { words: 2, area: "looking_for" } }))).toMatchObject({ reask: false });
    expect(planNext(input({ answer: { words: 1, area: "tools", ignoreShort: true } }))).toMatchObject({ reask: false });
  });

  it("6. probes the most recent skill signal without an example", () => {
    const plan = planNext(
      input({
        coverage: { ...OPEN, example: "covered" },
        askedTargets: asked("example"),
        latestSignals: [
          { id: "s1", kind: "skill", hasExample: false },
          { id: "s2", kind: "tool", hasExample: false },
          { id: "s3", kind: "skill", hasExample: false },
        ],
      }),
    );
    expect(plan).toMatchObject({ action: "ask", kind: "probe", target: "example", probeSignalId: "s3" });
  });

  it("6b. no probe when distress was seen, after 2 probes, for a probed signal, or while example is open", () => {
    const base = {
      coverage: { ...OPEN, example: "covered" as CoverageStatus },
      askedTargets: asked("example"),
      latestSignals: [{ id: "s1", kind: "skill", hasExample: false }],
    };
    expect(planNext(input({ ...base, distressSeen: true }))).toMatchObject({ kind: "question" });
    expect(planNext(input({ ...base, probesUsed: 2 }))).toMatchObject({ kind: "question" });
    expect(planNext(input({ ...base, probed: ["s1"] }))).toMatchObject({ kind: "question" });
    expect(planNext(input({ ...base, coverage: { ...OPEN }, askedTargets: asked() }))).toMatchObject({ kind: "question", target: "example" });
  });

  it("23. a probed signal is never probed again", () => {
    const signals = [{ id: "s2", kind: "skill", hasExample: false }];
    const first = planNext(input({ coverage: { ...OPEN, example: "covered" }, askedTargets: asked("example"), latestSignals: signals }));
    expect(first).toMatchObject({ kind: "probe", probeSignalId: "s2" });
    const later = planNext(
      input({ coverage: { ...OPEN, example: "covered" }, askedTargets: asked("example"), latestSignals: signals, probed: ["s2"], probesUsed: 1 }),
    );
    expect(later.action === "ask" && later.kind).toBe("question");
  });

  it("7. takes core areas in priority order", () => {
    expect(planNext(input())).toMatchObject({ target: "example" });
    expect(planNext(input({ askedTargets: asked("example"), coverage: { ...OPEN, example: "covered" }, questionsAsked: 2 }))).toMatchObject({
      target: "tools",
    });
  });

  it("7b. a skipped core area is not asked again", () => {
    const plan = planNext(
      input({ coverage: { ...OPEN, example: "skipped" }, askedTargets: asked("example"), questionsAsked: 2 }),
    );
    expect(plan).toMatchObject({ target: "tools" });
  });

  it("7c. at most 2 core areas are skipped for being covered incidentally (acceptance 4)", () => {
    // Q1 covered tools and people; example is still asked first, then beyond; the count stays at least 5.
    const coverage = { ...OPEN, tools: "covered", people: "covered" } as Record<CoverageArea, CoverageStatus>;
    const targets: CoverageArea[] = [];
    let questionsAsked = 1;
    let state = asked();
    let cov = { ...coverage };
    for (let i = 0; i < 8; i++) {
      const plan = planNext(input({ coverage: cov, askedTargets: state, questionsAsked }));
      if (plan.action === "close") break;
      targets.push(plan.target);
      state = new Set([...state, plan.target]);
      cov = { ...cov, [plan.target]: cov[plan.target] === "covered" ? "covered" : "asked" };
      questionsAsked++;
    }
    expect(targets).toEqual(["example", "beyond", "open_floor", "looking_for"]);
    expect(questionsAsked).toBe(5);
  });

  it("7d. a third incidentally covered core area is asked", () => {
    const coverage = { ...OPEN, example: "covered", tools: "covered", people: "covered" } as Record<CoverageArea, CoverageStatus>;
    expect(planNext(input({ coverage }))).toMatchObject({ target: "people" });
  });

  it("8. before question 5, re-asks a thin asked area, else open_floor", () => {
    const done = asked("example", "tools", "people", "beyond");
    const thin = planNext(input({ questionsAsked: 3, askedTargets: done, coverage: { ...OPEN, example: "covered", tools: "thin", people: "covered", beyond: "covered" } }));
    expect(thin).toMatchObject({ target: "tools", reask: true });
    const floor = planNext(input({ questionsAsked: 3, askedTargets: done, coverage: { ...OPEN, example: "covered", tools: "covered", people: "covered", beyond: "covered" } }));
    expect(floor).toMatchObject({ target: "open_floor" });
  });

  it("9. otherwise looking_for", () => {
    const done = asked("example", "tools", "people", "beyond", "open_floor");
    expect(planNext(input({ questionsAsked: 5, askedTargets: done, coverage: { ...OPEN, example: "covered", tools: "covered", people: "covered", beyond: "covered", open_floor: "covered" } }))).toMatchObject({
      target: "looking_for",
    });
  });

  it("asks looking_for even when it was covered incidentally earlier (only a question counts)", () => {
    const plan = planNext(input({ coverage: { ...OPEN, looking_for: "covered" }, questionsAsked: 2, askedTargets: asked("example", "tools", "people", "beyond", "open_floor") }));
    expect(plan).toMatchObject({ action: "ask", target: "looking_for" });
  });
});
