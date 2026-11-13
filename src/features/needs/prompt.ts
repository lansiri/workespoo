import type { Job } from "@/contracts";
import type { ChatMessage } from "@/lib/llm";
import { MAX_PROMPT_SENTENCES } from "./constants";

export type EscoPromptCandidate = { uri: string; labelEn: string; labelFi: string | null };

/** System message of docs/specs/prompts/need-card-draft.md, verbatim. */
export const NEED_CARD_SYSTEM_PROMPT = `You read one job posting and list what it asks of applicants. You write JSON only.

Rules:
1. Instructions are in English. The posting may be in Finnish, Swedish or English. Write every output text in plain English.
2. Each posting sentence has a label like [P6]. For every requirement, give the number of the ONE sentence it comes from in "sentence".
3. List only what the posting asks of the applicant: skills, tools, languages, education, experience, licences. Do not list duties, benefits or facts about the company.
4. One requirement per distinct ask. At most 12. If there are more, keep every "must" first, then "nice" in posting order. "text" is a short English phrase, at most 80 characters. Never include the employer's name.
5. "kind" is "must" when the sentence or its heading uses words like: edellytämme, edellytyksenä, vaadimme, sinulla on, hallitset, odotamme, required, must, you have, requirements, krav. "kind" is "nice" for: eduksi, katsotaan eduksi, arvostamme, plussaa, toivomme, nice to have, a plus, preferred, meriterande. If there is no such word, use "nice".
6. "category" is one of: skill, language, education, experience, authorisation, other.
   - language: a working language. Put the ISO code in "language" (fi, sv, en, ...).
   - experience: years or prior work. Put the number of years in "years" if stated.
   - authorisation: licence, certificate, card, security clearance, registration, work permit.
   - other: soft or vague asks such as "team player" or "stress tolerance".
7. "esco": up to 3 ids from the ESCO list (like "K4") that name the same skill. Only for skill, experience and education. Use [] if none fits. Never invent ids.
8. "statutory": "law" if the requirement is set by law for this job (public-sector language rules, licensed professions, security clearance, criminal record check, work permit), else "none".
9. "questionType": choose one, else "none":
   - "language": a must-have language requirement, and the work could plausibly start in another language. Never for English when the posting is written in English.
   - "years": a must-have number of years, 3 or more.
   - "degree": a must-have degree.
   - "tool": a must-have specific product or version where a comparable tool may transfer.
   - "vague": a vague or soft ask.
   Use "none" when statutory is "law".
10. "question": one polite question TO THE EMPLOYER that invites them to reconsider, following the pattern for its type. Never say the requirement is wrong, unnecessary, unrealistic or biased. No numbers except the years from the posting. null when questionType is "none".
   - language: "Is Finnish needed from day one, or could someone start in English and build up Finnish on the job?"
   - years: "Would someone who has done <work>, with fewer than <N> years, be worth a conversation?"
   - degree: "Would hands-on experience in <field> work instead of the degree?"
   - tool: "Would experience with a comparable tool be enough, if the person learns <tool> on the job?"
   - vague: "What does '<phrase>' look like in this job? One concrete example helps us find people who have done it."
11. "why": one neutral sentence, at most 140 characters, no numbers, saying what in the posting prompted the question. null when there is no question.
12. Never turn age, gender, nationality, ethnicity, religion, health, family status or appearance into a requirement. If a sentence asks for one, put its number in "dropped". "Native speaker", "mother tongue" and "experience in Finland" count as nationality: never write them in "text"; name the language level or the work instead.
13. "title": the role in plain English, at most 60 characters. "summary": at most 2 sentences about the work, no employer name.
14. Every requirement has all of these keys: text, kind, category, sentence, esco, language, years, statutory, questionType, question, why. Use null for language, years, question and why when they do not apply.`;

/** The user message template of the same document, filled in. */
export function buildDraftUserMessage(job: Job, candidates: EscoPromptCandidate[]): string {
  const sentences = job.sentences
    .slice(0, MAX_PROMPT_SENTENCES)
    .map((s, i) => `[P${i}] ${s}`)
    .join("\n");
  const esco = candidates.map((c, i) => `K${i + 1}: ${c.labelEn} / ${c.labelFi ?? c.labelEn}`).join("\n");
  return [
    `Posting language: ${job.lang}`,
    `Posting title: ${job.title}`,
    `Work languages listed by the source: ${job.workLanguages.length > 0 ? job.workLanguages.join(", ") : "none listed"}`,
    "",
    "Posting sentences:",
    sentences,
    "",
    'ESCO skills you may use in "esco":',
    esco,
    "",
    "Return JSON with keys: title, summary, requirements, dropped.",
  ].join("\n");
}

export function buildDraftMessages(job: Job, candidates: EscoPromptCandidate[]): ChatMessage[] {
  return [
    { role: "system", content: NEED_CARD_SYSTEM_PROMPT },
    { role: "user", content: buildDraftUserMessage(job, candidates) },
  ];
}
