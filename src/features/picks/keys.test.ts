import { describe, expect, it } from "vitest";
import { keyAction, type KeyContext } from "./keys";

const base: KeyContext = { key: "", typing: false, removing: false, canDecide: true, canUndo: false };
const press = (key: string, over: Partial<KeyContext> = {}) => keyAction({ ...base, ...over, key });

describe("review queue keys", () => {
  it("moves with j, k and the arrows", () => {
    expect(press("j")).toEqual({ type: "move", delta: 1 });
    expect(press("ArrowDown")).toEqual({ type: "move", delta: 1 });
    expect(press("k")).toEqual({ type: "move", delta: -1 });
    expect(press("ArrowUp")).toEqual({ type: "move", delta: -1 });
  });

  it("a approves one pick, only when it can be decided (O3)", () => {
    expect(press("a")).toEqual({ type: "approve" });
    expect(press("a", { canDecide: false })).toBeNull();
  });

  it("r opens the reason dialog, then a digit chooses a code and Enter confirms: r 1 Enter removes with evidence_thin (O3)", () => {
    expect(press("r")).toEqual({ type: "startRemove" });
    expect(press("1", { removing: true })).toEqual({ type: "chooseCode", code: "evidence_thin" });
    expect(press("5", { removing: true })).toEqual({ type: "chooseCode", code: "other" });
    expect(press("Enter", { removing: true })).toEqual({ type: "confirmRemove" });
    expect(press("Escape", { removing: true })).toEqual({ type: "cancelRemove" });
  });

  it("ignores digits and letters while a text field has focus, and in the dialog does not approve", () => {
    expect(press("a", { typing: true })).toBeNull();
    expect(press("3", { removing: true, typing: true })).toBeNull();
    expect(press("a", { removing: true })).toBeNull();
    expect(press("6", { removing: true })).toBeNull();
  });

  it("u undoes only a decided pick, p publishes, ? shows help", () => {
    expect(press("u")).toBeNull();
    expect(press("u", { canDecide: false, canUndo: true })).toEqual({ type: "undo" });
    expect(press("p")).toEqual({ type: "publish" });
    expect(press("?")).toEqual({ type: "help" });
  });

  it("has no key for approving everything", () => {
    for (const key of ["A", "ctrl+a", "Shift", "*", "x", "all"]) expect(press(key)).toBeNull();
  });
});
