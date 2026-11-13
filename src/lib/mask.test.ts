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
    const text = "Data engineer at Acme Robotics Oy. ACME ROBOTICS builds arms; acme is hiring.";
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
