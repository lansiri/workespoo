/**
 * Writes cases.json for prompt C (application.assess), spec wording unchanged.
 * Questions are prompt A's run-1 output; a sentence with a protected detail is shown as
 * "[left out]", as code does before the model reads it.
 *   npx tsx evals/prompt-lab/application-assess/build.ts [--variant <name>] [--only id,id]
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { JOBS, specSystemPrompt, type Lang } from "../application-plan/data";
import { questionFor } from "../application-turn/build";

/** One requirement's part of the interview. `null` sentence = left out. `skipped` = no answer turn. */
type Part = { followUp?: string; answers: Array<Array<string | null>>; skipped?: boolean; expect: number[] };
export type AssessCase = { id: string; job: string; lang: Lang; parts: Part[]; twin?: string; note: string };

const LEFT_OUT = "[left out]";

const enDevFollowUp = "Could you describe one React application you built and a feature you implemented yourself?";

export const ASSESS_CASES: AssessCase[] = [
  {
    id: "assess-en-dev",
    job: "dev", lang: "en",
    note: "R1 concrete+result, R2 vague after follow-up, R3 we-did, R4 English at work, R5 have not done",
    parts: [
      { expect: [3], answers: [[
        "Last year I rebuilt the order API for a logistics client in Node and TypeScript.",
        "I wrote the REST endpoints myself and connected them to their SAP system through a message queue.",
        "After the switch the nightly sync errors went from about thirty a week to almost none.",
      ]] },
      { expect: [1], followUp: enDevFollowUp, answers: [
        ["Yes, I know React quite well.", "I have used it a lot and I am good with hooks and components."],
        ["Mostly I just build components and hooks, the normal stuff in React."],
      ] },
      { expect: [1], answers: [[
        "In my last team we had a full CI/CD pipeline in GitHub Actions that deployed to AWS.",
        "We set it up so that every merge went to staging automatically.",
      ]] },
      { expect: [2, 3], answers: [[
        "All our standups and code reviews were in English, because the team was in four countries.",
        "I wrote the API documentation and the release notes in English as well.",
      ]] },
      { expect: [0], answers: [["No, I have not done that."]] },
    ],
  },
  {
    id: "assess-en-dev-broken",
    job: "dev", lang: "en", twin: "assess-en-dev",
    note: "same content as assess-en-dev in broken but clear English",
    parts: [
      { expect: [3], answers: [[
        "Last year I make again the order API for one logistics customer, with Node and TypeScript.",
        "The REST endpoints I write myself and I connect them to their SAP system with message queue.",
        "After we switch, the night sync errors go from like thirty in week to almost zero.",
      ]] },
      { expect: [1], followUp: enDevFollowUp, answers: [
        ["Yes I know React quite good.", "I use it a lot, I am good with hooks and component."],
        ["Mostly I just make components and hooks, normal things in React."],
      ] },
      { expect: [1], answers: [[
        "In my last team we have full CI/CD pipeline in GitHub Actions, it deploy to AWS.",
        "We make it so every merge go to staging automatic.",
      ]] },
      { expect: [2, 3], answers: [[
        "All our standup and code review was in English, because team was in four country.",
        "I write the API documentation and release notes in English also.",
      ]] },
      { expect: [0], answers: [["No, this I have not done."]] },
    ],
  },
  {
    id: "assess-fi-forklift",
    job: "forklift", lang: "fi",
    note: "R1 concrete narrow aisles, R2 long confident no example, R3 Finnish at work with a left-out sentence, R4 skipped, R5 have not done",
    parts: [
      { expect: [2, 3], answers: [[
        "Olin kaksi vuotta Lidlin varastossa Järvenpäässä.",
        "Ajoin joka päivä työntömastotrukkia tosi kapeissa hyllyväleissä, hyllyt oli noin kahdeksan metriä korkeita.",
        "Nostin ja laskin lavoja kauppojen tilauksiin, enkä kertaakaan osunut hyllyyn.",
      ]] },
      { expect: [1], answers: [[
        "Varastotyö on mulle tosi tuttua ja oon siinä tosi hyvä.",
        "Osaan kaikki varaston hommat, keräilyt, vastaanotot, inventaariot, mitä vaan.",
        "Oon nopea oppimaan ja tosi tarkka, ja esimiehet on aina tykänneet musta.",
        "Logistiikka on just mun juttu.",
      ]] },
      { expect: [2], answers: [[
        "Käytin suomea joka päivä Postin terminaalissa: kaikki työohjeet ja radiopuhelinliikenne oli suomeksi.",
        null,
      ]] },
      { expect: [0], skipped: true, answers: [] },
      { expect: [0], answers: [["En ole käyttänyt pesulinjaa."]] },
    ],
  },
  {
    id: "assess-en-forklift-clean",
    job: "forklift", lang: "en", twin: "assess-fi-forklift",
    note: "same content as assess-fi-forklift in clean English",
    parts: [
      { expect: [2, 3], answers: [[
        "I worked for two years in a Lidl warehouse in Järvenpää.",
        "Every day I drove a reach truck in very narrow aisles, with shelves about eight metres high.",
        "I put pallets up and took them down for the store orders, and I never hit a shelf.",
      ]] },
      { expect: [1], answers: [[
        "Warehouse work is very familiar to me and I am really good at it.",
        "I can do all the jobs in a warehouse, picking, receiving, stocktaking, anything.",
        "I learn fast and I am very precise, and my supervisors have always liked me.",
        "Logistics is just my thing.",
      ]] },
      { expect: [2], answers: [[
        "I used Finnish every day at the Posti terminal: all the work instructions and the radio traffic were in Finnish.",
        null,
      ]] },
      { expect: [0], skipped: true, answers: [] },
      { expect: [0], answers: [["I have not used a washing line."]] },
    ],
  },
  {
    id: "assess-en-forklift-broken",
    job: "forklift", lang: "en", twin: "assess-en-forklift-clean",
    note: "same content as assess-en-forklift-clean in broken but clear English",
    parts: [
      { expect: [2, 3], answers: [[
        "I work two year in Lidl warehouse Järvenpää.",
        "Every day I drive reach truck in very small aisle, shelf high like 8 meter.",
        "I put pallet up and take down for the store orders, I never hit the shelf.",
      ]] },
      { expect: [1], answers: [[
        "Warehouse work is very familiar for me and I am really good in it.",
        "I can do all job in warehouse, picking, receiving, stock counting, anything.",
        "I learn fast and very precise, my boss always like me.",
        "Logistic is just my thing.",
      ]] },
      { expect: [2], answers: [[
        "I use Finnish every day in Posti terminal, all work instruction and radio talk was Finnish.",
        null,
      ]] },
      { expect: [0], skipped: true, answers: [] },
      { expect: [0], answers: [["Washing line I have not used."]] },
    ],
  },
  {
    id: "assess-sv-nurse",
    job: "nurse", lang: "sv",
    note: "R1 concrete+result, R2 we-did, R3 vague claim, R4 long confident no example, R5 have not done",
    parts: [
      { expect: [3], answers: [[
        "Förra vintern jobbade jag på jourmottagningen i Ekenäs.",
        "Jag svarade i telefon på morgnarna, frågade om symtomen och bedömde hur brådskande det var.",
        "En gång bedömde jag att en patient med bröstsmärtor måste komma in direkt, och det visade sig vara en infarkt som kunde behandlas i tid.",
      ]] },
      { expect: [1], answers: [[
        "På avdelningen använde vi Apotti för all dokumentation.",
        "Teamet skrev in vårdplaner och mediciner där varje dag.",
      ]] },
      { expect: [1], answers: [["Jag kan finska ganska bra."]] },
      { expect: [1], answers: [[
        "Jag är en riktig lagspelare och samarbete är min starkaste sida.",
        "Jag kommer alltid överens med alla, både läkare och andra skötare.",
        "Mångprofessionellt arbete är det viktigaste i vården, och jag trivs bäst när vi jobbar nära varandra.",
      ]] },
      { expect: [0], answers: [["Nej, det har jag inte gjort."]] },
    ],
  },
];

/** The labelled sentences of one case: label -> {req, text|null}. Turn layout: T0 opening+Q1, then answer, question, ... */
export function layout(c: AssessCase) {
  const shown = new Map<string, { req: number; text: string | null }>();
  let t = 0; // T0 is the opening with question 1
  const blocks: string[][] = [];
  c.parts.forEach((part, i) => {
    if (i > 0) t++; // interviewer turn asking this requirement
    const lines: string[] = [];
    if (part.skipped || part.answers.length === 0) {
      blocks.push(lines);
      return;
    }
    part.answers.forEach((ans, k) => {
      if (k > 0) t++; // interviewer follow-up turn
      t++;
      ans.forEach((s, j) => {
        const label = `T${t}.S${j + 1}`;
        shown.set(label, { req: i + 1, text: s });
        lines.push(`[${label}] ${s ?? LEFT_OUT}`);
      });
    });
    blocks.push(lines);
  });
  return { shown, blocks };
}

export function assessUserMessage(c: AssessCase): string {
  const job = JOBS[c.job];
  const { blocks } = layout(c);
  const out = [`JOB: ${job.title}`];
  c.parts.forEach((part, i) => {
    const r = job.reqs[i];
    out.push("");
    out.push(`[R${i + 1}] (${r.kind === "must" ? "must-have" : "nice-to-have"}) ${r.text}`);
    if (r.ad) out.push(`From the ad: "${r.ad}"`);
    out.push(`Asked: ${questionFor(c.job, c.lang, i + 1)}`);
    if (part.followUp) out.push(`Asked: ${part.followUp}`);
    out.push("Answers:");
    if (blocks[i].length === 0) out.push("(no answer)");
    else out.push(...blocks[i]);
  });
  return out.join("\n");
}

export const OLD_REASON_TAIL = `Do not describe the person. Do not use words of praise or blame (strong, weak, good, poor, impressive, lacks, fails, only). Do not address the person. Do not quote.`;
export const NEW_REASON_TAIL = `Do not describe the person; if you must refer to them, say "the person", never "the speaker", "the candidate", "the applicant" or "the respondent". Do not use words of praise or blame (strong, weak, good, poor, impressive, lacks, fails, only). Do not address the person. Do not quote.`;
export const OLD_SUMMARY = `which requirements the answers gave concrete examples for, and which they did not speak to. Same rules as the reasons.`;
export const NEW_SUMMARY = `which requirements the answers gave concrete examples for, and which they did not speak to. Name each requirement in a few words, never by its label (R1). Same rules as the reasons.`;
function swap(sys: string, a: string, b: string): string {
  if (!sys.includes(a)) throw new Error("old line not found in spec prompt");
  return sys.replace(a, b);
}
export const VARIANTS: Record<string, (sys: string) => string> = {
  /** Name the person neutrally: "the speaker" hints that they spoke. */
  person: (sys) => swap(sys, OLD_REASON_TAIL, NEW_REASON_TAIL),
  /** Summaries name requirements in words, not R-labels nobody else sees. */
  "summary-names": (sys) => swap(sys, OLD_SUMMARY, NEW_SUMMARY),
  /** Both recommended changes together, to see that they compose. */
  combined: (sys) => swap(swap(sys, OLD_REASON_TAIL, NEW_REASON_TAIL), OLD_SUMMARY, NEW_SUMMARY),
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const variant = process.argv.includes("--variant") ? process.argv[process.argv.indexOf("--variant") + 1] : null;
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;
  let system = specSystemPrompt("C");
  if (variant) system = VARIANTS[variant](system);
  const file = {
    item: variant ? `application-assess-${variant}` : "application-assess",
    role: "analyst",
    schema: "ApplicationAssessOutput",
    maxTokens: 1800,
    temperature: 0,
    cases: ASSESS_CASES.filter((c) => !only || only.includes(c.id)).map((c) => ({
      id: c.id,
      notes: c.note,
      messages: [
        { role: "system", content: system },
        { role: "user", content: assessUserMessage(c) },
      ],
    })),
  };
  const out = path.join(import.meta.dirname, variant ? `cases-${variant}.json` : "cases.json");
  writeFileSync(out, JSON.stringify(file, null, 2));
  console.log(`wrote ${out} (${file.cases.length} cases)`);
}
