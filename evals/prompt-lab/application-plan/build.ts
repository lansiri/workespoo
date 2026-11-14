/**
 * Writes cases.json for prompt A (application.plan), spec wording unchanged.
 *   npx tsx evals/prompt-lab/application-plan/build.ts [--variant <name>]
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { JOBS, planUserMessage, specSystemPrompt, type Lang } from "./data";

export const PLAN_CASES: Array<{ id: string; job: string; lang: Lang }> = [
  { id: "plan-dev-en", job: "dev", lang: "en" },
  { id: "plan-forklift-fi", job: "forklift", lang: "fi" },
  { id: "plan-nurse-sv", job: "nurse", lang: "sv" },
  { id: "plan-forklift-en", job: "forklift", lang: "en" },
  { id: "plan-nurse-fi", job: "nurse", lang: "fi" },
];

/** Variants: one change each, applied to the spec's system prompt. */
export const OLD_RULE2 = `2. Ask for the person's own work: a time they did this, how they have done it, what they did themselves. Never a question that "yes" or "no" answers.`;
export const NEW_RULE2 = `2. Ask for the person's own work: a time they did this, how they have done it, what they did themselves. Never a question that "yes" or "no" answers. Never ask how they would do it in this job or how their experience fits it.`;
const VARIANTS: Record<string, (sys: string) => string> = {
  /** No hypothetical or "how does it fit" questions. */
  "no-hypothetical": (sys) => {
    if (!sys.includes(OLD_RULE2)) throw new Error("old line not found in spec prompt");
    return sys.replace(OLD_RULE2, NEW_RULE2);
  },
};

const variant = process.argv.includes("--variant") ? process.argv[process.argv.indexOf("--variant") + 1] : null;
let system = specSystemPrompt("A");
if (variant) system = VARIANTS[variant](system);

const file = {
  item: variant ? `application-plan-${variant}` : "application-plan",
  role: "analyst",
  schema: "ApplicationPlanOutput",
  maxTokens: 700,
  temperature: 0.3,
  cases: PLAN_CASES.map((c) => ({
    id: c.id,
    notes: `${c.job} in ${c.lang}`,
    messages: [
      { role: "system", content: system },
      { role: "user", content: planUserMessage(JOBS[c.job], c.lang) },
    ],
  })),
};
const out = path.join(import.meta.dirname, variant ? `cases-${variant}.json` : "cases.json");
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  writeFileSync(out, JSON.stringify(file, null, 2));
  console.log(`wrote ${out}`);
}
