import { describe, expect, it } from "vitest";
import { detectLang } from "./lang";

describe("detectLang", () => {
  it("detects English", () => {
    expect(detectLang("I was working in the warehouse and it was fun for my team")).toBe("en");
  });
  it("detects Finnish", () => {
    expect(detectLang("Olen tehnyt töitä hotellissa ja myös ravintolassa, se oli kivaa")).toBe("fi");
  });
  it("detects Swedish", () => {
    expect(detectLang("Jag jobbade på ett lager och det var bra, jag har också städat")).toBe("sv");
  });
  it("returns unknown below two stopword hits or on a tie", () => {
    expect(detectLang("warehouse")).toBe("unknown");
    expect(detectLang("forklift truck")).toBe("unknown");
    expect(detectLang("")).toBe("unknown");
    expect(detectLang("ja and")).toBe("unknown");
  });
  it("prefers the voice adapter's code", () => {
    expect(detectLang("warehouse", "fi-FI")).toBe("fi");
    expect(detectLang("I was in the", "sv_SE")).toBe("sv");
    expect(detectLang("anything", "de-DE")).toBe("de");
  });
});
