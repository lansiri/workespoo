/**
 * The question planner (docs/specs/interview.md section 4). Deterministic, pure: the model
 * never chooses the topic, it only words the question for the target picked here.
 */
import { CORE_AREAS, type CoverageArea, type CoverageStatus, type InterviewMode } from "@/contracts";

/** Areas in priority order (interview.md section 3). */
export const AREA_ORDER: readonly CoverageArea[] = [
  "recent_work",
  "example",
  "tools",
  "people",
  "beyond",
  "open_floor",
  "looking_for",
];

/** Full-mode time caps, in seconds. */
export const FULL_ASK_LOOKING_FOR_AFTER_S = 300;
export const FULL_CLOSE_AFTER_S = 420;
/** An answer with fewer words than this is "short" (full mode only). */
export const SHORT_ANSWER_WORDS = 6;
export const EXPRESS_QUESTIONS = 3;
export const FULL_MAX_QUESTIONS = 7;
export const FULL_MIN_QUESTIONS = 5;
export const MAX_PROBES_FULL = 2;
/** At most this many core areas are skipped because they were covered incidentally. */
export const MAX_INCIDENTAL_CORE_SKIPS = 2;

export type PlannerSignal = { id: string; kind: string; hasExample: boolean };

export type PlanInput = {
  mode: InterviewMode;
  /** Questions asked so far, the opening included. The next question is number `questionsAsked + 1`. */
  questionsAsked: number;
  elapsedSeconds: number;
  coverage: Record<CoverageArea, CoverageStatus>;
  /** Areas an interviewer question has already targeted (derived from the stored turns). */
  askedTargets: ReadonlySet<CoverageArea>;
  reasked: readonly CoverageArea[];
  probesUsed: number;
  probed: readonly string[];
  distressSeen: boolean;
  /** The answer being planned from. `ignoreShort` is set for skips and after repairs. */
  answer: { words: number; area: CoverageArea | null; ignoreShort?: boolean };
  /** Signals touched by the latest completed extraction, oldest first. */
  latestSignals: readonly PlannerSignal[];
};

export type Plan =
  | { action: "close"; reason: "done" | "time_cap" }
  | {
      action: "ask";
      kind: "question" | "probe";
      target: CoverageArea;
      /** True when this repeats an area that was asked before (a re-ask). */
      reask: boolean;
      situation: "short_answer" | null;
      probeSignalId: string | null;
    };

const ask = (target: CoverageArea, extra: Partial<Extract<Plan, { action: "ask" }>> = {}): Plan => ({
  action: "ask",
  kind: "question",
  target,
  reask: false,
  situation: null,
  probeSignalId: null,
  ...extra,
});

export function planNext(input: PlanInput): Plan {
  const n = input.questionsAsked + 1;
  const lookingForAsked = input.askedTargets.has("looking_for");

  if (input.mode === "express") {
    if (lookingForAsked || n > EXPRESS_QUESTIONS) return { action: "close", reason: "done" };
    return ask(n === 2 ? "example" : "looking_for");
  }

  // Full mode: first match wins.
  if (lookingForAsked) return { action: "close", reason: "done" };
  if (input.elapsedSeconds >= FULL_CLOSE_AFTER_S) return { action: "close", reason: "time_cap" };
  if (n >= FULL_MAX_QUESTIONS) return ask("looking_for");
  if (input.elapsedSeconds >= FULL_ASK_LOOKING_FOR_AFTER_S && n >= FULL_MIN_QUESTIONS) {
    return ask("looking_for");
  }

  const { area, words, ignoreShort } = input.answer;
  if (
    !ignoreShort &&
    area &&
    words < SHORT_ANSWER_WORDS &&
    area !== "looking_for" &&
    !input.reasked.includes(area)
  ) {
    return ask(area, { reask: true, situation: "short_answer" });
  }

  const exampleOpen = input.coverage.example === "open";
  if (!input.distressSeen && input.probesUsed < MAX_PROBES_FULL && !exampleOpen) {
    const candidate = [...input.latestSignals]
      .reverse()
      .find((s) => s.kind === "skill" && !s.hasExample && !input.probed.includes(s.id));
    if (candidate) {
      return ask("example", { kind: "probe", probeSignalId: candidate.id });
    }
  }

  let incidentalSkips = 0;
  for (const core of CORE_AREAS) {
    const status = input.coverage[core];
    if (status === "skipped" || input.askedTargets.has(core)) continue;
    if (status === "covered") {
      if (incidentalSkips < MAX_INCIDENTAL_CORE_SKIPS) {
        incidentalSkips++;
        continue;
      }
    }
    return ask(core);
  }

  if (n < FULL_MIN_QUESTIONS) {
    const thin = AREA_ORDER.find(
      (a) =>
        a !== "looking_for" &&
        input.coverage[a] === "thin" &&
        input.askedTargets.has(a) &&
        !input.reasked.includes(a),
    );
    if (thin) return ask(thin, { reask: true });
    if (!input.askedTargets.has("open_floor") && input.coverage.open_floor !== "skipped") {
      return ask("open_floor");
    }
  }
  return ask("looking_for");
}
