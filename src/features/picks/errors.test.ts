import { describe, expect, it } from "vitest";
import { companyErrorLine, companyMessages, organiserErrorLine, organiserMessages } from "./messages";

describe("server error codes are shown in the page language", () => {
  for (const lang of ["en", "fi", "sv"] as const) {
    it(`${lang}: known codes are translated, unknown ones get the generic line`, () => {
      const o = organiserMessages[lang];
      const c = companyMessages[lang];
      expect(organiserErrorLine(o, "undecided")).toBe(o.errUndecided);
      expect(organiserErrorLine(o, "protected_note")).toBe(o.errProtectedNote);
      expect(organiserErrorLine(o, "weird")).toBe(o.errGeneric);
      expect(organiserErrorLine(o, null)).toBe(o.errGeneric);
      expect(companyErrorLine(c, "already_requested")).toBe(c.errAlreadyRequested);
      expect(companyErrorLine(c, null)).toBe(c.errGeneric);
      if (lang !== "en") expect(o.errUndecided).not.toBe(organiserMessages.en.errUndecided);
    });
  }
});
