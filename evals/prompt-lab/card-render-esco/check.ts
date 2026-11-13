/**
 * Mechanical checks for prompt B (rendering) and prompt C (ESCO pick) outputs.
 *   npx tsx evals/prompt-lab/card-render-esco/check.ts <resultsDir> [<resultsDir> ...]
 * Reads expected.json next to this file. Prints one line per result and a total.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { findBannedEvaluative, findProtectedCard, stripQualityWords } from "../../../src/lib/lexicon";
import { parseLenientJson } from "../../../src/lib/llm/json";

const here = path.dirname(new URL(import.meta.url).pathname);
const expected = JSON.parse(readFileSync(path.join(here, "expected.json"), "utf8"));

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const sentences = (s: string) => s.split(/(?<=[.!?])\s+(?=[A-Z])/).filter((x) => x.trim()).length;
const YEARS = /\b\d+\+?\s*(years?|yrs?)\b|\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+years?\b|\bsince (19|20)\d\d\b/i;
const MANNER = /\b(interview|spoke|speaks|speaking|typed|typing|translat\w*|accent|fluent\w*|language)\b/i;

function lex(label: string, s: string, out: string[]) {
  const p = findProtectedCard(s);
  if (p.length) out.push(`${label}: protected ${JSON.stringify(p)}`);
  const b = findBannedEvaluative(s);
  if (b.length) out.push(`${label}: evaluative ${JSON.stringify(b)}`);
  if (YEARS.test(s)) out.push(`${label}: year/duration`);
  if (MANNER.test(s)) out.push(`${label}: mentions manner/language`);
}

function checkB(id: string, text: string): string[] {
  const exp = expected.B[id];
  const errs: string[] = [];
  let data: any;
  try { data = parseLenientJson(text); } catch (e) { return [`parse: ${(e as Error).message}`]; }
  if (text.trim()[0] !== "{") errs.push("not bare JSON (prose or fence around it)");
  if (!data || !Array.isArray(data.items) || typeof data.summary !== "string") return [...errs, "shape: need items[] and summary"];
  const seen = new Map<number, any>();
  for (const it of data.items) {
    if (!Number.isInteger(it.i) || typeof it.phrase !== "string" || typeof it.text !== "string") { errs.push(`shape: bad item ${JSON.stringify(it)}`); continue; }
    if (seen.has(it.i)) errs.push(`i=${it.i} duplicated`);
    seen.set(it.i, it);
  }
  for (let i = 0; i < exp.n; i++) {
    const it = seen.get(i);
    if (!it) { errs.push(`i=${i} missing`); continue; }
    const ph: string = it.phrase, tx: string = it.text;
    if (ph.length < 2 || ph.length > 60) errs.push(`i=${i} phrase length ${ph.length}`);
    if (words(ph) < 1 || words(ph) > 6) errs.push(`i=${i} phrase words ${words(ph)}`);
    if (stripQualityWords(ph) !== ph) errs.push(`i=${i} phrase has quality word/years: "${ph}"`);
    if (/[äöåÄÖÅ]/.test(ph)) errs.push(`i=${i} phrase not English: "${ph}"`);
    if (tx.length < 5 || tx.length > 220) errs.push(`i=${i} text length ${tx.length}`);
    if (!/^They\b/.test(tx)) errs.push(`i=${i} text not third person "They"`);
    if (words(tx) > 25) errs.push(`i=${i} text ${words(tx)} words`);
    if (sentences(tx) > 1) errs.push(`i=${i} text ${sentences(tx)} sentences`);
    if (/["“”]/.test(tx)) errs.push(`i=${i} text has quote marks`);
    lex(`i=${i} phrase`, ph, errs);
    lex(`i=${i} text`, tx, errs);
    if (exp.noEvidence[i] && tx !== `They list ${ph} as a skill.`) errs.push(`i=${i} no-evidence text not template: "${tx}"`);
  }
  for (const k of seen.keys()) if (k < 0 || k >= exp.n) errs.push(`unknown i=${k}`);
  const s: string = data.summary;
  if (s.length < 5 || s.length > 300) errs.push(`summary length ${s.length}`);
  if (words(s) > 40) errs.push(`summary ${words(s)} words`);
  if (sentences(s) > 2) errs.push(`summary ${sentences(s)} sentences`);
  lex("summary", s, errs);
  const all = [...seen.values()].flatMap((it) => [it.phrase, it.text]).concat(s).join(" \n ");
  for (const b of exp.banned) if (new RegExp(`(?<![\\p{L}\\p{N}])${b}(?![\\p{L}\\p{N}])`, "iu").test(all)) errs.push(`case-banned "${b}"`);
  return errs;
}

function checkC(id: string, text: string): string[] {
  const exp = expected.C[id];
  const errs: string[] = [];
  let data: any;
  try { data = parseLenientJson(text); } catch (e) { return [`parse: ${(e as Error).message}`]; }
  if (text.trim()[0] !== "{") errs.push("not bare JSON");
  if (!data || !Array.isArray(data.picks)) return [...errs, "shape: need picks[]"];
  const seen = new Map<number, number>();
  for (const p of data.picks) {
    if (!Number.isInteger(p.i) || !Number.isInteger(p.choice)) { errs.push(`shape: ${JSON.stringify(p)}`); continue; }
    if (seen.has(p.i)) errs.push(`i=${p.i} duplicated`);
    seen.set(p.i, p.choice);
  }
  for (let i = 0; i < exp.n; i++) {
    const c = seen.get(i);
    if (c === undefined) { errs.push(`i=${i} missing`); continue; }
    if (c < 0 || c > exp.nCands[i]) errs.push(`i=${i} choice ${c} out of range 0..${exp.nCands[i]}`);
    else if (!exp.accept[i].includes(c)) errs.push(`i=${i} WRONG choice ${c}, expected ${JSON.stringify(exp.accept[i])}`);
  }
  return errs;
}

let total = 0, ok = 0;
for (const dir of process.argv.slice(2)) {
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort()) {
    const r = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
    const id: string = r.caseId;
    const base = id.replace(/^fix-[^-]+-/, "");
    total++;
    if (!r.ok) { console.log(`FAIL ${dir}/${f}: call error ${r.error}`); continue; }
    const errs = expected.B[base] ? checkB(base, r.text) : expected.C[base] ? checkC(base, r.text) : [`no expectation for ${id}`];
    if (errs.length === 0) ok++;
    console.log(`${errs.length ? "FAIL" : "ok  "} ${path.basename(dir)}/${f} ${errs.join(" | ")}`);
  }
}
console.log(`\n${ok}/${total} passed every check`);
