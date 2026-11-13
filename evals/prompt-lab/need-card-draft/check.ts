/**
 * Mechanical checks for need-card-draft outputs.
 *
 *   npx tsx evals/prompt-lab/need-card-draft/check.ts <results-dir> [--raw] [--verbose]
 *
 * Reads each <case>.<run>.json. Uses `data` when the runner's schema check passed; with
 * --raw also parses `rawOnFailure` (plain-mode output) so content can be judged even when
 * the schema failed. Prints one line per problem and a per-check tally.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NeedCardDraftOutput } from "@/contracts";
import { findProtectedCard } from "@/lib/lexicon";

const DIR = "evals/prompt-lab/need-card-draft";
const meta = JSON.parse(readFileSync(path.join(DIR, "cases-meta.json"), "utf8")) as Record<string, any>;
const resultsDir = process.argv[2]!;
const useRaw = process.argv.includes("--raw");
const verbose = process.argv.includes("--verbose");

// need-card.md 3.2
const MUST = /edellytämme|edellytyksenä|edellytetään|vaadimme|vaatimuksena|vaaditaan|kelpoisuusvaatimus|sinulla on|sinulla tulee olla|hallitset|odotamme|\brequired\b|\brequires?\b|\bmust\b|\bmandatory\b|you have|you need|we expect|requirements|qualifications|\bkrav\b|vi förutsätter|\bdu har\b/i;
const NICE = /eduksi|arvostamme|plussaa|toivomme|olisi hienoa|lisäksi hyödyksi|nice to have|a plus|\bbonus\b|preferred|ideally|we appreciate|advantage|meriterande|vi uppskattar/i;
// need-card.md 4.3
const LICENCE = /laillistettu|valvira|terhikki|ammattioikeus|kelpoisuus|pätevyys|ajokortti|ammattipätevyys|hygieniapassi|työturvallisuuskortti|tulityökortti|sähköpätevyys|anniskelupassi|registered nurse|licen[cs]ed?|driving licen[cs]e|qualification required/i;
const CLEARANCE = /turvallisuusselvitys|security clearance|rikostaustaote|criminal record/i;
const OTHER_LAW = /työlupa|oleskelulupa|work permit|right to work|residence permit/i;
const LANG_ACT = /kielitaitolaki|424\/2003|kielitaitovaatimus|julkisyhteisö|virkaan|tehtävään vaadittava kielitaito/i;
// need-card.md 6.3 (the lint code applies to requirement text AND cited sentence, rule 7.3)
const LINT = /\b(age|years old|young|nuori|ikä|gender|male|female|mies|nainen|nationality|kansalai|native|äidinkieli|syntyperä|religio|uskonto|health|terveys|pregnan|raskau|family|perhe|photo|kuva)\b/i;
// need-card.md 4.2.4
const FORBIDDEN_Q = /unnecessary|unrealistic|excessive|discriminat|bias|illegal|should|must not|\btoo\b|wrong|outdated/i;
const PATTERNS: Record<string, RegExp> = {
  language: /^Is \w+ needed from day one, or could someone start in \w+ and build up \w+ on the job\?$/,
  years: /^Would someone who has done .+, with fewer than \d+ years, be worth a conversation\?$/,
  degree: /^Would hands-on experience in .+ work instead of the degree\?$/,
  tool: /^Would experience with a comparable tool be enough, if the person learns .+ on the job\?$/,
  vague: /^What does '.+' look like in this job\? One concrete example helps us find people who have done it\.$/,
};
const LANG_WORDS: Array<[RegExp, string]> = [
  [/suome|finnish|suomeksi|suomenkie/i, "fi"], [/ruotsi|swedish|svensk|toisen kotimaisen/i, "sv"], [/englanti|english/i, "en"],
];
const FINNISH_WORDS = /[äöå]|\b(ja|tai|sekä|kokemus|osaaminen|taito|työ)\b/i;

type Problem = { caseId: string; run: number; check: string; detail: string };
const problems: Problem[] = [];
const tally: Record<string, { checked: number; failed: number }> = {};
const count = (check: string, ok: boolean, caseId: string, run: number, detail: string) => {
  tally[check] ??= { checked: 0, failed: 0 };
  tally[check].checked++;
  if (!ok) {
    tally[check].failed++;
    problems.push({ caseId, run, check, detail });
  }
};

function headerFor(sentences: string[], i: number): string | null {
  for (let k = i - 1; k >= 0 && k >= i - 25; k--) {
    const s = sentences[k]!;
    if (/:$/.test(s.trim()) || (s.length < 45 && !/[.]$/.test(s.trim()) && (MUST.test(s) || NICE.test(s)))) return s;
  }
  return null;
}

let outputs = 0;
const files = readdirSync(resultsDir).filter((f) => /\.\d+\.json$/.test(f)).sort();
for (const f of files) {
  const r = JSON.parse(readFileSync(path.join(resultsDir, f), "utf8"));
  const m = meta[r.caseId];
  if (!m) continue;
  let data = r.ok ? r.data : null;
  let source = "data";
  if (!data && useRaw && r.rawOnFailure) {
    try {
      data = JSON.parse(r.rawOnFailure.replace(/^```(?:json)?\s*|\s*```$/g, ""));
      source = "raw";
    } catch {
      data = null;
    }
  }
  if (!data) continue;
  outputs++;
  const id = r.caseId as string;
  const run = r.run as number;
  const S: string[] = m.sentences;
  const nK = m.candidates.length;
  const strictParse = NeedCardDraftOutput.safeParse(data);
  count("schema", strictParse.success, id, run, `${source}: ${strictParse.success ? "" : strictParse.error.issues.slice(0, 2).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);

  const names = [m.employerName, ...m.brands].filter((n: string) => n && n.length > 2);
  const namesRe = new RegExp(names.map((n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+(Oy|Ab|Oyj)$/i, "")).join("|"), "i");
  const allText = JSON.stringify(data);
  count("no employer name", !namesRe.test(allText), id, run, `${(allText.match(namesRe) ?? [""])[0]}`);
  count("title/summary English", !FINNISH_WORDS.test(`${data.title} ${data.summary}`), id, run, `${data.title} | ${data.summary}`);
  for (const t of [data.title, data.summary]) {
    const hits = findProtectedCard(String(t ?? ""));
    count("protected (title/summary)", hits.length === 0, id, run, `${hits.join(",")}: ${t}`);
  }
  count("<=12 requirements", (data.requirements ?? []).length <= 12, id, run, `${data.requirements?.length}`);

  const reqs: any[] = data.requirements ?? [];
  const cited = new Set<number>();
  for (const q of reqs) {
    const tag = `P${q.sentence} "${q.text}" [${q.kind}/${q.category}/${q.statutory}/${q.questionType}]`;
    const s = S[q.sentence];
    count("sentence in range", typeof s === "string", id, run, tag);
    if (typeof s !== "string") continue;
    cited.add(q.sentence);
    if (verbose) console.log(`  ${id}.${run} ${tag}\n      <- ${s}`);
    // esco
    const escos: string[] = q.esco ?? [];
    const bad = escos.filter((k) => !/^K\d+$/.test(k) || Number(k.slice(1)) < 1 || Number(k.slice(1)) > nK);
    count("esco ids in list", bad.length === 0, id, run, `${tag} ${bad}`);
    if (["language", "authorisation", "other"].includes(q.category))
      count("no esco on lang/auth/other", escos.length === 0, id, run, `${tag} ${escos}`);
    const dis = escos.filter((k) => m.candidates[Number(k.slice(1)) - 1]?.distractor);
    count("no distractor esco", dis.length === 0, id, run, `${tag} -> ${dis.map((k) => `${k}=${m.candidates[Number(k.slice(1)) - 1].labelEn}`)}`);
    if (verbose && escos.length) console.log(`      esco: ${escos.map((k) => `${k}=${m.candidates[Number(k.slice(1)) - 1]?.labelEn}`).join("; ")}`);
    // kind
    const header = headerFor(S, q.sentence);
    const expected = MUST.test(s) ? "must" : NICE.test(s) ? "nice" : header && MUST.test(header) ? "must" : header && NICE.test(header) ? "nice" : "nice";
    count("kind follows cue rubric", q.kind === expected, id, run, `${tag} expected ${expected} (header: ${header ?? "-"})`);
    // language
    if (q.category === "language") {
      const want = LANG_WORDS.filter(([re]) => re.test(s) || re.test(q.text)).map(([, c]) => c);
      count("language ISO code", typeof q.language === "string" && want.includes(q.language), id, run, `${tag} language=${q.language} want one of ${want}`);
    } else {
      count("language null unless language", q.language === null || q.language === undefined, id, run, `${tag} language=${JSON.stringify(q.language)}`);
    }
    if (q.category === "experience" && /\d+\s*(\+|vuo|year)|kahden|kolmen|five|viiden/i.test(s))
      count("years set when stated", Number.isInteger(q.years), id, run, `${tag} years=${q.years}`);
    // statutory (code rule 4.3, and the public-sector language act)
    const codeLaw =
      LICENCE.test(s) || CLEARANCE.test(s) || OTHER_LAW.test(s) ||
      (q.category === "language" && (m.sector === "public" || m.source === "kuntarekry" || LANG_ACT.test(s)));
    if (codeLaw) count("statutory=law where code says law", q.statutory === "law", id, run, `${tag} <- ${s}`);
    if (q.statutory === "law") count("law => no question", q.questionType === "none" && q.question == null, id, run, `${tag} q=${q.question}`);
    // question
    if (q.questionType && q.questionType !== "none") {
      const pat = PATTERNS[q.questionType];
      count("question follows pattern", !!pat && pat.test(q.question ?? ""), id, run, `${tag} "${q.question}"`);
      count("question has no forbidden word", !FORBIDDEN_Q.test(q.question ?? ""), id, run, `${tag} "${q.question}"`);
      const nums = (q.question ?? "").match(/\d+/g) ?? [];
      count("question numbers only years", nums.every((n: string) => q.questionType === "years" && Number(n) === q.years), id, run, `${tag} "${q.question}"`);
      count("why present, <=140, no digits", typeof q.why === "string" && q.why.length <= 140 && !/\d/.test(q.why), id, run, `${tag} why="${q.why}"`);
      // trigger conditions from 4.1
      const trig =
        q.questionType === "language" ? q.category === "language" && q.kind === "must" :
        q.questionType === "years" ? q.category === "experience" && q.kind === "must" && (q.years ?? 0) >= 3 :
        q.questionType === "degree" ? q.category === "education" && q.kind === "must" :
        q.questionType === "tool" ? q.category === "skill" && q.kind === "must" :
        q.questionType === "vague" ? q.category === "other" : false;
      count("question trigger holds (4.1)", trig, id, run, tag);
    } else {
      count("no question text when none", q.question == null && q.why == null, id, run, `${tag} q=${q.question} why=${q.why}`);
      if (q.category === "other") count("vague asks get a vague question", false, id, run, tag);
    }
    // protected
    const hits = findProtectedCard(`${q.text}`);
    count("protected (requirement text)", hits.length === 0, id, run, `${tag} hits=${hits}`);
    const lintText = LINT.test(q.text);
    const lintSentence = LINT.test(s);
    count("6.3 lint would keep it (text)", !lintText, id, run, `${tag} lint=${q.text.match(LINT)?.[0]}`);
    count("6.3 lint would keep it (cited sentence)", !lintSentence, id, run, `${tag} lint=${s.match(LINT)?.[0]} <- ${s}`);
    count("text <=80, no digits except years/classes", q.text.length <= 80 && (!/\d/.test(q.text) || q.category === "experience" || /[A-E]\b|C1|C2/.test(q.text)), id, run, tag);
  }
  // protected sentences must be in dropped
  for (const [i, s] of S.entries()) {
    if (LINT.test(s) || findProtectedCard(s).length > 0) {
      const inDropped = (data.dropped ?? []).includes(i);
      if (verbose) console.log(`  ${id}.${run} protected-looking P${i} dropped=${inDropped} cited=${cited.has(i)}: ${s}`);
    }
  }
  for (const d of data.dropped ?? []) count("dropped in range", Number.isInteger(d) && d >= 0 && d < S.length, id, run, `P${d}`);
  if (verbose) console.log(`  ${id}.${run} dropped=${JSON.stringify(data.dropped)} title="${data.title}" summary="${data.summary}"`);
}

console.log(`outputs checked: ${outputs}`);
for (const [k, v] of Object.entries(tally)) console.log(`${v.failed === 0 ? "ok  " : "FAIL"} ${k}: ${v.failed}/${v.checked} failed`);
console.log("\nproblems:");
for (const p of problems) console.log(`- [${p.check}] ${p.caseId}.${p.run}: ${p.detail}`);
writeFileSync(path.join(resultsDir, "_check.json"), JSON.stringify({ outputs, tally, problems }, null, 2));
