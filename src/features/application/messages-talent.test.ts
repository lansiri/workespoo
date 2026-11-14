import { describe, expect, it } from "vitest";
import { findBannedEvaluative, findProtectedQuestion } from "@/lib/lexicon";
import { UI_LANGS } from "@/lib/i18n/types";
import { applyMessages } from "./messages-talent";

/** Words that would only appear in Finnish or Swedish text if a string was left in English (as content.test.ts). */
const ENGLISH_TELLTALES = /\b(the|and|you|your|with|please|this|that|what|when|which|will|have|from|about|answer|notes?|delete|remove|approve)\b/i;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe("job interview texts of the person's screens", () => {
  it("every key exists in all three languages, non-empty, without TODO", () => {
    const keys = Object.keys(applyMessages.en).sort();
    for (const lang of UI_LANGS) {
      expect(Object.keys(applyMessages[lang]).sort(), lang).toEqual(keys);
      for (const [key, value] of Object.entries(applyMessages[lang])) {
        expect(value.trim(), `${lang}.${key}`).not.toBe("");
        expect(value, `${lang}.${key}`).not.toMatch(/TODO|FIXME|XXX/);
      }
    }
  });

  it("uses the same placeholders in every language", () => {
    for (const key of Object.keys(applyMessages.en) as (keyof typeof applyMessages.en)[]) {
      for (const lang of UI_LANGS) expect(placeholders(applyMessages[lang][key]), `${lang}.${key}`).toEqual(placeholders(applyMessages.en[key]));
    }
  });

  it.each(["fi", "sv"] as const)("%s carries no leftover English", (lang) => {
    for (const [key, value] of Object.entries(applyMessages[lang])) {
      const stripped = value.replace(/Signal Card|WorkEspoo|Espoo|AI/g, "");
      expect(stripped, `${lang}.${key}`).not.toMatch(ENGLISH_TELLTALES);
    }
  });

  it.each(UI_LANGS)("%s: nothing the room shows praises, names a level or asks about a protected matter", (lang) => {
    for (const [key, value] of Object.entries(applyMessages[lang])) {
      if (!key.startsWith("room")) continue;
      expect(findBannedEvaluative(value), `${lang}.${key}: ${value}`).toEqual([]);
      expect(findProtectedQuestion(value), `${lang}.${key}: ${value}`).toEqual([]);
    }
  });

  it.each(UI_LANGS)("%s: the start screen asks about no protected matter", (lang) => {
    for (const [key, value] of Object.entries(applyMessages[lang])) {
      if (!key.startsWith("start")) continue;
      expect(findProtectedQuestion(value), `${lang}.${key}: ${value}`).toEqual([]);
    }
  });

  it("the start screen has the owner's wording, word for word", () => {
    expect(applyMessages.en.startTitle).toBe("A job interview for {title}");
    expect(applyMessages.fi.startTitle).toBe("Työhaastattelu: {title}");
    expect(applyMessages.sv.startTitle).toBe("Jobbintervju: {title}");
    expect(applyMessages.en.startPoint2).toBe("After you send your application, an AI rates your answers against each thing the ad asks for, and the applicants are put in order.");
    expect(applyMessages.fi.startPoint5).toBe("Mitään ei lähetetä ennen kuin painat Lähetä hakemukseni, ja voit perua hakemuksen milloin tahansa.");
    expect(applyMessages.sv.startTick).toBe("Jag godkänner att en AI bedömer mina svar i den här jobbintervjun och att de sökande ordnas.");
    expect(applyMessages.en.startButton).toBe("Start the job interview");
    expect(applyMessages.fi.startButton).toBe("Aloita työhaastattelu");
    expect(applyMessages.sv.startButton).toBe("Börja jobbintervjun");
  });

  it("says the ratings are made by an AI and checked by an organiser", () => {
    expect(applyMessages.en.resultOrganiser).toBe("An organiser checks the order of applicants before the company sees it");
    expect(applyMessages.en.resultPosition).toBe("You are number {n} of {m} on the list the company sees");
    expect(applyMessages.en.resultPoints).toBe("{n} of {m} points");
  });
});

describe("the way in from the matches page", () => {
  it("has the link box in all three languages", async () => {
    const { matchesMessages } = await import("@/features/matching/messages");
    for (const lang of UI_LANGS) {
      for (const key of ["railApplyTitle", "railApplyBody", "railApplyLink"] as const) expect(matchesMessages[lang][key].length, `${lang}.${key}`).toBeGreaterThan(3);
    }
    expect(matchesMessages.en.railApplyTitle).toBe("Jobs at this event you can apply for");
  });
});
