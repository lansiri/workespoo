/**
 * Mechanical checks for prompt A (card synthesis) results.
 *   npx tsx evals/prompt-lab/card-synthesis/check.ts <resultsDir> [--verbose]
 * Reads meta.json (written by build_cases.py) for transcripts, planted facts and expectations.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { findBannedEvaluative, findProtectedCard, stripQualityWords } from "@/lib/lexicon";
import type { SynthOutput } from "@/contracts";

type Meta = {
  mode: "express" | "full";
  maxSignals: number;
  turns: Record<string, string[]>;
  drafts: [string, string, string, string][];
  forbidden: string[];
  required: string[];
  roleTurns: number[];
  roleEvidenceLabels?: string[];
  injection?: string[];
  mergeGroups?: string[][];
};

const dir = process.argv[2];
const verbose = process.argv.includes("--verbose");
const meta = JSON.parse(readFileSync(path.join(import.meta.dirname, "meta.json"), "utf8")) as Record<string, Meta>;

const LANG_FLUENCY = /\b(English|Finnish|Swedish|Arabic|Russian|Estonian|Somali|language|fluen\w*|accent|speak\w*|spoken|bilingual|multilingual|interview\w*|translat\w*|typing)\b/i;
const QUOTES = /["“”„«»]|(^|\s)'|'(\s|$|[.,;:])/;
const NON_ENGLISH = /[äöåÄÖÅ]/;
const YEARS = /\b\d+\+?\s*(years?|yrs?)\b|\byears?\b/i;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const sentences = (s: string) => (s.match(/[.!?](\s|$)/g) ?? []).length || 1;

function labelProblem(label: string, m: Meta): string | null {
  const r = /^T(\d+)\.S(\d+)(?:-S?(\d+))?$/.exec(label);
  if (!r) return `bad label ${label}`;
  const turn = m.turns[r[1]];
  if (!turn) return `label ${label}: no such participant turn`;
  const from = Number(r[2]);
  const to = r[3] ? Number(r[3]) : from;
  if (from < 1 || to < from || to > turn.length) return `label ${label}: sentence out of range (turn has ${turn.length})`;
  return null;
}

const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort();
const counts: Record<string, number> = {};
let clean = 0;
for (const f of files) {
  const res = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
  const m = meta[res.caseId];
  const problems: string[] = [];
  const add = (code: string, detail: string) => {
    problems.push(`${code}: ${detail}`);
    counts[code] = (counts[code] ?? 0) + 1;
  };
  if (!res.ok) {
    add("schema", res.error);
  } else {
    const d = res.data as SynthOutput;
    const draftIds = new Set(m.drafts.map((x) => x[0]));
    const texts: [string, string][] = [["headline", d.headline], ["summary", d.summary], ...d.roles.map((r, i): [string, string] => [`role${i}`, r])];
    d.signals.forEach((s, i) => texts.push([`phrase${i}`, s.phrase], [`render${i}`, s.rendering]));

    if (d.signals.length > m.maxSignals) add("count", `${d.signals.length} > ${m.maxSignals}`);
    if (words(d.headline) > 10) add("headline-len", `${words(d.headline)} words`);
    if (/\bI\b/.test(d.headline)) add("headline-I", d.headline);
    if (words(d.summary) > 40 || sentences(d.summary) > 2) add("summary-len", `${words(d.summary)} words, ${sentences(d.summary)} sentences`);

    for (const [where, t] of texts) {
      const prot = findProtectedCard(t);
      if (prot.length) add("protected-lexicon", `${where}: ${prot.join(",")} | ${t}`);
      const ev = findBannedEvaluative(t);
      if (ev.length) add("evaluative", `${where}: ${ev.join(",")} | ${t}`);
      if (QUOTES.test(t)) add("quote", `${where}: ${t}`);
      const lf = LANG_FLUENCY.exec(t);
      if (lf) add("language-fluency", `${where}: ${lf[0]} | ${t}`);
      if (NON_ENGLISH.test(t)) add("non-english", `${where}: ${t}`);
      for (const rx of m.forbidden) {
        const hit = new RegExp(rx, "i").exec(t);
        if (hit) add("planted-leak", `${where}: /${rx}/ -> ${hit[0]} | ${t}`);
      }
    }
    const seenPhrase = new Map<string, number>();
    d.signals.forEach((s, i) => {
      if (stripQualityWords(s.phrase) !== s.phrase) add("phrase-quality", s.phrase);
      if (YEARS.test(s.phrase)) add("phrase-years", s.phrase);
      const w = words(s.phrase);
      if (w < 2 && s.kind !== "tool" && s.kind !== "knowledge" && s.kind !== "domain") {
        // 1-word skills ("Tiling") are a soft deviation from "2 to 6 words"
        add("phrase-len-soft", `${s.phrase}`);
      }
      if (w > 6) add("phrase-len", s.phrase);
      if (!/^They\b/.test(s.rendering)) add("render-they", s.rendering);
      if (words(s.rendering) > 25) add("render-len", `${words(s.rendering)} words | ${s.rendering}`);
      if (sentences(s.rendering) > 1) add("render-sentences", s.rendering);
      for (const l of s.evidence) {
        const p = labelProblem(l, m);
        if (p) add("evidence-unresolved", `${s.phrase}: ${p}`);
        if (m.injection?.some((x) => l.startsWith(x))) add("cites-injection", `${s.phrase}: ${l}`);
      }
      for (const id of s.from) if (!draftIds.has(id)) add("from-unknown", `${s.phrase}: ${id}`);
      const key = s.phrase.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (seenPhrase.has(key)) add("duplicate-phrase", s.phrase);
      seenPhrase.set(key, i);
    });
    for (const rx of m.required) {
      const re = new RegExp(rx, "i");
      if (!d.signals.some((s) => re.test(s.phrase) || re.test(s.rendering))) add("missing-skill", `/${rx}/`);
    }
    for (const g of m.mergeGroups ?? []) {
      const holders = new Set(d.signals.flatMap((s, i) => (s.from.some((x) => g.includes(x)) ? [i] : [])));
      if (holders.size > 1) add("not-merged", `${g.join("+")} in ${holders.size} signals: ${[...holders].map((i) => d.signals[i].phrase).join(" / ")}`);
    }
    // roles
    if (m.roleTurns.length === 0) {
      if (d.roles.length) add("roles-invented", `${d.roles.join("; ")} ev=${d.rolesEvidence.join(",")}`);
    } else {
      if (!d.roles.length) add("roles-missing", "person stated what they want next");
      for (const l of d.rolesEvidence) {
        const p = labelProblem(l, m);
        if (p) add("roles-evidence-unresolved", p);
        const t = Number(/^T(\d+)/.exec(l)?.[1]);
        const okTurn = m.roleTurns.includes(t) && (!m.roleEvidenceLabels || m.roleEvidenceLabels.some((x) => l.startsWith(x)));
        if (!okTurn) add("roles-evidence-wrong", l);
      }
      if (d.roles.length && !d.rolesEvidence.length) add("roles-no-evidence", d.roles.join("; "));
    }
  }
  if (problems.length === 0) clean++;
  const lat = res.meta?.latencyMs ?? "?";
  const att = res.meta?.attempts ?? "?";
  console.log(`\n## ${f}  ok=${res.ok} attempts=${att} latency=${lat}ms  problems=${problems.length}`);
  for (const p of problems) console.log("  - " + p);
  if (verbose && res.ok) {
    const d = res.data as SynthOutput;
    console.log(`  headline: ${d.headline}\n  summary: ${d.summary}\n  roles: ${JSON.stringify(d.roles)} ${JSON.stringify(d.rolesEvidence)}`);
    for (const s of d.signals) console.log(`  * [${s.kind}] ${s.phrase} ${JSON.stringify(s.evidence)} from=${JSON.stringify(s.from)}\n      ${s.rendering}`);
  }
}
console.log(`\n# ${clean}/${files.length} results with no mechanical problems`);
console.log(JSON.stringify(counts, null, 2));
