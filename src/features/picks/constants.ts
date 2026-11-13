/** Named thresholds for the picks feature, kept in one place so the lead can tune them. */

/** Trigram `word_similarity` at or above which a signal phrase speaks to a requirement (matching.md 3.1). */
export const TOUCH_SIMILARITY = 0.6;

/** Longest reason text we store (the `PickReason` contract allows 200). */
export const REASON_MAX_CHARS = 200;

/** A reasons call that takes longer than this is dropped and the code-written reasons are used. */
export const REASONS_DEADLINE_MS = 20_000;

/** Reasons per pick (picks-draft.md). */
export const MAX_REASONS = 3;

/** How many model calls run at once while wording reasons. */
export const MODEL_CONCURRENCY = 4;

/** A person who declined an introduction with a company is not suggested to it again for this long. */
export const DECLINE_COOLDOWN_DAYS = 30;

/** An organiser may undo a decision for this long, while the digest is still a draft. */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

/** Company-initiated requests expire after this long (picks-and-intros.md 6). */
export const INTRO_EXPIRY_MS = 72 * 60 * 60 * 1000;

/** Fallback when no event row exists: used in the seed and in the settings keys. */
export const NO_EVENT_ID = "no-event";

/** Removal reason codes, in the order the organiser's keyboard shortcuts number them (1 to 5). */
export const REMOVE_REASON_CODES = [
  "evidence_thin",
  "already_in_contact",
  "duplicate",
  "person_asked",
  "other",
] as const;
export type RemoveReasonCode = (typeof REMOVE_REASON_CODES)[number];

export const REMOVE_NOTE_MAX = 300;
