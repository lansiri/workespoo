/**
 * Mechanical checks on prompt C (application.assess) results.
 *   npx tsx evals/prompt-lab/application-assess/check.ts <resultsDir> [--verbose]
 * Per rating: schema, labels in plan order, level in the case's expected set, evidence labels
 * resolve to a shown (not left-out) sentence, level > 0 has evidence, level 0 has none,
 * cross-requirement citations listed, reasons <= 30 words and one sentence in each language,
 * language of each reason, lexicon (banned evaluative, protected card, reason judgement,
 * the spec's own list and fi/sv equivalents), employer terms, verbatim quotes of answers.
 * Twins (same content, other wording or language) must get the same levels in the same run.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ApplicationAssessOutput } from "@/contracts";
import { findBannedEvaluative, findProtectedCard, findReasonJudgement, findSpeechCue } from "@/lib/lexicon";
import { JOBS, terms } from "../application-plan/data";
import { detectLang, sentenceCount } from "../application-plan/check-lib";
import { ASSESS_CASES, layout } from "./build";

/** The spec's own list (strong, weak, good, poor, impressive, lacks, fails, only) and near fi/sv equivalents. */
const SPEC_JUDGE =
  /\b(strong|weak|good|poor|impressive|lacks?|lacking|fails?|failed|only|vahva\p{L}*|heikko\p{L}*|hyvä\p{L}*|huono\p{L}*|puuttu\p{L}*|vain|ainoastaan|stark\p{L}*|svag\p{L}*|bra|god|goda|dålig\p{L}*|saknar|bara|endast|enbart)\b/iu;
const ABOUT_PERSON = /\b(he|she|they are|the candidate|the applicant|hakija|ehdokas|sökande|kandidat)\b/i;

const dir = process.argv[2];
const verbose = process.argv.includes("--verbose");
const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort();
const fails: Record<string, string[]> = {};
const bump = (k: string, f: string) => (fails[k] = [...(fails[k] ?? []), f]);
const levels: Record<string, number[]> = {};
const lat: number[] = [];

for (const f of files) {
  const r = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
  const c = ASSESS_CASES.find((a) => a.id === r.caseId)!;
  if (!r.ok) {
    console.log(`${f}  FAILED ${String(r.error).slice(0, 160)}`);
    bump("call", f);
    continue;
  }
  lat.push(r.meta.latencyMs);
  const d = r.data as ApplicationAssessOutput;
  if (!ApplicationAssessOutput.safeParse(d).success) bump("schema", f);
  const { shown } = layout(c);
  const job = JOBS[c.job];
  const labels = d.ratings.map((x) => x.requirement).join(",");
  const want = c.parts.map((_, i) => `R${i + 1}`).join(",");
  console.log(`\n${f}  ${r.meta.latencyMs} ms  ${labels === want ? "" : `LABELS ${labels}`}`);
  if (labels !== want) bump("labels", f);
  levels[`${c.id}#${r.run}`] = d.ratings.map((x) => x.level);
  for (const rt of d.ratings) {
    const i = Number(rt.requirement.slice(1)) - 1;
    const part = c.parts[i];
    const p: string[] = [];
    if (!part.expect.includes(rt.level)) p.push(`LEVEL ${rt.level} not in ${part.expect.join("/")}`);
    const cross: string[] = [];
    for (const lab of rt.evidence) {
      const s = shown.get(lab);
      if (!s) p.push(`unresolved:${lab}`);
      else if (s.text === null) p.push(`left-out-cited:${lab}`);
      else if (s.req !== i + 1) cross.push(`${lab}(R${s.req})`);
    }
    if (cross.length) p.push(`cross:${cross.join(",")}`);
    if (rt.level > 0 && rt.evidence.length === 0) p.push("no-evidence");
    if (rt.level === 0 && rt.evidence.length > 0) p.push("evidence-at-0");
    for (const [lang, text] of [["en", rt.reason_en], ["fi", rt.reason_fi], ["sv", rt.reason_sv]] as const) {
      const words = text.split(/\s+/).filter(Boolean).length;
      if (words > 30) p.push(`${lang}-words=${words}`);
      if (sentenceCount(text) > 1) p.push(`${lang}-sentences`);
      const l = detectLang(text);
      if (l !== lang) p.push(`${lang}-lang=${l}`);
      const hits = [...findBannedEvaluative(text), ...findProtectedCard(text), ...findReasonJudgement(text, { pronouns: lang === "en" })];
      if (hits.length) p.push(`${lang}-lexicon:${hits.join("|")}`);
      const sj = text.match(SPEC_JUDGE);
      if (sj) p.push(`${lang}-specword:${sj[0]}`);
      if (ABOUT_PERSON.test(text)) p.push(`${lang}-about-person`);
      const sc = findSpeechCue(text);
      if (sc.length) p.push(`${lang}-speech:${sc.join("|")}`);
      if (/speaker|respondent|candidate|applicant|puhuja|vastaaja|hakija|talare|svarande|sökande/i.test(text)) p.push(`${lang}-person-word`);
      if (terms(job).some((t) => text.includes(t))) p.push(`${lang}-employer`);
      if (/["“”«»]/.test(text)) p.push(`${lang}-quote-mark`);
      for (const s of shown.values()) {
        if (!s.text) continue;
        const w = s.text.split(/\s+/);
        for (let k = 0; k + 6 <= w.length; k++) {
          if (text.includes(w.slice(k, k + 6).join(" "))) {
            p.push(`${lang}-verbatim`);
            break;
          }
        }
      }
    }
    p.forEach((k) => bump(k.split(/[:= ]/)[0], `${f}:${rt.requirement}`));
    console.log(`  ${rt.requirement} L${rt.level} ${JSON.stringify(rt.evidence)} [${p.join(", ") || "ok"}]`);
    if (verbose || p.some((x) => !x.startsWith("cross"))) {
      console.log(`     en: ${rt.reason_en}\n     fi: ${rt.reason_fi}\n     sv: ${rt.reason_sv}`);
    }
  }
  for (const [lang, text] of [["en", d.summary_en], ["fi", d.summary_fi], ["sv", d.summary_sv]] as const) {
    const p: string[] = [];
    if (sentenceCount(text) > 2) p.push("sentences");
    const hits = [...findBannedEvaluative(text), ...findProtectedCard(text), ...findReasonJudgement(text, { pronouns: lang === "en" })];
    if (hits.length) p.push(`lexicon:${hits.join("|")}`);
    const sj = text.match(SPEC_JUDGE);
    if (sj) p.push(`specword:${sj[0]}`);
    if (detectLang(text) !== lang) p.push(`lang=${detectLang(text)}`);
    if (/\bR\d\b/.test(text)) p.push("label");
    const sc = findSpeechCue(text);
    if (sc.length) p.push(`speech:${sc.join("|")}`);
    if (/speaker|respondent|candidate|applicant|puhuja|vastaaja|hakija|talare|svarande|sökande/i.test(text)) p.push("person-word");
    p.forEach((k) => bump(`summary-${k.split(/[:=]/)[0]}`, `${f}:${lang}`));
    if (verbose || p.length) console.log(`  summary_${lang} [${p.join(", ") || "ok"}] ${text}`);
  }
}

console.log("\nlevels per run:");
for (const [k, v] of Object.entries(levels)) console.log(`  ${k.padEnd(34)} ${v.join(" ")}`);
console.log("twins (same run must match):");
for (const c of ASSESS_CASES.filter((x) => x.twin)) {
  for (const run of [1, 2, 3]) {
    const a = levels[`${c.id}#${run}`];
    const b = levels[`${c.twin}#${run}`];
    if (!a || !b) continue;
    console.log(`  ${c.id} vs ${c.twin} run ${run}: ${a.join(" ") === b.join(" ") ? "same" : `DIFFER ${a.join(" ")} / ${b.join(" ")}`}`);
  }
}
lat.sort((a, b) => a - b);
console.log(`latency ms: min ${lat[0]} p50 ${lat[Math.floor(lat.length / 2)]} max ${lat[lat.length - 1]}`);
console.log("problems:");
for (const [k, v] of Object.entries(fails)) console.log(`  ${k}: ${v.length}  ${v.join(" ")}`);
