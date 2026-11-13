import type { IntroStatus } from "@/contracts";

/** Who may make a transition. `initiator` is whichever side asked for the introduction. */
export type Who = "talent" | "company" | "organiser" | "system" | "initiator" | "either_side_or_organiser";
export type Party = "talent" | "company" | "organiser" | "system";

export type Transition = { from: IntroStatus; to: IntroStatus; who: Who };

/**
 * The transition table of docs/specs/picks-and-intros.md section 6, for moves that act on an
 * existing introduction. Creating one (none to `awaiting_talent` or `pending_review`) is
 * done by the request functions. Any move not listed here is refused with a 409.
 */
export const TRANSITIONS: readonly Transition[] = [
  { from: "pending_review", to: "awaiting_company", who: "organiser" },
  { from: "pending_review", to: "not_approved", who: "organiser" },
  { from: "awaiting_talent", to: "accepted", who: "talent" },
  { from: "awaiting_talent", to: "declined", who: "talent" },
  { from: "awaiting_company", to: "accepted", who: "company" },
  { from: "awaiting_company", to: "declined", who: "company" },
  { from: "awaiting_talent", to: "withdrawn", who: "initiator" },
  { from: "awaiting_company", to: "withdrawn", who: "initiator" },
  { from: "awaiting_talent", to: "expired", who: "system" },
  { from: "awaiting_company", to: "expired", who: "system" },
  { from: "accepted", to: "cancelled", who: "either_side_or_organiser" },
];

export function ruleFor(from: IntroStatus, to: IntroStatus): Transition | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.to === to);
}

export function partyMayMove(who: Who, party: Party, initiatedBy: "company" | "talent"): boolean {
  switch (who) {
    case "initiator":
      return party === initiatedBy;
    case "either_side_or_organiser":
      return party === "talent" || party === "company" || party === "organiser";
    default:
      return party === who;
  }
}

/** Statuses from which an introduction can still change, in either direction. */
export const OPEN_STATUSES: readonly IntroStatus[] = ["pending_review", "awaiting_talent", "awaiting_company"];
