/**
 * Mechanical checks on live-interviewer outputs.
 *   npx tsx evals/prompt-lab/interviewer-live/check.ts <cases.json> <resultsDir> [<resultsDir> ...]
 * Checks per output: exactly one "?", at most 2 sentences and 40 words, no banned/protected
 * lexicon hits, reply language (stopword count, the spec's detectLang idea extended to sv),
 * [[STOP]] iff expected. Also reports what the spec's output guard (section 7) would emit.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { findBannedEvaluative, findProtectedQuestion } from "@/lib/lexicon";
import { STOPWORDS } from "@/lib/i18n/content/interview-lines";

type Lang = "en" | "fi" | "sv";

function detect(text: string): Lang | "unknown" {
  const tokens = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  const counts = (Object.keys(STOPWORDS) as Lang[]).map((l) => [l, tokens.filter((t) => STOPWORDS[l].includes(t)).length] as const);
  counts.sort((a, b) => b[1] - a[1]);
  // Extra Finnish/Swedish markers so short questions still classify.
  const fiHints = /(ä|ö)|\b(mitä|mikä|kenen|keiden|voisitko|millaista|kiitos|selvä|kerro|onko|haluaisitko|voit)\b/i.test(text);
  const svHints = /\b(vad|vilka|vilket|vem|kan du|tack|okej|berätta|finns|du|vill)\b/i.test(text);
  const enHints = /\b(what|which|who|could you|thanks|okay|tell me|you)\b/i.test(text);
  if (counts[0][1] >= 2 && counts[0][1] > counts[1][1]) return counts[0][0];
  if (svHints && !enHints && /å|ä|ö/.test(text)) return "sv";
  if (fiHints && !svHints && !enHints) return "fi";
  if (enHints && !svHints && !fiHints) return "en";
  if (svHints && !enHints) return "sv";
  return counts[0][1] > 0 ? counts[0][0] : "unknown";
}

function sentences(text: string): string[] {
  const seg = new Intl.Segmenter("en", { granularity: "sentence" });
  return [...seg.segment(text)].map((s) => s.segment.trim()).filter(Boolean);
}

/** Rough emulation of the guard in interview.md section 7 (steps 1, 3, 4). */
function guard(text: string): { stop: boolean; emitted: string; dropped: number; fallback: boolean } {
  if (text.trimStart().startsWith("[[STOP]]")) return { stop: true, emitted: "", dropped: 0, fallback: false };
  const out: string[] = [];
  let dropped = 0;
  for (const s of sentences(text.replace(/["“”«»*_#]/g, ""))) {
    if (findBannedEvaluative(s).length || findProtectedQuestion(s).length) { dropped++; continue; }
    out.push(s);
    if (s.endsWith("?")) break;
  }
  const words = out.join(" ").split(/\s+/).filter(Boolean);
  const hasQ = out.some((s) => s.endsWith("?"));
  return { stop: false, emitted: out.slice(0, 2).join(" "), dropped, fallback: !hasQ || words.length > 40 };
}

const [casesFile, ...dirs] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(casesFile, "utf8")) as { cases: { id: string; expect: { lang: Lang; stop: boolean } }[] };
const expect = new Map(spec.cases.map((c) => [c.id, c.expect]));

let total = 0, pass = 0;
const fails: Record<string, number> = {};
const firstTok: number[] = [], lat: number[] = [];
for (const dir of dirs) {
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort()) {
    const r = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
    const e = expect.get(r.caseId);
    if (!e) continue;
    total++;
    if (r.meta?.firstTokenMs != null) firstTok.push(r.meta.firstTokenMs);
    if (r.meta?.latencyMs != null) lat.push(r.meta.latencyMs);
    const text: string = (r.text ?? "").trim();
    const problems: string[] = [];
    if (!r.ok) problems.push(`error:${r.error}`);
    const isStop = text.startsWith("[[STOP]]");
    if (text.includes("[[STOP]]") && !isStop) problems.push("stop-not-first");
    if (e.stop && !isStop) problems.push("stop-missing");
    if (!e.stop && isStop) problems.push("stop-unwanted");
    if (isStop && text !== "[[STOP]]") problems.push("stop-extra-text");
    if (!isStop) {
      const q = (text.match(/[?？]/g) ?? []).length;
      if (q !== 1) problems.push(`qmarks=${q}`);
      if (!text.endsWith("?")) problems.push("not-ending-in-?");
      const n = sentences(text).length;
      if (n > 2) problems.push(`sentences=${n}`);
      const w = text.split(/\s+/).filter(Boolean).length;
      if (w > 40) problems.push(`words=${w}`);
      const b = findBannedEvaluative(text);
      if (b.length) problems.push(`banned=${b.join("|")}`);
      const p = findProtectedQuestion(text);
      if (p.length) problems.push(`protected=${p.join("|")}`);
      const l = detect(text);
      if (l !== e.lang) problems.push(`lang=${l}≠${e.lang}`);
      if (/[*#`•]|^\s*[-\d]+\./m.test(text) || /["“”«»]/.test(text)) problems.push("markup/quotes");
      if (/\p{Extended_Pictographic}/u.test(text)) problems.push("emoji");
    }
    const g = guard(text);
    const gnote = g.stop ? "guard:stop" : `guard:${g.fallback ? "FALLBACK" : "ok"}${g.dropped ? `,dropped=${g.dropped}` : ""}`;
    if (problems.length === 0) pass++;
    for (const p of problems) fails[p.split("=")[0]] = (fails[p.split("=")[0]] ?? 0) + 1;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${path.basename(dir)}/${f.padEnd(28)} ${String(r.meta?.firstTokenMs ?? "-").padStart(5)}ms ${gnote.padEnd(22)} ${problems.join(" ")}\n      ${JSON.stringify(text)}`);
  }
}
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
console.log(`\n${pass}/${total} pass all checks. Failure kinds: ${JSON.stringify(fails)}`);
console.log(`firstToken p50=${pct(firstTok, 50)} p90=${pct(firstTok, 90)}  latency p50=${pct(lat, 50)} p90=${pct(lat, 90)}`);
