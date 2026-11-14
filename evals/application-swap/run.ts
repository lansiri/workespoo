/**
 * The language swap check: does the same interview, put into another language, get the same
 * rating? Run by hand with a real model, never in `npm run check`:
 *
 *   npx tsx evals/application-swap/run.ts [--limit 10] [--baseline] [--out evals/application-swap/results/<name>.json]
 *
 * For each assessed application it puts the interview's words (the questions and the answers)
 * into the other two languages with the model (role `bulk`, meaning kept, nothing added), rates
 * each version with the product's own assessor (`assessApplication`: its input, its prompt, its
 * checks), and compares the level of each requirement with the stored one. `--baseline` also
 * rates the unchanged words again, to show how much a rating moves on its own.
 *
 * The rating runs on throwaway copies: a synthetic person and an application per version, both
 * deleted at the end, so point it at a rehearsal database, not at one people are using.
 * It reads DATABASE_URL and the model settings (`.env.local`) and never prints a key.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { ApplicationPlan, UiLang } from "../../src/contracts";
import { application, applicationTurn, talent } from "../../src/db/schema";
import type { Db } from "../../src/db/client";
import { assessApplication } from "../../src/features/application";
import { renderSwapSummary, summariseSwap, type SwapRow } from "../../src/features/synth/swap-summary";
import { newHandle, newId } from "../../src/lib/ids";
import { chatJson } from "../../src/lib/llm";
import { splitSentences } from "../../src/lib/sentences";

const LANGS: UiLang[] = ["en", "fi", "sv"];
const NAME: Record<UiLang, string> = { en: "English", fi: "Finnish", sv: "Swedish" };

const Translated = z.object({ texts: z.array(z.string()) });

async function translate(db: Db, texts: string[], from: UiLang, to: UiLang): Promise<string[]> {
  if (texts.length === 0) return [];
  const { data } = await chatJson({
    role: "bulk",
    purpose: "eval.swap_translate",
    schema: Translated,
    maxTokens: 4000,
    temperature: 0,
    db,
    messages: [
      {
        role: "system",
        content: `You translate from ${NAME[from]} to ${NAME[to]}. Keep the meaning exactly. Add nothing, leave nothing out, do not improve, summarise or explain. Keep names, numbers and tool names as they are. Keep the speaker's way of talking. Answer with JSON: {"texts": [...]} with exactly as many strings as you were given, in the same order. An empty string stays empty.`,
      },
      { role: "user", content: JSON.stringify({ texts }) },
    ],
  });
  if (!data || data.texts.length !== texts.length) throw new Error(`the translation returned ${data?.texts.length ?? 0} texts for ${texts.length}`);
  return data.texts;
}

/** Make a throwaway person and a submitted copy of the application with the given words, rate it, remove it. */
async function rate(db: Db, original: typeof application.$inferSelect, plan: ApplicationPlan, turns: Array<typeof applicationTurn.$inferSelect>) {
  const talentId = newId("tal");
  try {
    const handle = await newHandle(async (h) => (await db.select({ id: talent.id }).from(talent).where(eq(talent.handle, h))).length > 0);
    await db.insert(talent).values({ id: talentId, handle, synthetic: true, personaKey: "swapcheck" });
    const id = newId("app");
    await db.insert(application).values({
      id,
      talentId,
      jobId: original.jobId,
      companyId: original.companyId,
      status: "submitted",
      plan,
      state: original.state,
      submittedAt: new Date(),
    });
    for (const t of turns) {
      await db.insert(applicationTurn).values({
        id: newId("apt"),
        applicationId: id,
        index: t.index,
        role: t.role,
        kind: t.kind,
        requirementId: t.requirementId,
        text: t.text,
        sentences: t.sentences,
        inputMode: null,
        removedAt: t.removedAt,
      });
    }
    return await assessApplication(db, id);
  } finally {
    await db.delete(talent).where(eq(talent.id, talentId));
  }
}

async function main() {
  const { values } = parseArgs({ options: { limit: { type: "string", default: "10" }, baseline: { type: "boolean", default: false }, out: { type: "string" } } });
  const limit = Number.parseInt(values.limit ?? "10", 10);
  const { getDb, closeDb } = await import("../../src/db/client");
  const db = getDb() as unknown as Db;
  try {
    const rows = (await db.select().from(application).where(eq(application.status, "assessed")).orderBy(desc(application.assessedAt)).limit(limit)) as Array<typeof application.$inferSelect>;
    if (rows.length === 0) throw new Error("no assessed applications in this database");
    const results: SwapRow[] = [];
    const failures: string[] = [];
    for (const app of rows) {
      const stored = app.assessment;
      const plan = app.plan;
      if (!stored) continue;
      const turns = (await db.select().from(applicationTurn).where(eq(applicationTurn.applicationId, app.id))).sort((a, b) => a.index - b.index);
      const variants: Array<{ name: string; lang: UiLang | null }> = [
        ...(values.baseline ? [{ name: "baseline", lang: null }] : []),
        ...LANGS.filter((l) => l !== plan.lang).map((l) => ({ name: l, lang: l as UiLang })),
      ];
      for (const v of variants) {
        try {
          let swappedPlan = plan;
          let swappedTurns = turns;
          if (v.lang) {
            const texts = [...plan.requirements.map((r) => r.question), ...turns.map((t) => t.text)];
            const out = await translate(db, texts, plan.lang, v.lang);
            swappedPlan = { ...plan, lang: v.lang, requirements: plan.requirements.map((r, i) => ({ ...r, question: out[i] })) };
            swappedTurns = turns.map((t, i) => {
              const text = out[plan.requirements.length + i];
              return { ...t, text, sentences: t.removedAt ? [] : splitSentences(text) };
            });
          }
          const assessment = await rate(db, app, swappedPlan, swappedTurns);
          if (!assessment) throw new Error("no assessment came back");
          for (const r of stored.ratings) {
            const after = assessment.ratings.find((x) => x.requirementId === r.requirementId);
            if (after) results.push({ applicationId: app.id, requirementId: r.requirementId, variant: v.name, before: r.level, after: after.level });
          }
          console.error(`  ${app.id} ${v.name}: rated`);
        } catch (error) {
          const message = `${app.id} ${v.name}: ${error instanceof Error ? error.message : String(error)}`;
          failures.push(message);
          console.error(`  FAILED ${message}`);
        }
      }
    }
    const summary = summariseSwap(results);
    console.log("\nPer requirement (application, requirement, version: stored level -> level):");
    for (const r of results) console.log(`  ${r.applicationId} ${r.requirementId} ${r.variant}: ${r.before} -> ${r.after}${r.before === r.after ? "" : "  MOVED"}`);
    console.log(`\n${renderSwapSummary(summary)}`);
    if (failures.length) console.log(`\n${failures.length} versions could not be rated:\n${failures.map((f) => `  ${f}`).join("\n")}`);
    if (values.out) {
      mkdirSync(path.dirname(values.out), { recursive: true });
      writeFileSync(values.out, `${JSON.stringify({ at: new Date().toISOString(), summary, results, failures }, null, 1)}\n`);
    }
  } finally {
    await closeDb();
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(`application-swap: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  },
);
