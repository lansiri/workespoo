/**
 * The simulated candidate of a job interview (docs/specs/job-interview.md section 11).
 *
 * The scripted candidate answers by coverage area and knows nothing of requirements. This one is
 * given the persona sheet, the requirement and the question, and answers in the persona's
 * interview language only from what the sheet holds. When the sheet holds nothing for the
 * requirement it says so plainly. It is a test tool: its prompt sees the sheet, the product's
 * assessor never does. With no model, `fallbackJobAnswer` builds a plain answer from the
 * sheet's stories, and never claims anything the sheet does not hold.
 */
import type { UiLang } from "@/contracts";
import type { Db } from "@/db/client";
import { escoConcept } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { chatText, llmConfigured } from "@/lib/llm";
import type { Persona } from "./persona";

export type JobQuestion = {
  /** The requirement the question is about, as the plan holds it. */
  requirementText: string;
  question: string;
  /** True for a follow-up question on a requirement that was already answered. */
  followUp: boolean;
  /** What this person said before on this requirement, oldest first (for a follow-up). */
  earlier: string[];
};

const LANGUAGE_NAME: Record<UiLang, string> = { en: "English", fi: "Finnish", sv: "Swedish" };

const SAYINGS: Record<UiLang, { none: (closest: string) => string; nothingMore: string; noStory: string }> = {
  en: {
    none: (closest) => `I have not done that. The closest I have is this: ${closest}`,
    nothingMore: "I do not have anything to add to that.",
    noStory: "I have not done that, and I do not have anything close to it.",
  },
  fi: {
    none: (closest) => `En ole tehnyt sitä. Lähin kokemukseni on tämä: ${closest}`,
    nothingMore: "Minulla ei ole siihen mitään lisättävää.",
    noStory: "En ole tehnyt sitä enkä ole tehnyt mitään sen lähellä olevaa.",
  },
  sv: {
    none: (closest) => `Jag har inte gjort det. Det närmaste jag har är detta: ${closest}`,
    nothingMore: "Jag har inget att tillägga till det.",
    noStory: "Jag har inte gjort det och har inget som ligger nära det.",
  },
};

/** Words of four or more letters, lower case, cut to a five-letter stem so that "scheduling" meets "schedule". */
function stems(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of text.toLowerCase().match(/\p{L}{4,}/gu) ?? []) out.add(word.slice(0, 5));
  return out;
}

/** The persona's facts that share a word stem with the requirement, best overlap first, then in file order. */
export function relevantFacts(persona: Persona, requirementText: string): Persona["facts"] {
  const wanted = stems(requirementText);
  return persona.facts
    .map((fact, i) => {
      const own = stems(`${fact.label} ${fact.story}`);
      let overlap = 0;
      for (const s of wanted) if (own.has(s)) overlap++;
      return { fact, i, overlap };
    })
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || a.i - b.i)
    .map((x) => x.fact);
}

/**
 * The answer without a model. Built only from the sheet's own sentences: a story that shares
 * words with the requirement is told as it stands; otherwise the answer says plainly that the
 * person has not done this and offers the first story as the closest thing.
 */
export function fallbackJobAnswer(persona: Persona, q: JobQuestion): string {
  const say = SAYINGS[persona.interviewLang];
  const matches = relevantFacts(persona, q.requirementText);
  if (q.followUp) {
    const told = new Set(q.earlier.join(" ").split(/(?<=[.!?])\s+/).map((s) => s.trim()));
    const more = matches.find((f) => !told.has(f.story) && !q.earlier.some((e) => e.includes(f.story)));
    return more ? more.story : say.nothingMore;
  }
  if (matches.length > 0) return matches.slice(0, 2).map((f) => f.story).join(" ");
  const closest = persona.facts[0]?.story;
  return closest ? say.none(closest) : say.noStory;
}

function sheetText(persona: Persona, omitLabels: string[]): string {
  return [
    `Work: ${persona.occupationLabel}.`,
    "Things you have done (your own stories):",
    ...persona.facts.map((f) => `- ${f.label}: ${f.story}`),
    "How you have described your work before:",
    `- ${persona.answers.recent_work}`,
    `- ${persona.answers.example}`,
    `- ${persona.answers.tools}`,
    `- ${persona.answers.people}`,
    "Things you have NOT done, or never mention:",
    ...omitLabels.map((o) => `- ${o}`),
  ].join("\n");
}

/** The omitted skills as words: the persona file holds ESCO uris, the model needs labels. A uri with no label is left out, never shown raw. */
export async function omitLabels(db: Db | undefined, persona: Persona): Promise<string[]> {
  const uris = persona.omit.filter((o) => o.startsWith("http"));
  const plain = persona.omit.filter((o) => !o.startsWith("http"));
  if (!db || uris.length === 0) return plain;
  const rows = await db.select({ uri: escoConcept.uri, label: escoConcept.labelEn }).from(escoConcept).where(inArray(escoConcept.uri, uris));
  return [...plain, ...rows.map((r) => r.label)];
}

export function buildJobAnswerMessages(persona: Persona, q: JobQuestion, omitted: string[] = []) {
  const system = [
    "You play a job applicant in a simulated job interview for a software test. Answer as this one person would talk, in the first person.",
    `Write in ${LANGUAGE_NAME[persona.interviewLang]}. Two to five sentences, plain speech, no lists, no headings.`,
    "Use ONLY what the sheet below holds. Never invent a job, a tool, a result, a number or a person.",
    'If the sheet holds nothing for what is asked, say so plainly ("I have not done that. The closest I have is ...") and name the closest thing the sheet does hold.',
    "Things listed under NOT done are not part of your experience.",
    "Do not mention the sheet, the test or the interviewer's role. Do not mention age, family, health, nationality or religion.",
    "",
    "THE SHEET",
    sheetText(persona, omitted),
  ].join("\n");
  const user = q.followUp
    ? [
        `The requirement: ${q.requirementText}`,
        `You answered before: ${q.earlier.join(" ")}`,
        `Follow-up question: ${q.question}`,
        "Give the missing piece if the sheet holds it. If it does not, say in one sentence that you have nothing to add.",
      ].join("\n")
    : [`The requirement: ${q.requirementText}`, `Question: ${q.question}`].join("\n");
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

/** One model call per answer (role bulk, purpose `synth.job_answer`); a failed call falls back to the sheet. */
export async function answerJobQuestion(db: Db | undefined, persona: Persona, q: JobQuestion): Promise<string> {
  if (!llmConfigured("bulk")) return fallbackJobAnswer(persona, q);
  try {
    const omitted = await omitLabels(db, persona);
    const { text } = await chatText({
      role: "bulk",
      purpose: "synth.job_answer",
      messages: buildJobAnswerMessages(persona, q, omitted),
      maxTokens: 400,
      temperature: 0.4,
      db,
    });
    const clean = text.trim();
    return clean.length >= 5 ? clean : fallbackJobAnswer(persona, q);
  } catch {
    return fallbackJobAnswer(persona, q);
  }
}
