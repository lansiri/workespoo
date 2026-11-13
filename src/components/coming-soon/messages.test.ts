import { describe, expect, it } from "vitest";
import { comingSoonMessages } from "./messages";

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");

describe("coming-soon messages", () => {
  const keys = Object.keys(comingSoonMessages.en);

  it("has the same keys in every language", () => {
    expect(Object.keys(comingSoonMessages.fi).sort()).toEqual([...keys].sort());
    expect(Object.keys(comingSoonMessages.sv).sort()).toEqual([...keys].sort());
  });

  it("has a non-empty string for every key in every language", () => {
    for (const lang of ["en", "fi", "sv"] as const) {
      for (const key of keys) {
        const v = (comingSoonMessages[lang] as Record<string, string>)[key];
        expect(typeof v, `${lang}.${key}`).toBe("string");
        expect(v.trim().length, `${lang}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("uses the same placeholders in every language", () => {
    for (const key of keys) {
      const en = placeholders((comingSoonMessages.en as Record<string, string>)[key]);
      for (const lang of ["fi", "sv"] as const) {
        expect(placeholders((comingSoonMessages[lang] as Record<string, string>)[key]), `${lang}.${key}`).toBe(en);
      }
    }
  });
});
