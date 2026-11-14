/** Builders for the tests of the assessment and the ranking. Not used by production code. */
import type { ApplicationAssessment, ApplicationPlan, ApplicationState, RatingLevel } from "@/contracts";
import { APPLICATION_RUBRIC_VERSION } from "@/contracts";
import type { Db } from "@/db/client";
import { application, applicationTurn } from "@/db/schema";

export type FixtureRequirement = { id: string; text: string; kind: "must" | "nice" };

export const REQS: FixtureRequirement[] = [
  { id: "r1", text: "Python data pipelines", kind: "must" },
  { id: "r2", text: "SQL", kind: "must" },
  { id: "r3", text: "Airflow", kind: "nice" },
];

export function planFor(needCardId: string, reqs: FixtureRequirement[] = REQS): ApplicationPlan {
  return {
    needCardId,
    needCardVersion: 1,
    lang: "en",
    requirements: reqs.map((r, i) => ({
      requirementId: r.id,
      text: r.text,
      kind: r.kind,
      category: "skill" as const,
      postingSentence: i === 0 ? 0 : null,
      question: `Tell me about a time you used ${r.text} in your own work.`,
      wording: "code" as const,
    })),
  };
}

export const stateFor = (reqs: FixtureRequirement[] = REQS): ApplicationState => ({
  cursor: reqs.length,
  followUps: {},
  progress: Object.fromEntries(reqs.map((r) => [r.id, "answered" as const])),
  noted: {},
});

export function assessmentFor(levels: Record<string, number>, reqs: FixtureRequirement[] = REQS): ApplicationAssessment {
  return {
    rubricVersion: APPLICATION_RUBRIC_VERSION,
    ratings: reqs.map((r, i) => ({
      requirementId: r.id,
      level: (levels[r.id] ?? 0) as RatingLevel,
      evidence: (levels[r.id] ?? 0) > 0 ? [{ turnIndex: 1 + 2 * i, sentenceFrom: 1, sentenceTo: 1 }] : [],
      reason: { en: `Reason for ${r.id}.`, fi: `Syy ${r.id}.`, sv: `Skäl ${r.id}.` },
      wording: "model" as const,
    })),
    summary: { en: "Summary.", fi: "Yhteenveto.", sv: "Sammanfattning." },
    assessedAt: "2026-11-14T12:00:00.000Z",
  };
}

/** An application row with a plan, an answer turn per requirement and (when `levels` is given) an assessment. */
export async function addApplication(
  db: Db,
  args: {
    id: string;
    talentId: string;
    jobId: string;
    companyId: string;
    needCardId: string;
    levels?: Record<string, number>;
    status?: "interviewing" | "review" | "submitted" | "assessed";
    submittedAt?: string;
    answers?: Record<string, string[]>;
    reqs?: FixtureRequirement[];
  },
): Promise<void> {
  const reqs = args.reqs ?? REQS;
  const status = args.status ?? (args.levels ? "assessed" : "submitted");
  await db.insert(application).values({
    id: args.id,
    talentId: args.talentId,
    jobId: args.jobId,
    companyId: args.companyId,
    status,
    plan: planFor(args.needCardId, reqs),
    state: stateFor(reqs),
    assessment: args.levels ? assessmentFor(args.levels, reqs) : null,
    submittedAt: new Date(args.submittedAt ?? "2026-11-14T10:00:00.000Z"),
    assessedAt: args.levels ? new Date("2026-11-14T12:00:00.000Z") : null,
  });
  // Turn 0 is the opening (about the first requirement); answers sit at 1, 3, 5 with the next question between them.
  const rows: Array<typeof applicationTurn.$inferInsert> = [
    { id: `${args.id}_t0`, applicationId: args.id, index: 0, role: "interviewer", kind: "opening", requirementId: reqs[0].id, text: `Hello. ${planFor(args.needCardId, reqs).requirements[0].question}`, sentences: [] },
  ];
  reqs.forEach((r, i) => {
    if (i > 0) {
      rows.push({ id: `${args.id}_q${2 * i}`, applicationId: args.id, index: 2 * i, role: "interviewer", kind: "question", requirementId: r.id, text: `Next. ${planFor(args.needCardId, reqs).requirements[i].question}`, sentences: [] });
    }
    const sentences = args.answers?.[r.id] ?? [`I used ${r.text} at work.`, "I built it myself."];
    const idx = 1 + 2 * i;
    rows.push({ id: `${args.id}_a${idx}`, applicationId: args.id, index: idx, role: "participant", kind: "answer", requirementId: r.id, text: sentences.join(" "), sentences, inputMode: "text" });
  });
  await db.insert(applicationTurn).values(rows);
}
