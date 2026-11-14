import { describe, expect, it } from "vitest";
import type { UiLang } from "@/contracts";
import { findBannedEvaluative, findProtectedQuestion } from "@/lib/lexicon";
import { APPLICATION_LINES, bridgeFor, closingLine, openingLine, scriptedFollowUp, scriptedQuestion } from "./lines";

const LANGS: UiLang[] = ["en", "fi", "sv"];

describe("scripted lines of the job interview", () => {
  it("are complete in three languages and carry their placeholders", () => {
    for (const lang of LANGS) {
      const l = APPLICATION_LINES[lang];
      expect(l.opening).toContain("{title}");
      expect(l.opening).toContain("{n}");
      expect(l.question).toContain("{requirement}");
      expect(l.bridges).toHaveLength(3);
      for (const text of [l.followUp, l.closing, l.closingStopped, ...l.bridges]) expect(text.trim().length).toBeGreaterThan(3);
    }
  });

  it("never evaluate, ask about protected matters or leave a placeholder behind", () => {
    for (const lang of LANGS) {
      const lines = [
        openingLine(lang, "Warehouse specialist", 3),
        scriptedQuestion(lang, "Booking goods in SAP"),
        scriptedFollowUp(lang),
        closingLine(lang, false),
        closingLine(lang, true),
        ...APPLICATION_LINES[lang].bridges,
      ];
      for (const line of lines) {
        expect({ lang, line, hits: findBannedEvaluative(line) }).toEqual({ lang, line, hits: [] });
        expect({ lang, line, hits: findProtectedQuestion(line) }).toEqual({ lang, line, hits: [] });
        expect(line).not.toMatch(/[{}]/);
        expect(line).not.toMatch(/\b(thanks?|thank you|kiitos|tack)\b/i);
      }
    }
  });

  it("keeps the scripted question within 300 characters even for a long requirement", () => {
    const long = "word ".repeat(60);
    for (const lang of LANGS) {
      const q = scriptedQuestion(lang, long);
      expect(q.length).toBeLessThanOrEqual(300);
      expect(q.match(/\?/g)).toHaveLength(1);
    }
  });

  it("rotates the neutral bridges", () => {
    expect([1, 2, 3, 4].map((i) => bridgeFor("en", i))).toEqual(["Next.", "The ad also asks for this.", "Another one from the ad.", "Next."]);
  });
});
