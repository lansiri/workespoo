import { describe, expect, it } from "vitest";
import { cvErrorText, cvRemovedSummary } from "./CvUpload";
import { interviewMessages } from "./messages";

const en = interviewMessages.en;

describe("cvRemovedSummary", () => {
  it("names the kinds removed, in a fixed order, never what they were", () => {
    expect(cvRemovedSummary({ date: 3, name: 2, contact: 1 }, en)).toBe(
      "We removed your name, contact details and dates and years. Check the text below and change or delete anything before you start. The file itself is not saved.",
    );
  });

  it("one kind needs no list", () => {
    expect(cvRemovedSummary({ name: 1 }, en)).toContain("We removed your name.");
  });

  it("says so when nothing was removed", () => {
    expect(cvRemovedSummary({ name: 0 }, en)).toBe(en.cvReadNothing);
  });

  it("uses the page language for the joining word", () => {
    expect(cvRemovedSummary({ name: 1, date: 1 }, interviewMessages.fi)).toContain("nimesi ja päivämäärät ja vuosiluvut");
  });
});

describe("cvErrorText", () => {
  it("maps known codes and falls back for anything else", () => {
    expect(cvErrorText({ error: { code: "no_text" } }, en)).toBe(en.cvErrorNoText);
    expect(cvErrorText({ error: { code: "too_large" } }, en)).toBe(en.cvErrorTooLarge);
    expect(cvErrorText({ error: { code: "something_else" } }, en)).toBe(en.cvErrorFailed);
    expect(cvErrorText(null, en)).toBe(en.cvErrorFailed);
  });
});
