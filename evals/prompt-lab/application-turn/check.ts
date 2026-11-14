/**
 * Mechanical checks on prompt B (application.turn) results.
 *   npx tsx evals/prompt-lab/application-turn/check.ts <resultsDir> [--verbose]
 * Per output: schema; evidence numbers inside the answer; `concrete` and `missing` against
 * the case's expectation; follow-up proposed or not as expected (missing "none", already asked,
 * or "have not done" all mean null); follow-up: one sentence, at most 25 words, 8..240 chars,
 * lexicon, employer, language, forbidden protected detail; and what code would do with it
 * (asked only when concrete is false).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ApplicationTurnOutput } from "@/contracts";
import { findBannedEvaluative, findProtectedQuestion } from "@/lib/lexicon";
import { JOBS, terms } from "../application-plan/data";
import { detectLang, sentenceCount } from "../application-plan/check-lib";
import { TURN_CASES } from "./build";

const dir = process.argv[2];
const verbose = process.argv.includes("--verbose");
const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort();
const fails: Record<string, string[]> = {};
const bump = (k: string, f: string) => (fails[k] = [...(fails[k] ?? []), f]);
const lat: number[] = [];
for (const f of files) {
  const r = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
  const c = TURN_CASES.find((t) => t.id === r.caseId)!;
  if (!r.ok) {
    console.log(`${f}  FAILED ${String(r.error).slice(0, 120)}`);
    bump("call", f);
    continue;
  }
  lat.push(r.meta.latencyMs);
  const d = r.data as ApplicationTurnOutput;
  const p: string[] = [];
  if (!ApplicationTurnOutput.safeParse(d).success) p.push("schema");
  if (d.evidence.some((n) => n > c.answer.length)) p.push("evidence-out-of-range");
  if (c.expect.concrete !== null && d.concrete !== c.expect.concrete) p.push(`concrete=${d.concrete}`);
  if (!c.expect.missing.includes(d.missing)) p.push(`missing=${d.missing}`);
  const has = d.followUp !== null && d.followUp.trim() !== "";
  if (c.expect.followUp !== null && has !== c.expect.followUp) p.push(has ? "followUp-unexpected" : "followUp-absent");
  if (d.missing === "none" && has) p.push("followUp-with-missing-none");
  if (has) {
    const q = d.followUp!;
    const words = q.split(/\s+/).filter(Boolean).length;
    if (q.length < 8 || q.length > 240) p.push("fu-length");
    if (sentenceCount(q) > 1) p.push("fu-sentences");
    if (words > 25) p.push(`fu-words=${words}`);
    const b = findBannedEvaluative(q);
    if (b.length) p.push(`fu-banned:${b.join("|")}`);
    const pr = findProtectedQuestion(q);
    if (pr.length) p.push(`fu-protected:${pr.join("|")}`);
    if (terms(JOBS[c.job]).some((t) => q.includes(t))) p.push("fu-employer");
    if (c.expect.forbid?.test(q)) p.push("fu-forbidden-detail");
    if (/\bthank|kiitos|tack\b/i.test(q)) p.push("fu-thanks");
    const l = detectLang(q);
    if (l !== c.lang) p.push(`fu-lang=${l}`);
  }
  const codeAsks = has && !d.concrete;
  p.forEach((k) => bump(k, f));
  const line = `${f}  ${r.meta.latencyMs} ms  ev=${JSON.stringify(d.evidence)} concrete=${d.concrete} missing=${d.missing} codeAsks=${codeAsks}  [${p.join(", ") || "ok"}]`;
  console.log(line);
  if (verbose || p.length) console.log(`     followUp: ${d.followUp}`);
}
lat.sort((a, b) => a - b);
console.log(`\nlatency ms: min ${lat[0]} p50 ${lat[Math.floor(lat.length / 2)]} max ${lat[lat.length - 1]}`);
console.log("problems:");
for (const [k, v] of Object.entries(fails)) console.log(`  ${k}: ${v.length}  ${v.join(" ")}`);
