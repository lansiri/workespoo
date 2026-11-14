/**
 * Writes cases.json and expected.json for prompt B (application.turn), spec wording unchanged.
 * The questions asked are the ones prompt A wrote in run 1 (application-plan/results).
 *   npx tsx evals/prompt-lab/application-turn/build.ts [--variant <name>] [--only id,id]
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { JOBS, LANG_NAME, specSystemPrompt, type Lang } from "../application-plan/data";

export type TurnCase = {
  id: string;
  job: string;
  lang: Lang;
  req: number; // 1-based
  followUpAsked: boolean;
  answer: string[];
  expect: {
    concrete: boolean | null; // null: either is defensible
    missing: Array<"none" | "example" | "own_part" | "result">;
    followUp: boolean | null; // whether a follow-up should be proposed; null: either
    /** Words the follow-up must not contain (a protected detail the person mentioned). */
    forbid?: RegExp;
  };
  note: string;
};

export const TURN_CASES: TurnCase[] = [
  {
    id: "turn-en-dev-concrete",
    job: "dev", lang: "en", req: 1, followUpAsked: false,
    answer: [
      "Last year I rebuilt the order API for a logistics client in Node and TypeScript.",
      "I wrote the REST endpoints myself and connected them to their SAP system through a message queue.",
      "After the switch the nightly sync errors went from about thirty a week to almost none.",
    ],
    expect: { concrete: true, missing: ["none"], followUp: false },
    note: "strong concrete example with result",
  },
  {
    id: "turn-en-dev-vague",
    job: "dev", lang: "en", req: 2, followUpAsked: false,
    answer: ["Yes, I know React quite well.", "I have used it a lot and I am good with hooks and components."],
    expect: { concrete: false, missing: ["example"], followUp: true },
    note: "vague claim",
  },
  {
    id: "turn-en-dev-vague-after-followup",
    job: "dev", lang: "en", req: 2, followUpAsked: true,
    answer: ["Mostly I just build components and hooks, the normal stuff in React."],
    expect: { concrete: false, missing: ["example"], followUp: false },
    note: "vague again, follow-up already asked: followUp must be null",
  },
  {
    id: "turn-en-dev-confident-long",
    job: "dev", lang: "en", req: 3, followUpAsked: false,
    answer: [
      "I am very comfortable with CI/CD, it is honestly one of my strongest areas.",
      "I understand pipelines deeply, both GitHub Actions and Azure DevOps, and I always follow DevSecOps best practices.",
      "Cloud is something I am really confident with, AWS and Azure both.",
      "I think automation is the key to any modern team and I always push for it.",
      "Whatever the setup is, I can handle it.",
    ],
    expect: { concrete: false, missing: ["example"], followUp: true },
    note: "long confident answer with no example",
  },
  {
    id: "turn-en-dev-english",
    job: "dev", lang: "en", req: 4, followUpAsked: false,
    answer: [
      "All our standups and code reviews were in English, because the team was in four countries.",
      "I wrote the API documentation and the release notes in English as well.",
    ],
    expect: { concrete: null, missing: ["none", "result", "example"], followUp: null, forbid: /learn|native|first language|where (did|have|do) you|where are you/i },
    note: "language requirement; follow-up must not ask where they learned it",
  },
  {
    id: "turn-fi-forklift-we",
    job: "forklift", lang: "fi", req: 1, followUpAsked: false,
    answer: [
      "Edellisessä työpaikassa varastossa oli tosi kapeat hyllyvälit.",
      "Meidän tiimi hoiti siellä kaikki keräilyt ja täydennykset trukeilla kolmessa vuorossa.",
    ],
    expect: { concrete: false, missing: ["own_part"], followUp: true },
    note: "\"we did\" without own part (Finnish)",
  },
  {
    id: "turn-fi-forklift-tyres-concrete",
    job: "forklift", lang: "fi", req: 4, followUpAsked: false,
    answer: [
      "Viime syksynä olin rengashotellissa Vantaalla.",
      "Mä otin vastaan asiakkaiden renkaat, tarkistin urasyvyydet ja kirjasin vauriot järjestelmään ennen hyllytystä.",
      "Esimies sanoi, että reklamaatiot väheni sinä syksynä selvästi.",
    ],
    expect: { concrete: true, missing: ["none"], followUp: false },
    note: "concrete with result, spoken Finnish",
  },
  {
    id: "turn-fi-forklift-not-done",
    job: "forklift", lang: "fi", req: 1, followUpAsked: false,
    answer: ["En ole ajanut trukkia ahtaissa hyllyväleissä.", "Olen vain siirtänyt lavoja pumppukärryllä."],
    expect: { concrete: false, missing: ["none", "example"], followUp: false },
    note: "plainly has not done it: no follow-up",
  },
  {
    id: "turn-fi-forklift-finnish",
    job: "forklift", lang: "fi", req: 3, followUpAsked: false,
    answer: ["Mä puhun suomea töissä joka päivä.", "Viimeks Postin terminaalissa kaikki ohjeet ja radiopuhelin oli suomeks."],
    expect: { concrete: null, missing: ["none", "result", "own_part", "example"], followUp: null, forbid: /opi|äidinkiel|kotoisin|syntyp/i },
    note: "language requirement in Finnish",
  },
  {
    id: "turn-en-forklift-broken",
    job: "forklift", lang: "en", req: 1, followUpAsked: false,
    answer: [
      "I work two year in Lidl warehouse Järvenpää.",
      "Every day I drive reach truck in very small aisle, shelf high like 8 meter.",
      "I put pallet up and take down for the store orders, I never hit the shelf.",
    ],
    expect: { concrete: true, missing: ["none", "result"], followUp: false },
    note: "broken but clear English; twin of turn-en-forklift-clean",
  },
  {
    id: "turn-en-forklift-clean",
    job: "forklift", lang: "en", req: 1, followUpAsked: false,
    answer: [
      "I worked for two years in a Lidl warehouse in Järvenpää.",
      "Every day I drove a reach truck in very narrow aisles, with shelves about eight metres high.",
      "I put pallets up and took them down for the store orders, and I never hit a shelf.",
    ],
    expect: { concrete: true, missing: ["none", "result"], followUp: false },
    note: "clean English twin of turn-en-forklift-broken",
  },
  {
    id: "turn-en-forklift-protected",
    job: "forklift", lang: "en", req: 2, followUpAsked: false,
    answer: [
      "I worked three years in a Kesko warehouse in Vantaa before my daughter was born.",
      "I did the goods receiving on the morning shift, checking deliveries against the waybill and putting pallets away with a reach truck.",
    ],
    expect: { concrete: true, missing: ["none", "result"], followUp: null, forbid: /daughter|child|born|family|baby|leave/i },
    note: "protected detail (family) inside a concrete answer",
  },
  {
    id: "turn-sv-nurse-not-done",
    job: "nurse", lang: "sv", req: 5, followUpAsked: false,
    answer: ["Nej, på en hälsostation har jag inte jobbat.", "Jag har bara jobbat på sjukhus."],
    expect: { concrete: false, missing: ["none", "example"], followUp: false },
    note: "plainly has not done it (Swedish)",
  },
  {
    id: "turn-sv-nurse-vague",
    job: "nurse", lang: "sv", req: 2, followUpAsked: false,
    answer: ["Jag är van vid datorer och lär mig nya system snabbt."],
    expect: { concrete: false, missing: ["example"], followUp: true },
    note: "vague claim (Swedish)",
  },
  {
    id: "turn-sv-nurse-no-result",
    job: "nurse", lang: "sv", req: 1, followUpAsked: false,
    answer: [
      "På jourmottagningen i Ekenäs svarade jag i telefon på morgnarna.",
      "Jag frågade om symtomen, bedömde hur brådskande det var enligt ABCDE och bokade tid hos läkare eller sjukskötare.",
    ],
    expect: { concrete: true, missing: ["result", "none"], followUp: null },
    note: "concrete own part, no result",
  },
  {
    id: "turn-sv-nurse-we",
    job: "nurse", lang: "sv", req: 4, followUpAsked: false,
    answer: ["Vi hade ett bra team på avdelningen med läkare och skötare.", "Vi samarbetade mycket och hade möten varje morgon."],
    expect: { concrete: false, missing: ["own_part", "example"], followUp: true },
    note: "\"we did\" (Swedish)",
  },
];

export function questionFor(job: string, lang: Lang, req: number): string {
  const file = path.join(import.meta.dirname, "../application-plan/results", `plan-${job}-${lang}.1.json`);
  const r = JSON.parse(readFileSync(file, "utf8"));
  const q = r.data.questions.find((x: { requirement: string }) => x.requirement === `R${req}`);
  return q.question;
}

export function turnUserMessage(c: TurnCase): string {
  const job = JOBS[c.job];
  const lines = [
    `WRITE IN: ${LANG_NAME[c.lang]}`,
    `REQUIREMENT: ${job.reqs[c.req - 1].text}`,
    `QUESTION ASKED: ${questionFor(c.job, c.lang, c.req)}`,
    `FOLLOW-UP ALREADY ASKED: ${c.followUpAsked ? "yes" : "no"}`,
    "",
    "ANSWER",
    ...c.answer.map((s, i) => `[S${i + 1}] ${s}`),
  ];
  return lines.join("\n");
}

/** Variants: one change each, applied to the spec's system prompt. */
export const OLD_CONCRETE =
  `2. "concrete": true only if the answer describes a specific piece of the person's own work for this requirement: a situation and what they themselves did. A general statement ("I have experience with X", "we always did X", "I am good at X") is not concrete.`;
export const NEW_CONCRETE =
  `2. "concrete": true only if the answer describes a specific piece of the person's own work for this requirement: a situation and what they themselves did. The situation can be one occasion or work they did regularly in a named place ("on night shifts at the bakery I ran the oven line"). A general statement ("I have experience with X", "we always did X", "I am good at X") is not concrete.`;
function swap(sys: string, a: string, b: string): string {
  if (!sys.includes(a)) throw new Error("old line not found in spec prompt");
  return sys.replace(a, b);
}
export const VARIANTS: Record<string, (sys: string) => string> = {
  /** Regular work in a named place counts as a situation. */
  regular: (sys) => swap(sys, OLD_CONCRETE, NEW_CONCRETE),
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const variant = process.argv.includes("--variant") ? process.argv[process.argv.indexOf("--variant") + 1] : null;
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;
  let system = specSystemPrompt("B");
  if (variant) system = VARIANTS[variant](system);
  const file = {
    item: variant ? `application-turn-${variant}` : "application-turn",
    role: "live",
    schema: "ApplicationTurnOutput",
    maxTokens: 300,
    temperature: 0.2,
    cases: TURN_CASES.filter((c) => !only || only.includes(c.id)).map((c) => ({
      id: c.id,
      notes: c.note,
      messages: [
        { role: "system", content: system },
        { role: "user", content: turnUserMessage(c) },
      ],
    })),
  };
  const out = path.join(import.meta.dirname, variant ? `cases-${variant}.json` : "cases.json");
  writeFileSync(out, JSON.stringify(file, null, 2));
  console.log(`wrote ${out} (${file.cases.length} cases)`);
}
