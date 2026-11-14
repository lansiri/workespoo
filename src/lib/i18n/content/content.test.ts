import { describe, expect, it } from "vitest";
import type { UiLang } from "@/contracts";
import { CoverageArea } from "@/contracts";
import { findBannedEvaluative, findProtectedQuestion } from "@/lib/lexicon";
import { UI_LANGS } from "@/lib/i18n/types";
import {
  COMMAND_WORDS,
  FALLBACK_QUESTIONS,
  FILLER_WORDS,
  GENERIC_PROBE,
  INTERVIEW_LINES,
  NEUTRAL_ACKNOWLEDGEMENTS,
  PROBE_QUESTIONS,
  REPLY_LANGUAGE_INSTRUCTION,
  STOPWORDS,
  approvalCopy,
  cardCopy,
  consentCopy,
  coreCopy,
  dataCopy,
  errorCopy,
  howItWorks,
  interviewCopy,
  poolCopy,
} from "./index";

const messageGroups = {
  coreCopy,
  consentCopy,
  interviewCopy,
  cardCopy,
  approvalCopy,
  poolCopy,
  dataCopy,
  errorCopy,
};

/** Every string per language, labelled, across every module. */
function allStrings(lang: UiLang): [string, string][] {
  const out: [string, string][] = [];
  for (const [group, messages] of Object.entries(messageGroups)) {
    for (const [key, value] of Object.entries(messages[lang])) out.push([`${group}.${key}`, value]);
  }
  for (const [key, value] of Object.entries(INTERVIEW_LINES[lang])) out.push([`lines.${key}`, value]);
  NEUTRAL_ACKNOWLEDGEMENTS[lang].forEach((v, i) => out.push([`ack.${i}`, v]));
  for (const area of CoverageArea.options) {
    FALLBACK_QUESTIONS[lang][area].forEach((v, i) => out.push([`bank.${area}.${i}`, v]));
  }
  PROBE_QUESTIONS[lang].forEach((v, i) => out.push([`probe.${i}`, v]));
  out.push(["genericProbe", GENERIC_PROBE[lang]]);
  for (const kind of ["stop", "skip", "delete"] as const) {
    COMMAND_WORDS[lang][kind].forEach((v, i) => out.push([`command.${kind}.${i}`, v]));
  }
  FILLER_WORDS[lang].forEach((v, i) => out.push([`filler.${i}`, v]));
  STOPWORDS[lang].forEach((v, i) => out.push([`stopword.${i}`, v]));
  const page = howItWorks[lang];
  out.push(["how.title", page.title], ["how.intro", page.intro], ["how.credit", page.credit]);
  page.sections.forEach((s, i) => out.push([`how.${i}.heading`, s.heading], [`how.${i}.body`, s.body]));
  return out;
}

/** Everything the interviewer may say from a script. */
function spokenLines(lang: UiLang): [string, string][] {
  const out: [string, string][] = Object.entries(INTERVIEW_LINES[lang]);
  NEUTRAL_ACKNOWLEDGEMENTS[lang].forEach((v, i) => out.push([`ack.${i}`, v]));
  return [...out, ...questions(lang), ["genericProbe", GENERIC_PROBE[lang]]];
}

function questions(lang: UiLang): [string, string][] {
  const out: [string, string][] = [];
  for (const area of CoverageArea.options) {
    FALLBACK_QUESTIONS[lang][area].forEach((v, i) => out.push([`bank.${area}.${i}`, v]));
  }
  PROBE_QUESTIONS[lang].forEach((v, i) => out.push([`probe.${i}`, v]));
  return out;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
}

function sentenceCount(text: string): number {
  return text.split(/(?<=[.?!])\s+/).filter((s) => s.trim().length > 0).length;
}

/** Words that would only appear in Finnish or Swedish text if a string was left in English. */
const ENGLISH_TELLTALES =
  /\b(the|and|you|your|with|please|this|that|what|when|which|will|have|from|about|answer|notes?|delete|remove|approve)\b/i;

describe("content completeness", () => {
  it.each(UI_LANGS)("every %s string is non-empty and has no TODO", (lang) => {
    for (const [label, value] of allStrings(lang)) {
      expect(value.trim(), label).not.toBe("");
      expect(value, label).not.toMatch(/TODO|FIXME|XXX/);
    }
  });

  it.each(["fi", "sv"] as const)("%s strings carry no leftover English", (lang) => {
    for (const [label, value] of allStrings(lang)) {
      // Product and source names may stay in English.
      const stripped = value.replace(/Signal Card|WorkEspoo|Rethinking Recruitment|Birch-27|Junction 2026/g, "");
      expect(stripped, label).not.toMatch(ENGLISH_TELLTALES);
    }
  });

  it("every language has the same number of sections on the How this works page", () => {
    const counts = UI_LANGS.map((lang) => howItWorks[lang].sections.length);
    expect(new Set(counts).size).toBe(1);
  });

  it("every area has at least three fallback questions in every language", () => {
    for (const lang of UI_LANGS) {
      for (const area of CoverageArea.options) {
        expect(FALLBACK_QUESTIONS[lang][area].length, `${lang}.${area}`).toBeGreaterThanOrEqual(3);
      }
      expect(PROBE_QUESTIONS[lang].length).toBeGreaterThanOrEqual(3);
    }
  });

  it("has a reply-language instruction for every language and for anything else", () => {
    expect(Object.keys(REPLY_LANGUAGE_INSTRUCTION).sort()).toEqual(["en", "fi", "other", "sv"]);
  });
});

describe("interviewer wording", () => {
  it.each(UI_LANGS)("%s scripted lines and questions pass both lexicon checks", (lang) => {
    for (const [label, value] of spokenLines(lang)) {
      expect(findBannedEvaluative(value), `${lang}.${label}: ${value}`).toEqual([]);
      expect(findProtectedQuestion(value), `${lang}.${label}: ${value}`).toEqual([]);
    }
  });

  it.each(UI_LANGS)("%s questions have one question mark and at most two sentences", (lang) => {
    for (const [label, value] of [...questions(lang), ["genericProbe", GENERIC_PROBE[lang]] as [string, string]]) {
      expect(value.split("?").length - 1, `${lang}.${label}`).toBe(1);
      expect(sentenceCount(value), `${lang}.${label}`).toBeLessThanOrEqual(2);
      // Spoken by text-to-speech: no brackets, slashes or symbols.
      expect(value, `${lang}.${label}`).not.toMatch(/[()[\]/\\&%#@*+=<>"]/);
    }
  });

  it.each(UI_LANGS)("%s scripted lines contain no symbols that read badly aloud", (lang) => {
    for (const [label, value] of Object.entries(INTERVIEW_LINES[lang])) {
      expect(value, `${lang}.${label}`).not.toMatch(/[()[\]/\\&%#@*+=<>"]/);
    }
  });

  it.each(UI_LANGS)("%s probe templates contain {phrase}", (lang) => {
    for (const template of PROBE_QUESTIONS[lang]) expect(template).toContain("{phrase}");
  });

  it.each(UI_LANGS)("%s openings say it is an AI and ask exactly one question", (lang) => {
    const aiWord = { en: /\bAI\b/, fi: /tekoäly/, sv: /\bAI-/ }[lang];
    for (const opening of [INTERVIEW_LINES[lang].openingExpress, INTERVIEW_LINES[lang].openingFull]) {
      expect(opening).toMatch(aiWord);
      expect(opening.split("?").length - 1).toBe(1);
      expect(opening.trim().endsWith("?")).toBe(true);
    }
  });
});

describe("commands and language detection", () => {
  it.each(UI_LANGS)("%s commands fit the pre-check length limits", (lang) => {
    const words = (s: string) => s.trim().split(/\s+/).length;
    for (const c of COMMAND_WORDS[lang].stop) expect(words(c), c).toBeLessThanOrEqual(4);
    for (const c of COMMAND_WORDS[lang].skip) expect(words(c), c).toBeLessThanOrEqual(4);
    for (const c of COMMAND_WORDS[lang].delete) expect(words(c), c).toBeLessThanOrEqual(6);
  });

  it("no command phrase means two different things", () => {
    const seen = new Map<string, string>();
    for (const lang of UI_LANGS) {
      for (const kind of ["stop", "skip", "delete"] as const) {
        for (const phrase of COMMAND_WORDS[lang][kind]) {
          const key = phrase.toLowerCase();
          const before = seen.get(key);
          if (before) expect(before, phrase).toBe(kind);
          seen.set(key, kind);
        }
      }
    }
  });

  it("stopword lists do not overlap across languages", () => {
    const owner = new Map<string, UiLang>();
    for (const lang of UI_LANGS) {
      for (const word of STOPWORDS[lang]) {
        expect(owner.get(word), `"${word}" is in ${owner.get(word)} and ${lang}`).toBeUndefined();
        owner.set(word, lang);
      }
    }
  });

  it("stopword lists are of similar size", () => {
    for (const lang of UI_LANGS) expect(STOPWORDS[lang].length).toBeGreaterThanOrEqual(13);
  });
});

describe("placeholders", () => {
  it("message groups use the same placeholders in every language", () => {
    for (const [group, messages] of Object.entries(messageGroups)) {
      for (const key of Object.keys(messages.en)) {
        const expected = placeholders((messages.en as Record<string, string>)[key]!);
        for (const lang of UI_LANGS) {
          const value = (messages[lang] as Record<string, string>)[key]!;
          expect(placeholders(value), `${group}.${key}.${lang}`).toEqual(expected);
        }
      }
    }
  });

  it("interview lines and the How this works page use the same placeholders in every language", () => {
    for (const key of Object.keys(INTERVIEW_LINES.en) as (keyof typeof INTERVIEW_LINES.en)[]) {
      for (const lang of UI_LANGS) {
        expect(placeholders(INTERVIEW_LINES[lang][key]), `${key}.${lang}`).toEqual(
          placeholders(INTERVIEW_LINES.en[key]),
        );
      }
    }
    const pageKeys = (lang: UiLang) => {
      const p = howItWorks[lang];
      return [p.title, p.intro, p.credit, ...p.sections.flatMap((s) => [s.heading, s.body])].map(placeholders);
    };
    for (const lang of UI_LANGS) expect(pageKeys(lang), lang).toEqual(pageKeys("en"));
  });

  it("the consent copy names the speech processor and the 24-hour deletion", () => {
    for (const lang of UI_LANGS) {
      expect(consentCopy[lang].checkVoice).toContain("{processor}");
      expect(consentCopy[lang].checkLiveDemo).toContain("24");
    }
  });

  it("the own-server voice consent exists in three languages, has no placeholder and names WorkEspoo", () => {
    for (const lang of UI_LANGS) {
      const text = consentCopy[lang].checkVoiceServer;
      expect(text.length, lang).toBeGreaterThan(40);
      expect(text, lang).not.toMatch(/\{\w+\}/);
      expect(text, lang).toMatch(/WorkEspoo/);
    }
  });

  it("the credit names the speech model and the voice", () => {
    for (const lang of UI_LANGS) {
      expect(howItWorks[lang].credit, lang).toMatch(/Parakeet TDT 0\.6b v3.*CC BY 4\.0.*sherpa-onnx.*Piper/);
    }
  });
});
