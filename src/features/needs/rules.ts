import type { Job, QuestionType, RequirementCategory, RequirementKind, RequirementQuestion, Statutory } from "@/contracts";
import { findProtectedCard } from "@/lib/lexicon";
import { QUESTION_TEXT_MAX, WHY_MAX, YEARS_QUESTION_MIN_YEARS } from "./constants";

// ---------- statutory class (need-card.md 4.3) ----------

const PUBLIC_EMPLOYER_NAME =
  /kaupunki|kunta\b|kuntayhtymä|hyvinvointialue|virasto|ministeriö|valtion|city of|municipality|wellbeing services/i;
const LANGUAGE_ACT_SENTENCE =
  /kielitaitolaki|424\/2003|kielitaitovaatimus|julkisyhteisö|virkaan|tehtävään vaadittava kielitaito/i;
const LICENCE =
  /laillistettu|valvira|terhikki|ammattioikeus|kelpoisuus|pätevyys|ajokortti|ammattipätevyys|hygieniapassi|työturvallisuuskortti|tulityökortti|sähköpätevyys|anniskelupassi|registered nurse|licen[cs]ed?|driving licen[cs]e|qualification required/i;
const CLEARANCE = /turvallisuusselvitys|security clearance|rikostaustaote|criminal record/i;
const OTHER_LAW = /työlupa|oleskelulupa|work permit|right to work|residence permit/i;

/** A work-permit or right-to-work requirement: never questioned and never counted. */
export function isWorkPermitText(text: string): boolean {
  return OTHER_LAW.test(text);
}

export type StatutoryInput = {
  category: RequirementCategory;
  text: string;
  /** The posting sentence the requirement cites, or null. */
  sentence: string | null;
  /** The model's cue: it thinks the law sets this requirement. */
  modelLaw: boolean;
  job: Pick<Job, "source" | "sector" | "employerName">;
};

export function isPublicEmployer(job: Pick<Job, "source" | "sector" | "employerName">): boolean {
  return job.source === "kuntarekry" || job.sector === "public" || PUBLIC_EMPLOYER_NAME.test(job.employerName);
}

/** Categories whose cited sentence is checked as well as the requirement's own text. */
const SENTENCE_CHECKED: ReadonlySet<RequirementCategory> = new Set(["authorisation", "language", "education"]);

/**
 * OR of the model's cue and the keyword rules. Rules look at the requirement's own text, and
 * for authorisation, language and education also at the cited sentence (a skill that shares a
 * long sentence with a licence is not itself a licence). A model cue with no keyword hit
 * becomes `other_law`.
 */
export function classifyStatutory(input: StatutoryInput): Statutory {
  const haystack = [input.text, SENTENCE_CHECKED.has(input.category) ? (input.sentence ?? "") : ""].join("\n");
  if (OTHER_LAW.test(haystack)) return "other_law";
  if (CLEARANCE.test(haystack)) return "clearance";
  if (
    input.category === "language" &&
    (isPublicEmployer(input.job) || LANGUAGE_ACT_SENTENCE.test(input.sentence ?? ""))
  ) {
    return "language_act";
  }
  if (LICENCE.test(haystack)) return "licence";
  return input.modelLaw ? "other_law" : "none";
}

// ---------- protected-attribute checks ----------

/** Language names also appear in the lexicon's country list; asking for a language is work-related. */
const LANGUAGE_NAMES =
  /(?<![\p{L}])(?:English|Swedish|Danish|Norwegian|German|French|Spanish|Italian|Russian|Estonian|Dutch|Polish|Portuguese|Chinese|Japanese|Korean|Arabic|Persian|Turkish|Greek|Hungarian|Czech|Ukrainian|Somali|Thai|Vietnamese)(?![\p{L}])/giu;

/** Protected terms in a requirement text or a cited posting sentence. Language names are not hits. */
export function protectedHits(text: string): string[] {
  return findProtectedCard(text.replace(LANGUAGE_NAMES, " "));
}

const COMPANY_TEXT_PROTECTED =
  /(?<![\p{L}\p{N}])(?:age|years old|young|nuori|ikä|gender|male|female|mies|nainen|nationality|kansalai\p{L}*|native|äidinkieli|syntyperä|religio\p{L}*|uskonto|health|terveys|pregnan\p{L}*|raskau\p{L}*|family|perhe|photo|kuva)(?![\p{L}\p{N}])/iu;

export const PROTECTED_TEXT_MESSAGE =
  "This describes a personal characteristic, not the work. Describe the skill or language level the work needs instead.";
export const NATIVE_HINT = "Try 'fluent working Finnish'.";

/** Company-written text that describes a person rather than the work (need-card.md 6, rule 3). */
export function companyTextProblem(text: string): { hint: string | null } | null {
  if (!COMPANY_TEXT_PROTECTED.test(text) && protectedHits(text).length === 0) return null;
  return { hint: /native/i.test(text) ? NATIVE_HINT : null };
}

// ---------- questions (need-card.md 4) ----------

const FORBIDDEN_QUESTION_WORDS =
  /(?<![\p{L}])(?:unnecessary|unrealistic|excessive|discriminat\p{L}*|bias\p{L}*|illegal|should|must not|too|wrong|outdated)(?![\p{L}])/iu;

export function hasForbiddenWord(text: string): boolean {
  return FORBIDDEN_QUESTION_WORDS.test(text);
}

const QUESTION_PATTERNS: Record<Exclude<QuestionType, "language">, RegExp> = {
  years: /^Would someone who has done .+, with fewer than \d+ years, be worth a conversation\?$/,
  degree: /^Would hands-on experience in .+ work instead of the degree\?$/,
  tool: /^Would experience with a comparable tool be enough, if the person learns .+ on the job\?$/,
  vague: /^What does '.+' look like in this job\? One concrete example helps us find people who have done it\.$/,
};

export const DEFAULT_WHY: Record<QuestionType, string> = {
  language: "The posting does not say which tasks need this language.",
  years: "Many people describe this work without counting years.",
  degree: "The posting does not name a specific field of study.",
  tool: "Many people have used comparable tools for the same work.",
  vague: "The posting does not say what this means in practice.",
};

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });
/** English name of an ISO 639-1 code ("fi" gives "Finnish"); the code itself when unknown. */
export function languageName(code: string): string {
  try {
    return languageNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export function languageQuestionText(code: string): string {
  const language = languageName(code);
  return `Is ${language} needed from day one, or could someone start in English and build up ${language} on the job?`;
}

const YEARS_IN_TEXT = /(\d{1,2})\s*\+?\s*(?:years?|yrs?|vuo(?:tta|den)|år)/i;

/** The year count a requirement asks for: the model's number, else one written in the text or sentence. */
export function yearsAsked(modelYears: number | null, text: string, sentence: string | null): number | null {
  if (modelYears !== null && modelYears > 0) return modelYears;
  const m = YEARS_IN_TEXT.exec(text) ?? (sentence ? YEARS_IN_TEXT.exec(sentence) : null);
  return m ? Number(m[1]) : null;
}

/** "5 years of Java development" gives "Java development". Empty when nothing remains. */
function workPhrase(text: string): string {
  return text
    .replace(/\d{1,2}\s*\+?\s*(?:years?|yrs?)\s*(?:of|in)?\s*/i, "")
    .replace(/^experience (?:of|in|with)\s+/i, "")
    .trim();
}

export type QuestionInput = {
  category: RequirementCategory;
  kind: RequirementKind;
  statutory: Statutory;
  text: string;
  sentence: string | null;
  languageCode: string | null;
  jobLang: string;
  model: { years: number | null; questionType: QuestionType | "none"; question: string | null; why: string | null };
};

/**
 * Decide the question a requirement keeps at draft time: the model proposes, code checks.
 * Rules that depend on the pool (need-card.md 4.2.3 and 4.2.5) are applied when the card is
 * shown (see `visibleQuestionIds`), because the pool is not known yet.
 */
export function decideQuestion(input: QuestionInput): RequirementQuestion | null {
  const { category, kind, statutory, model } = input;
  const type = model.questionType;
  if (type === "none") return null;
  if (statutory !== "none") return null; // 4.2.1
  if (kind === "nice" && type !== "vague") return null; // 4.2.2

  let text: string | null = null;
  switch (type) {
    case "language": {
      if (category !== "language" || kind !== "must" || !input.languageCode) break;
      // An English requirement has no "other language to start in".
      if (input.languageCode === "en") break;
      text = languageQuestionText(input.languageCode);
      break;
    }
    case "years": {
      if (category !== "experience" || kind !== "must") break;
      const years = yearsAsked(model.years, input.text, input.sentence);
      if (years === null || years < YEARS_QUESTION_MIN_YEARS) break;
      if (model.question && QUESTION_PATTERNS.years.test(model.question) && model.question.includes(`fewer than ${years} years`)) {
        text = model.question;
        break;
      }
      const work = workPhrase(input.text);
      if (work) text = `Would someone who has done ${work}, with fewer than ${years} years, be worth a conversation?`;
      break;
    }
    case "degree": {
      if (category !== "education" || kind !== "must") break;
      if (model.question && QUESTION_PATTERNS.degree.test(model.question)) text = model.question;
      break;
    }
    case "tool": {
      if (category !== "skill" || kind !== "must") break;
      if (model.question && QUESTION_PATTERNS.tool.test(model.question)) text = model.question;
      break;
    }
    case "vague": {
      if (category !== "other") break;
      if (model.question && QUESTION_PATTERNS.vague.test(model.question)) {
        text = model.question;
      } else if (input.text) {
        text = `What does '${input.text}' look like in this job? One concrete example helps us find people who have done it.`;
      }
      break;
    }
  }
  if (!text || text.length > QUESTION_TEXT_MAX) return null;
  if (hasForbiddenWord(text)) return null; // 4.2.4

  let why = (model.why ?? "").trim();
  if (!why || why.length > WHY_MAX || /\d/.test(why) || hasForbiddenWord(why)) why = DEFAULT_WHY[type];
  return { type, text, why, answer: null };
}
