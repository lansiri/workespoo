import { describe, expect, it } from "vitest";
import {
  MAX_WORDS_PER_SENTENCE,
  labelSentences,
  renderEvidence,
  splitSentences,
} from "./sentences";

describe("splitSentences", () => {
  it("returns nothing for empty or whitespace input", () => {
    expect(splitSentences("")).toEqual([]);
    expect(splitSentences("   \n\t ")).toEqual([]);
  });

  it("splits on sentence punctuation followed by a capital letter", () => {
    expect(
      splitSentences("I led the migration. It took six months! Would I do it again? Yes."),
    ).toEqual(["I led the migration.", "It took six months!", "Would I do it again?", "Yes."]);
  });

  it("keeps decimals, versions and abbreviations together", () => {
    expect(splitSentences("We moved to Python 3.12 in 2024. It cut costs by 3.5 percent.")).toEqual(
      ["We moved to Python 3.12 in 2024.", "It cut costs by 3.5 percent."],
    );
    expect(splitSentences("I used tools e.g. Terraform and Ansible. They worked.")).toEqual([
      "I used tools e.g. Terraform and Ansible.",
      "They worked.",
    ]);
  });

  it("handles Finnish text, abbreviations and ordinals", () => {
    expect(
      splitSentences("Tein töitä esim. Nokialla ja Koneella. Aloitin 1. Tammikuuta uudessa tiimissä."),
    ).toEqual(["Tein töitä esim. Nokialla ja Koneella.", "Aloitin 1. Tammikuuta uudessa tiimissä."]);
  });

  it("normalises whitespace and keeps closing quotes with their sentence", () => {
    expect(splitSentences('She said "ship it."  Then we   shipped.')).toEqual([
      'She said "ship it."',
      "Then we shipped.",
    ]);
  });

  it("cuts unpunctuated speech into bounded chunks without losing words", () => {
    const words = Array.from({ length: 130 }, (_, i) => (i % 9 === 8 ? `word${i},` : `word${i}`));
    const text = words.join(" ");
    const sentences = splitSentences(text);
    expect(sentences.length).toBeGreaterThan(2);
    for (const s of sentences) {
      expect(s.split(" ").length).toBeLessThanOrEqual(MAX_WORDS_PER_SENTENCE + 5);
    }
    expect(sentences.join(" ")).toBe(text);
  });

  it("is deterministic", () => {
    const text = "First point. Second point, with a clause. Third.";
    expect(splitSentences(text)).toEqual(splitSentences(text));
  });
});

describe("renderEvidence", () => {
  const sentences = ["Zero.", "One.", "Two."];

  it("renders a single sentence and a range", () => {
    expect(renderEvidence(sentences, 1, 1)).toBe("One.");
    expect(renderEvidence(sentences, 0, 2)).toBe("Zero. One. Two.");
  });

  it("returns null for references that do not resolve", () => {
    expect(renderEvidence(sentences, 2, 3)).toBeNull();
    expect(renderEvidence(sentences, -1, 0)).toBeNull();
    expect(renderEvidence(sentences, 2, 1)).toBeNull();
    expect(renderEvidence(sentences, 0.5, 1)).toBeNull();
    expect(renderEvidence([], 0, 0)).toBeNull();
  });
});

describe("labelSentences", () => {
  it("labels sentences the way prompts show them", () => {
    expect(labelSentences(3, ["A.", "B."])).toEqual(["[T3.S0] A.", "[T3.S1] B."]);
  });
});
