import { REMOVE_REASON_CODES, type RemoveReasonCode } from "./constants";

/** What a key press means in the review queue. There is no action here that touches more than one pick. */
export type KeyAction =
  | { type: "move"; delta: 1 | -1 }
  | { type: "approve" }
  | { type: "startRemove" }
  | { type: "undo" }
  | { type: "publish" }
  | { type: "help" }
  | { type: "chooseCode"; code: RemoveReasonCode }
  | { type: "confirmRemove" }
  | { type: "cancelRemove" };

export type KeyContext = {
  key: string;
  /** Focus is in a text field, so letters are text. */
  typing: boolean;
  /** The reason dialog is open. */
  removing: boolean;
  /** A pick is selected and it has no decision yet, in a digest still being reviewed. */
  canDecide: boolean;
  /** A pick is selected and it has a decision, in a digest still being reviewed. */
  canUndo: boolean;
};

export function keyAction(c: KeyContext): KeyAction | null {
  if (c.removing) {
    if (c.key === "Escape") return { type: "cancelRemove" };
    if (c.key === "Enter") return { type: "confirmRemove" };
    if (!c.typing && /^[1-5]$/.test(c.key)) return { type: "chooseCode", code: REMOVE_REASON_CODES[Number(c.key) - 1] };
    return null;
  }
  if (c.typing) return null;
  switch (c.key) {
    case "j":
    case "ArrowDown":
      return { type: "move", delta: 1 };
    case "k":
    case "ArrowUp":
      return { type: "move", delta: -1 };
    case "a":
      return c.canDecide ? { type: "approve" } : null;
    case "r":
      return c.canDecide ? { type: "startRemove" } : null;
    case "u":
      return c.canUndo ? { type: "undo" } : null;
    case "p":
      return { type: "publish" };
    case "?":
      return { type: "help" };
    default:
      return null;
  }
}
