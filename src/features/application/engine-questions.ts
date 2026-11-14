import { eq } from "drizzle-orm";
import { ApplicationPlanOutput, type UiLang } from "@/contracts";
import type { Db } from "@/db/client";
import { appMeta } from "@/db/schema";
import { chatJson } from "@/lib/llm";
import { scriptedQuestion } from "./lines";
import { buildPlanPrompt, questionProblem } from "./prompts-interview";
import type { JobContext } from "./requirements";

/**
 * The questions of one job interview (prompt A). One set per Need Card id, version and
 * language, kept in `app_meta`, so every applicant gets the same wording. A failed or late
 * call stores the scripted set, so the wording stays fixed for that version.
 */

export interface PlannedQuestion {
  requirementId: string;
  question: string;
  wording: "model" | "code";
}

interface Stored {
  questions: PlannedQuestion[];
}

export const questionsKey = (needCardId: string, version: number, lang: UiLang) =>
  `application:questions:${needCardId}:${version}:${lang}`;

function validStored(value: unknown, ctx: JobContext): PlannedQuestion[] | null {
  const q = (value as Stored | null)?.questions;
  if (!Array.isArray(q)) return null;
  const byId = new Map(q.map((x) => [x.requirementId, x] as const));
  const out: PlannedQuestion[] = [];
  for (const r of ctx.covered) {
    const hit = byId.get(r.id);
    if (!hit || typeof hit.question !== "string" || (hit.wording !== "model" && hit.wording !== "code")) return null;
    out.push({ requirementId: r.id, question: hit.question, wording: hit.wording });
  }
  return out;
}

async function readStored(db: Db, key: string, ctx: JobContext): Promise<PlannedQuestion[] | null> {
  const [row] = await db.select().from(appMeta).where(eq(appMeta.key, key));
  return row ? validStored(row.value, ctx) : null;
}

function scripted(ctx: JobContext, lang: UiLang): PlannedQuestion[] {
  return ctx.covered.map((r) => ({ requirementId: r.id, question: scriptedQuestion(lang, ctx.mask(r.text)), wording: "code" as const }));
}

type Inflight = Map<string, Promise<PlannedQuestion[]>>;
const KEY = Symbol.for("workespoo.application.questions");
const holder = globalThis as unknown as Record<symbol, Inflight | undefined>;

/**
 * The question for each covered requirement, in the plan's order. The model call is shared by
 * every caller on the same key, so no caller's abort signal is passed into it: it runs on its own deadline.
 */
export async function questionsFor(
  db: Db,
  ctx: JobContext,
  lang: UiLang,
): Promise<PlannedQuestion[]> {
  const key = questionsKey(ctx.card.id, ctx.card.version, lang);
  const stored = await readStored(db, key, ctx);
  if (stored) return stored;

  const inflight = (holder[KEY] ??= new Map());
  const running = inflight.get(key);
  if (running) return running;
  const promise = makeQuestions(db, ctx, lang, key).finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

async function makeQuestions(
  db: Db,
  ctx: JobContext,
  lang: UiLang,
  key: string,
): Promise<PlannedQuestion[]> {
  const fallback = scripted(ctx, lang);
  const prompt = buildPlanPrompt({
    title: ctx.mask(ctx.card.title),
    lang,
    requirements: ctx.covered.map((r) => ({
      text: ctx.mask(r.text),
      kind: r.kind,
      adSentence: r.postingSentence === null ? null : ctx.mask(ctx.sentences[r.postingSentence] ?? "").trim() || null,
    })),
  });

  let output: ApplicationPlanOutput | null = null;
  try {
    const result = await chatJson({
      role: "analyst",
      purpose: "application.plan",
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      schema: ApplicationPlanOutput,
      temperature: 0.3,
      maxTokens: 700,
      deadlineMs: 25_000,
      db,
    });
    output = result.data;
  } catch {
    output = null;
  }
  const byLabel = new Map<string, string>();
  for (const q of output?.questions ?? []) if (!byLabel.has(q.requirement)) byLabel.set(q.requirement, q.question.trim());
  const questions = ctx.covered.map((r, i): PlannedQuestion => {
    const proposed = byLabel.get(`R${i + 1}`);
    if (proposed && questionProblem(proposed, ctx.terms) === null) {
      return { requirementId: r.id, question: proposed, wording: "model" };
    }
    return fallback[i]!;
  });

  // Insert if absent, then read what is stored: the first writer's wording wins for everyone.
  await db.insert(appMeta).values({ key, value: { questions } satisfies Stored }).onConflictDoNothing();
  return (await readStored(db, key, ctx)) ?? questions;
}
