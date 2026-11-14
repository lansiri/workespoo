import type { UiLang } from "@/contracts";
import { INTERVIEW_LINES } from "@/lib/i18n/content/interview-lines";

/**
 * Everything the job interviewer says from a script, in English, Finnish and Swedish
 * (docs/specs/job-interview.md section 5). The wording is fixed by the brief. Placeholders are
 * `{title}`, `{n}` and `{requirement}`. No line praises, thanks or comments on an answer.
 */
export interface ApplicationLines {
  opening: string;
  /** Short neutral lead-ins before the next question, used in turn. */
  bridges: [string, string, string];
  question: string;
  followUp: string;
  closing: string;
  closingStopped: string;
}

export const APPLICATION_LINES: Record<UiLang, ApplicationLines> = {
  en: {
    opening:
      "This interview is about one job: {title}. I'll ask about {n} things the ad asks for, one at a time. I only take notes. Afterwards an AI rates your answers against the ad, and an organiser checks the order of applicants. Here is the first one.",
    bridges: ["Next.", "The ad also asks for this.", "Another one from the ad."],
    question:
      "The ad asks for this: {requirement}. Tell me about a time you did this yourself. What was the situation, and what did you do?",
    followUp: "Could you give one concrete example from your own work?",
    closing: "That was the last one. Look through your answers, then send your application.",
    closingStopped: "We'll stop here. Look through your answers; you can send the application as it is.",
  },
  fi: {
    opening:
      "Tämä haastattelu koskee yhtä työtä: {title}. Kysyn {n} asiasta, joita ilmoituksessa pyydetään, yksi kerrallaan. Teen vain muistiinpanoja. Sen jälkeen tekoäly arvioi vastauksesi ilmoitusta vasten, ja järjestäjä tarkistaa hakijoiden järjestyksen. Tässä ensimmäinen.",
    bridges: ["Seuraava.", "Ilmoituksessa pyydetään myös tätä.", "Vielä yksi ilmoituksesta."],
    question:
      "Ilmoituksessa pyydetään tätä: {requirement}. Kerro tilanteesta, jossa teit tätä itse. Mikä tilanne oli, ja mitä teit?",
    followUp: "Voisitko kertoa yhden konkreettisen esimerkin omasta työstäsi?",
    closing: "Se oli viimeinen. Käy vastauksesi läpi ja lähetä sitten hakemuksesi.",
    closingStopped: "Lopetetaan tähän. Käy vastauksesi läpi; voit lähettää hakemuksen tällaisenaan.",
  },
  sv: {
    opening:
      "Den här intervjun gäller ett jobb: {title}. Jag frågar om {n} saker som annonsen efterfrågar, en i taget. Jag antecknar bara. Efteråt bedömer en AI dina svar mot annonsen, och en arrangör kontrollerar ordningen på de sökande. Här är den första.",
    bridges: ["Nästa.", "Annonsen efterfrågar också det här.", "En till från annonsen."],
    question:
      "Annonsen efterfrågar det här: {requirement}. Berätta om ett tillfälle då du gjorde det själv. Vad var situationen, och vad gjorde du?",
    followUp: "Kan du ge ett konkret exempel från ditt eget arbete?",
    closing: "Det var den sista. Gå igenom dina svar och skicka sedan ansökan.",
    closingStopped: "Vi stannar här. Gå igenom dina svar; du kan skicka ansökan som den är.",
  },
};

/** The longest requirement text put into the scripted question, so the question stays within 300 characters. */
const REQUIREMENT_IN_QUESTION_MAX = 150;

function clip(text: string, max: number): string {
  const t = text.trim().replace(/[.!?]+$/, "");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return (at > max / 2 ? cut.slice(0, at) : cut).trim();
}

export function openingLine(lang: UiLang, title: string, n: number): string {
  return APPLICATION_LINES[lang].opening.replace("{title}", clip(title, 100)).replace("{n}", String(n));
}

/** The question the code words for a requirement when the model's is missing or refused. */
export function scriptedQuestion(lang: UiLang, requirementText: string): string {
  return APPLICATION_LINES[lang].question.replace("{requirement}", clip(requirementText, REQUIREMENT_IN_QUESTION_MAX));
}

export function scriptedFollowUp(lang: UiLang): string {
  return APPLICATION_LINES[lang].followUp;
}

/** The bridge before the question at plan position `index` (0-based, at least 1). */
export function bridgeFor(lang: UiLang, index: number): string {
  const bridges = APPLICATION_LINES[lang].bridges;
  return bridges[Math.max(0, index - 1) % bridges.length]!;
}

export const closingLine = (lang: UiLang, stopped: boolean): string =>
  stopped ? APPLICATION_LINES[lang].closingStopped : APPLICATION_LINES[lang].closing;

/** The general interview's lines that fit here (empty answer, "delete that"). */
export const repairLine = (lang: UiLang): string => INTERVIEW_LINES[lang].repair;
export const deletedLine = (lang: UiLang): string => INTERVIEW_LINES[lang].deleted;
