import { describe, expect, it } from "vitest";
import { NOT_MENTIONED_MAX, STATUTORY_SUFFIX } from "./constants";
import { codeReason, notMentionedItems, splitNotMentioned, uniquePairs, type AllowedPair, type SignalForReason } from "./reasons";
import { matchesMessages } from "./messages";

const signals: SignalForReason[] = [
  { id: "s1", phrase: "Python", rendering: null, evidence: { turnIndex: 2, sentenceFrom: 1, sentenceTo: 2 } },
  { id: "s2", phrase: "SQL", rendering: null, evidence: null },
];

describe("code-rendered reason", () => {
  it("says what the card mentions and what the posting lists, with the evidence reference", () => {
    const pairs: AllowedPair[] = [{ signalId: "s1", sentence: 3, via: "posting_skill", listed: "Python (computer programming)" }];
    expect(codeReason(pairs, signals)).toEqual({
      text: "Your card mentions Python. This posting lists Python (computer programming).",
      signalId: "s1",
      evidence: { turnIndex: 2, sentenceFrom: 1, sentenceTo: 2 },
      postingSentence: 3,
    });
  });
  it("words an occupation link differently and prefers a sentence-backed pair", () => {
    const pairs: AllowedPair[] = [
      { signalId: "s1", sentence: null, via: "occupation", listed: "Python" },
      { signalId: "s2", sentence: 5, via: "requirement", listed: "SQL" },
    ];
    expect(codeReason(pairs, signals)?.signalId).toBe("s2");
    expect(codeReason([pairs[0]], signals)?.text).toBe("Your card mentions Python. This kind of work usually involves Python.");
  });
  it("is null with no pair", () => expect(codeReason([], signals)).toBeNull());
  it("removes duplicate pairs", () => {
    const p: AllowedPair = { signalId: "s1", sentence: 1, via: "requirement", listed: "x" };
    expect(uniquePairs([p, { ...p, via: "posting_skill" }])).toHaveLength(1);
  });
});

describe("not mentioned", () => {
  it("lists at most the cap, must before nice, and round-trips the statutory marker", () => {
    const reqs = Array.from({ length: 9 }, (_, i) => ({
      id: `r${i}`,
      text: `Item ${i}`,
      kind: (i % 2 === 0 ? "nice" : "must") as "must" | "nice",
      statutory: i === 1 ? "licence" : "none",
    }));
    const items = notMentionedItems(reqs, new Set(["r3"]));
    expect(items).toHaveLength(NOT_MENTIONED_MAX);
    expect(items[0]).toBe(`Item 1${STATUTORY_SUFFIX}`);
    expect(items).not.toContain("Item 3");
    expect(splitNotMentioned(items[0])).toEqual({ text: "Item 1", statutory: true });
    expect(splitNotMentioned("Plain")).toEqual({ text: "Plain", statutory: false });
  });
});

describe("messages", () => {
  it("never use the judging words the spec forbids", () => {
    for (const lang of ["en", "fi", "sv"] as const) {
      expect(Object.values(matchesMessages[lang]).join(" ")).not.toMatch(/\b(missing|lacking|gap|saknas|puuttuu)\b/i);
    }
  });
});
