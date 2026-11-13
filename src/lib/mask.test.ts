import { describe, expect, it } from "vitest";
import { MASKED_EMPLOYER_WORD, employerTerms, maskEmployer } from "./mask";

describe("employerTerms", () => {
  it("gives the whole name, the name without its legal form, and a long first word", () => {
    expect(employerTerms("Acme Robotics Oy")).toEqual(["Acme Robotics Oy", "Acme Robotics", "Acme"]);
  });

  it("strips a legal form written first, and never returns a legal form as a term", () => {
    expect(employerTerms("Oy Acme Ab")).toEqual(["Oy Acme Ab", "Acme"]);
    expect(employerTerms("GmbH Holding")).not.toContain("GmbH");
  });

  it("merges several names and skips empty ones", () => {
    expect(employerTerms(null, "", "Real Oy", "Realtime Software Oy")).toEqual([
      "Realtime Software Oy",
      "Realtime Software",
      "Realtime",
      "Real Oy",
      "Real",
    ]);
  });

  it("leaves out a first word of three characters or fewer", () => {
    expect(employerTerms("ABB Oy")).toEqual(["ABB Oy", "ABB"]);
    expect(employerTerms("Up to Date Oy")).not.toContain("Up");
  });
});

describe("maskEmployer", () => {
  it("replaces the name in any case, with and without the legal form", () => {
    const text = "Data engineer at Acme Robotics Oy. ACME ROBOTICS builds arms; Acme is hiring.";
    expect(maskEmployer(text, "Acme Robotics Oy")).toBe(
      `Data engineer at ${MASKED_EMPLOYER_WORD}. ${MASKED_EMPLOYER_WORD} builds arms; ${MASKED_EMPLOYER_WORD} is hiring.`,
    );
  });

  it("accepts ready-made terms for several names", () => {
    const terms = employerTerms("Real Oy", "Posting Name Ltd");
    expect(maskEmployer("Posting Name Ltd is part of Real Oy.", terms)).toBe(
      `${MASKED_EMPLOYER_WORD} is part of ${MASKED_EMPLOYER_WORD}.`,
    );
  });

  it("returns the text unchanged for an empty name", () => {
    expect(maskEmployer("Nothing to hide here.", "  ")).toBe("Nothing to hide here.");
    expect(maskEmployer("Nothing to hide here.", [])).toBe("Nothing to hide here.");
  });

  it("treats the name as plain text, not as a pattern", () => {
    expect(maskEmployer("Work at C++ (Finland) Oy today.", "C++ (Finland) Oy")).toBe(`Work at ${MASKED_EMPLOYER_WORD} today.`);
  });
});

describe("maskEmployer word boundaries and inflection", () => {
  it("does not touch longer words that contain the name", () => {
    expect(maskEmployer("koneasentaja and Koneasentaja", "Kone Oyj")).toBe("koneasentaja and Koneasentaja");
    expect(maskEmployer("A really good, really.", "Real Oy")).toBe("A really good, really.");
    expect(maskEmployer("Realisations and SuperKone", "Real Oy")).toBe("Realisations and SuperKone");
  });

  it("swallows case endings, with colon or apostrophe", () => {
    const w = MASKED_EMPLOYER_WORD;
    expect(maskEmployer("Koneen tehdas, Nokialla, ABB:n, Acmes", employerTerms("Kone Oyj", "Nokia Oyj", "ABB Oy", "Acme Oy"))).toBe(
      `${w} tehdas, ${w}, ${w}, ${w}`,
    );
    expect(maskEmployer("Acme's office", "Acme Oy")).toBe(`${w} office`);
  });

  it("allows at most six ending letters and only lower case", () => {
    expect(maskEmployer("Nokiassaolevat Nokiassa", "Nokia Oyj")).toBe(`Nokiassaolevat ${MASKED_EMPLOYER_WORD}`);
    expect(maskEmployer("NOKIAN", "Nokia Oyj")).toBe("NOKIAN");
  });

  it("leaves a lower-case common noun alone for a single-word name", () => {
    expect(maskEmployer("Työ on kone ja Kone Oyj on yritys.", "Kone Oyj")).toBe(`Työ on kone ja ${MASKED_EMPLOYER_WORD} on yritys.`);
    expect(maskEmployer("Kone Oyj hakee", "Kone Oyj")).toBe(`${MASKED_EMPLOYER_WORD} hakee`);
  });

  it("matches multi-word names in any case and with an ending", () => {
    expect(maskEmployer("at acme robotics:n lab", "Acme Robotics Oy")).toBe(`at ${MASKED_EMPLOYER_WORD} lab`);
  });

  it("handles a name at the very start and end, and regex characters", () => {
    expect(maskEmployer("Kone", "Kone Oyj")).toBe(MASKED_EMPLOYER_WORD);
    expect(maskEmployer("Acme. Join Acme", "Acme Oy")).toBe(`${MASKED_EMPLOYER_WORD}. Join ${MASKED_EMPLOYER_WORD}`);
    expect(maskEmployer("A.B (x) Oy rocks", "A.B (x) Oy")).toBe(`${MASKED_EMPLOYER_WORD} rocks`);
    expect(maskEmployer("AxB Oy", "A.B Oy")).toBe("AxB Oy");
  });
});
