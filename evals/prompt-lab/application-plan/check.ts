/**
 * Mechanical checks on prompt A (application.plan) results.
 *   npx tsx evals/prompt-lab/application-plan/check.ts <resultsDir> [--verbose]
 * Per question: label set and order; 10..300 chars (the spec's code check); "?" or a request;
 * at most 2 sentences and 45 words; no yes/no opener; names a concrete anchor of its
 * requirement; lexicon (banned, protected question) and employer terms; language; for a
 * language requirement no "where/how learned" and no first-language talk.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ApplicationPlanOutput } from "@/contracts";
import { findBannedEvaluative, findProtectedQuestion } from "@/lib/lexicon";
import { JOBS, terms } from "./data";
import { PLAN_CASES } from "./build";
import { detectLang, sentenceCount } from "./check-lib";

const YES_NO = {
  en: /^(have|has|do|does|did|are|is|was|were|can|could|would|will)\s+you\b(?!\s+(tell|describe|walk|give|share|explain))/i,
  fi: /^(\p{L}+(ko|kö))\b/iu,
  sv: /^(har|kan|är|brukar|skulle|vill|hade)\s+du\b(?!\s+(berätta|beskriva|ge))/i,
};
const REQUEST = /^(tell|describe|walk|give|share|explain|kerro|kuvaile|kuvaa|anna|berätta|beskriv|ge)\b/i;
const LEARNED = /\blearn|\boppi|\bopit|\blärde|\blärt|from where|kotoisin|ifrån/i;

const dir = process.argv[2];
const verbose = process.argv.includes("--verbose");
const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort();
let total = 0;
const fails: Record<string, number> = {};
const bump = (k: string) => (fails[k] = (fails[k] ?? 0) + 1);
for (const f of files) {
  const r = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
  const c = PLAN_CASES.find((p) => p.id === r.caseId)!;
  const job = JOBS[c.job];
  const ms = r.meta?.latencyMs;
  if (!r.ok) {
    console.log(`${f}  FAILED ${r.error}`);
    bump("call");
    continue;
  }
  const parsed = ApplicationPlanOutput.safeParse(r.data);
  if (!parsed.success) bump("schema");
  const qs = (r.data as ApplicationPlanOutput).questions;
  const labels = qs.map((q) => q.requirement).join(",");
  const want = job.reqs.map((_, i) => `R${i + 1}`).join(",");
  const problems: string[] = [];
  if (labels !== want) problems.push(`labels ${labels} != ${want}`);
  console.log(`${f}  ${ms} ms  ${labels === want ? "labels ok" : "LABELS"}`);
  qs.forEach((q, i) => {
    total++;
    const req = job.reqs[Number(q.requirement.slice(1)) - 1];
    const p: string[] = [];
    const words = q.question.split(/\s+/).filter(Boolean).length;
    if (q.question.length < 10 || q.question.length > 300) p.push("length");
    if (!q.question.includes("?") && !REQUEST.test(q.question)) p.push("not-a-question");
    if (sentenceCount(q.question) > 2) p.push(`sentences=${sentenceCount(q.question)}`);
    if (words > 45) p.push(`words=${words}`);
    if (YES_NO[c.lang].test(q.question.trim())) p.push("yes-no-opener");
    if (req && !req.anchors.test(q.question)) p.push("no-anchor");
    const banned = findBannedEvaluative(q.question);
    if (banned.length) p.push(`banned:${banned.join("|")}`);
    const prot = findProtectedQuestion(q.question);
    if (prot.length) p.push(`protected:${prot.join("|")}`);
    const emp = terms(job).filter((t) => q.question.includes(t));
    if (emp.length) p.push(`employer:${emp.join("|")}`);
    const lang = detectLang(q.question);
    if (lang !== c.lang) p.push(`lang=${lang}`);
    if (req?.language && LEARNED.test(q.question)) p.push("language-origin");
    p.forEach(bump);
    if (p.length || verbose) console.log(`   ${q.requirement} [${p.join(", ") || "ok"}] (${words}w) ${q.question}`);
    void i;
  });
}
console.log(`\nquestions checked: ${total}`);
console.log("problems:", JSON.stringify(fails));
