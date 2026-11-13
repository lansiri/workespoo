import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NotesList, type NoteItem } from "./NotesList";
import { newIds } from "./newIds";

const text = { title: "Notes so far", help: "You'll check and edit these at the end.", empty: "Skills you mention appear here.", newLabel: "NEW", noted: "Noted: {phrase}" };
const notes: NoteItem[] = [
  { id: "s1", label: "Fixing barcode scanners", group: "skill", refLabel: "answer 1" },
  { id: "s2", label: "Warehouse management system", group: "tool", refLabel: "answer 2", fresh: true },
  { id: "s3", label: "Forklift safety", group: "knowledge", refLabel: "answer 2", fresh: true },
];

describe("newIds", () => {
  it("returns only ids that were not there before", () => {
    expect(newIds(["a", "b"], ["a", "b", "c"])).toEqual(["c"]);
    expect(newIds([], ["a"])).toEqual(["a"]);
    expect(newIds(["a"], ["a"])).toEqual([]);
    expect(newIds(["a", "b"], ["b"])).toEqual([]);
  });
});

describe("NotesList", () => {
  it("does not animate anything on the first render", () => {
    const html = renderToStaticMarkup(<NotesList notes={notes} text={text} />);
    expect(html).not.toContain("data-entering");
    expect(html.match(/data-testid="signal-chip"/g)).toHaveLength(3);
  });

  it("marks only the ids it is told are new as entering", () => {
    const html = renderToStaticMarkup(<NotesList notes={notes} enteringIds={["s3"]} text={text} />);
    expect(html.match(/data-entering="true"/g)).toHaveLength(1);
    expect(html).toMatch(/data-signal-id="s3"[^>]*data-entering="true"|data-entering="true"[^>]*data-signal-id="s3"/);
    expect(html).toContain("Noted: Forklift safety");
    expect(html).not.toContain("Noted: Fixing barcode scanners");
  });

  it("shows ghost chips and the plain help line when empty", () => {
    const html = renderToStaticMarkup(<NotesList notes={[]} text={text} />);
    expect(html.match(/we-chip we-ghost/g)).toHaveLength(4);
    expect(html).toContain(text.empty);
    expect(html).toContain('data-testid="coverage-hint"');
  });

  it("keeps conversation order and gives each chip an accessible name with its answer", () => {
    const html = renderToStaticMarkup(<NotesList notes={notes} order="conversation" text={text} />);
    expect(html.indexOf("Fixing barcode scanners")).toBeLessThan(html.indexOf("Forklift safety"));
    expect(html).toContain('aria-label="Fixing barcode scanners, answer 1"');
  });

  it("shows no score: the only number is the note count", () => {
    const html = renderToStaticMarkup(<NotesList notes={notes} text={text} />).replace(/<[^>]+>/g, " ");
    expect(html).not.toMatch(/%|★|☆|\/\s*10|score:/i);
  });
});
