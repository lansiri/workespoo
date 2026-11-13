import { describe, expect, it } from "vitest";
import {
  UI_LANGS,
  fmt,
  matchAcceptLanguage,
  pick,
  uiLangCookieString,
  type Messages,
} from "./index";
import { siteMessages } from "@/components/site/messages";

describe("fmt", () => {
  it("replaces placeholders", () => expect(fmt("{count} postings", { count: 3 })).toBe("3 postings"));
  it("replaces repeated placeholders", () => expect(fmt("{a}-{a}-{b}", { a: "x", b: 0 })).toBe("x-x-0"));
  it("leaves unknown placeholders visible", () => expect(fmt("Hi {name}, {n}", { n: 2 })).toBe("Hi {name}, 2"));
  it("does not throw on odd input", () => {
    expect(fmt("no placeholders", {})).toBe("no placeholders");
    expect(fmt("{toString}", {})).toBe("{toString}");
  });
});

describe("pick", () => {
  const m = { en: { a: "A" }, fi: { a: "Ä" }, sv: { a: "Å" } } satisfies Messages<{ a: string }>;
  it("selects the language", () => {
    expect(pick(m, "fi").a).toBe("Ä");
    expect(pick(m, "sv").a).toBe("Å");
    expect(pick(m, "en").a).toBe("A");
  });
});

describe("matchAcceptLanguage", () => {
  it("respects q-values", () => expect(matchAcceptLanguage("en;q=0.5, sv;q=0.9")).toBe("sv"));
  it("maps regional variants", () => {
    expect(matchAcceptLanguage("sv-FI")).toBe("sv");
    expect(matchAcceptLanguage("sv-SE,sv;q=0.9")).toBe("sv");
    expect(matchAcceptLanguage("fi-FI")).toBe("fi");
  });
  it("ignores unsupported languages", () => {
    expect(matchAcceptLanguage("nb, da;q=0.9")).toBeNull();
    expect(matchAcceptLanguage("nb, da, fi;q=0.1")).toBe("fi");
  });
  it("ignores q=0 and empty", () => {
    expect(matchAcceptLanguage("fi;q=0, en;q=0.1")).toBe("en");
    expect(matchAcceptLanguage("")).toBeNull();
    expect(matchAcceptLanguage(null)).toBeNull();
  });
});

describe("uiLangCookieString", () => {
  it("is one year, SameSite=Lax, path /", () => {
    expect(uiLangCookieString("sv")).toBe("ui_lang=sv; Path=/; Max-Age=31536000; SameSite=Lax");
  });
});

describe("Messages type", () => {
  it("rejects a missing key in one language", () => {
    const incomplete: Messages<{ a: string; b: string }> = {
      en: { a: "1", b: "2" },
      fi: { a: "1", b: "2" },
      // @ts-expect-error sv lacks "b"
      sv: { a: "1" },
    };
    expect(incomplete).toBeDefined();
  });
});

describe("site messages", () => {
  it("has the same non-empty keys in every language", () => {
    const keys = Object.keys(siteMessages.en);
    for (const lang of UI_LANGS) {
      expect(Object.keys(siteMessages[lang]).sort()).toEqual([...keys].sort());
      for (const k of keys) {
        expect((siteMessages[lang] as Record<string, string>)[k].trim(), `${lang}.${k}`).not.toBe("");
      }
    }
  });
});
