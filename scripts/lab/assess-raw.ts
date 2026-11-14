/**
 * Lab only: `npx tsx --env-file=.env.local scripts/lab/assess-raw.ts <applicationId>...`
 * Rates stored applications again without storing anything and prints what the model wrote
 * next to what the checks would do with it. For tuning the checks on simulated people.
 */
import { eq } from "drizzle-orm";
import { ApplicationAssessOutput } from "../../src/contracts";
import { closeDb, getDb } from "../../src/db/client";
import { application, applicationTurn, company, job, needCard } from "../../src/db/schema";
import { buildAssessorInput, writtenProblem, answerRunsOf } from "../../src/features/application/assess";
import { toApplicationTurn } from "../../src/features/application/assess-turns";
import { assessMessages } from "../../src/features/application/prompts-assess";
import { chatJson } from "../../src/lib/llm";
import { employerTerms, maskEmployer } from "../../src/lib/mask";

async function main() {
  const db = getDb();
  for (const id of process.argv.slice(2)) {
    const [app] = await db.select().from(application).where(eq(application.id, id));
    if (!app) continue;
    const [row] = await db.select({ job, company, card: needCard.body }).from(job).innerJoin(company, eq(company.id, app.companyId)).leftJoin(needCard, eq(needCard.jobId, job.id)).where(eq(job.id, app.jobId));
    const terms = row.company.masked ? employerTerms(row.company.realName, row.job.employerName) : [];
    const mask = (t: string) => (terms.length ? maskEmployer(t, terms) : t);
    const turns = (await db.select().from(applicationTurn).where(eq(applicationTurn.applicationId, id)).orderBy(applicationTurn.index)).map(toApplicationTurn);
    const input = buildAssessorInput({ jobTitle: mask(row.card?.title ?? row.job.title), plan: app.plan, turns, adSentences: row.job.sentences.map(mask) });
    const result = await chatJson({ role: "analyst", purpose: "lab.assess_raw", messages: assessMessages(input), temperature: 0, maxTokens: 1800, timeoutMs: 75_000, deadlineMs: 75_000, db, schema: ApplicationAssessOutput });
    if (!result.data) {
      console.log(id, "FAILED", result.error);
      continue;
    }
    const runs = answerRunsOf(input);
    console.log(`\n===== ${id}`);
    for (const r of input.requirements) {
      console.log(`\n[${r.label}] ${r.text}`);
      for (const s of r.sentences) console.log(`   ${s.label} ${s.text}`);
      const g = result.data.ratings.find((x) => x.requirement === r.label);
      if (!g) continue;
      console.log(`   -> level ${g.level} evidence ${g.evidence.join(",")}`);
      for (const [lang, text] of [["en", g.reason_en], ["fi", g.reason_fi], ["sv", g.reason_sv]] as const) console.log(`      ${lang} [${writtenProblem(text, terms, runs) ?? "ok"}] ${text}`);
    }
    for (const [lang, text] of [["en", result.data.summary_en], ["fi", result.data.summary_fi], ["sv", result.data.summary_sv]] as const) console.log(`   summary ${lang} [${writtenProblem(text, terms, runs) ?? "ok"}] ${text}`);
  }
  await closeDb();
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
