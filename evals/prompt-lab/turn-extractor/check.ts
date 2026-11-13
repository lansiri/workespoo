/**
 * Mechanical checks of turn-extractor outputs against expectations.json (written by gen.ts).
 *
 *   npx tsx evals/prompt-lab/turn-extractor/check.ts <results-dir> [--json]
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { findBannedEvaluative, findProtectedCard, findProtectedQuestion, stripQualityWords } from "@/lib/lexicon";

type Sig = { ref: string; phrase: string; kind: string; evidence: string[]; hasExample: boolean };
type Out = { lang: string; signals: Sig[]; coverage: Record<string, string>; flags: string[]; note: string };

const DIR = "evals/prompt-lab/turn-extractor";
const exp = JSON.parse(readFileSync(path.join(DIR, "expectations.json"), "utf8"));
const dir = process.argv[2];
if (!dir) throw new Error("usage: check.ts <results-dir>");

const NON_EN = /[äöåÄÖÅ]|\b(ja|och|työ|taito|hoito|siivous|myynti|för|med|och|vård|kassa|lager)\b/i;

function trigrams(s: string): Set<string> {
  const t = `  ${s.toLowerCase()} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}
function sim(a: string, b: string): number {
  const A = trigrams(a), B = trigrams(b);
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return n / (A.size + B.size - n);
}

function expand(label: string): string[] | null {
  const m = /^T(\d+)\.S(\d+)(?:-S?(\d+))?$/.exec(label);
  if (!m) return null;
  const t = Number(m[1]), a = Number(m[2]), b = m[3] ? Number(m[3]) : a;
  if (b < a) return null;
  const out: string[] = [];
  for (let i = a; i <= b; i++) out.push(`T${t}.S${i}`);
  return out;
}

const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort();
let total = 0, clean = 0, calls = 0;
const lat: number[] = [];
for (const f of files) {
  const r = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
  const e = exp[r.caseId];
  total++;
  calls += (r.meta?.attempts ?? 1) + (r.rawOnFailure !== undefined ? 1 : 0);
  if (r.meta?.latencyMs) lat.push(r.meta.latencyMs);
  const hard: string[] = [];
  const warn: string[] = [];
  if (!r.ok) {
    console.log(`FAIL ${f}: schema/call failed: ${String(r.error).slice(0, 200)}`);
    continue;
  }
  if ((r.meta?.attempts ?? 1) > 1) warn.push(`needed ${r.meta.attempts} attempts`);
  const o = r.data as Out;
  if (o.lang !== e.lang) hard.push(`lang=${o.lang} want ${e.lang}`);
  for (const fl of e.needFlags ?? []) if (!o.flags.includes(fl)) hard.push(`missing flag ${fl}`);
  for (const fl of o.flags) if (!(e.needFlags ?? []).includes(fl) && !(e.okFlags ?? []).includes(fl)) hard.push(`unexpected flag ${fl}`);
  if (e.minSignals !== undefined && o.signals.length < e.minSignals) hard.push(`signals ${o.signals.length} < ${e.minSignals}`);
  if (e.maxSignals !== undefined && o.signals.length > e.maxSignals) hard.push(`signals ${o.signals.length} > ${e.maxSignals}`);
  if (e.needRefs?.length && !o.signals.some((s) => e.needRefs.includes(s.ref))) hard.push(`no signal reuses ${e.needRefs.join("/")}`);
  for (const group of e.needTerms ?? []) {
    if (!o.signals.some((s) => group.some((t: string) => s.phrase.toLowerCase().includes(t)))) hard.push(`no phrase with ${group.join("|")}`);
  }
  for (const s of o.signals) {
    const p = s.phrase;
    const words = p.trim().split(/\s+/).length;
    if (words < 2 || words > 6) warn.push(`"${p}" has ${words} word(s)`);
    if (stripQualityWords(p) !== p.trim()) hard.push(`"${p}" has quality words/years`);
    const prot = findProtectedCard(p);
    if (prot.length) hard.push(`"${p}" protected: ${prot.join(",")}`);
    for (const t of e.forbidTerms ?? []) if (p.toLowerCase().includes(t)) hard.push(`"${p}" contains forbidden "${t}"`);
    if (NON_EN.test(p)) hard.push(`"${p}" not English?`);
    if (s.ref !== "new" && !e.known.includes(s.ref)) hard.push(`ref ${s.ref} unknown`);
    if (s.ref === "new") {
      for (const kp of e.knownPhrases as string[]) {
        const v = sim(p, kp);
        if (v >= 0.5) warn.push(`new "${p}" ~ known "${kp}" (${v.toFixed(2)})${v >= 0.8 ? " merged by code" : ""}`);
      }
    }
    let citesCur = false;
    for (const l of s.evidence) {
      const ex = expand(l);
      if (!ex) { hard.push(`bad label ${l}`); continue; }
      if (ex.length > 3) warn.push(`range ${l} > 3`);
      for (const one of ex) {
        if (!(one in e.sentences)) hard.push(`${l}: ${one} not in input`);
        if ((e.badLabels ?? []).includes(one)) hard.push(`"${p}" cites forbidden ${one}`);
        if (one.startsWith(`T${e.curTurn}.`)) citesCur = true;
      }
    }
    if (!citesCur) warn.push(`"${p}" (${s.ref}) cites only previous turn`);
  }
  for (const k of Object.keys(o.coverage)) if (!(e.allowedCoverage ?? []).includes(k)) hard.push(`coverage ${k} not touched`);
  for (const k of e.needCoverage ?? []) if (!(k in o.coverage)) hard.push(`coverage missing ${k}`);
  const nw = o.note.trim().split(/\s+/).filter(Boolean).length;
  if (nw > 20) warn.push(`note ${nw} words`);
  const nb = findBannedEvaluative(o.note);
  if (nb.length) hard.push(`note evaluative: ${nb.join(",")}`);
  const nq = [...findProtectedQuestion(o.note), ...findProtectedCard(o.note)];
  if (nq.length) hard.push(`note protected: ${nq.join(",")}`);
  if (NON_EN.test(o.note)) warn.push(`note not English?`);
  if (hard.length === 0) clean++;
  const sigs = o.signals.map((s) => `${s.ref}:${s.phrase}[${s.kind}|${s.evidence.join(",")}|${s.hasExample ? "ex" : "-"}]`).join("; ");
  console.log(`${hard.length ? "BAD " : "ok  "} ${f} lang=${o.lang} flags=[${o.flags}] cov=${JSON.stringify(o.coverage)} ${r.meta?.latencyMs}ms`);
  console.log(`     signals: ${sigs || "(none)"}`);
  console.log(`     note: ${o.note}`);
  if (hard.length) console.log(`     HARD: ${hard.join(" | ")}`);
  if (warn.length) console.log(`     warn: ${warn.join(" | ")}`);
}
lat.sort((a, b) => a - b);
const pct = (p: number) => lat[Math.min(lat.length - 1, Math.floor((p / 100) * lat.length))];
console.log(`\n${clean}/${total} outputs pass every hard check; model calls ~${calls}; latency p50 ${pct(50)} p90 ${pct(90)} max ${lat[lat.length - 1]}`);
