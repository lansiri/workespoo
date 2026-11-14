import { describe, expect, it } from "vitest";
import { cvErrorText, cvRemovedSummary, mergeCvText } from "./CvUpload";
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

describe("mergeCvText", () => {
  it("an empty box takes the uploaded text", () => {
    expect(mergeCvText("", "From the file", 100)).toEqual({ text: "From the file", appended: false, fitted: true });
    expect(mergeCvText("  \n ", "From the file", 100)).toEqual({ text: "From the file", appended: false, fitted: true });
  });

  it("a box with text keeps it: the file's text goes after it with an empty line between", () => {
    expect(mergeCvText("What I wrote  \n", "From the file", 100)).toEqual({ text: "What I wrote\n\nFrom the file", appended: true, fitted: true });
  });

  it("stays within the limit, cutting the file's text and never the person's", () => {
    const out = mergeCvText("0123456789", "abcdefghij", 20);
    expect(out.text).toBe("0123456789\n\nabcdefgh");
    expect(out.text).toHaveLength(20);
    expect(out.fitted).toBe(true);
  });

  it("changes nothing and says so when there is no room", () => {
    expect(mergeCvText("0123456789", "abc", 11)).toEqual({ text: "0123456789", appended: true, fitted: false });
  });

  it("says in all three languages what happened", () => {
    for (const lang of ["en", "fi", "sv"] as const) {
      expect(interviewMessages[lang].cvAddedAfter.length).toBeGreaterThan(10);
      expect(interviewMessages[lang].cvNoRoom.length).toBeGreaterThan(10);
    }
  });
});
