/**
 * Tunable starting values for the needs feature (docs/LEAD-DECISIONS.md, open question 6).
 * One place, so the lead can tune them against real data.
 */

/** `word_similarity` at or above which a signal phrase touches a requirement (matching.md 3.1). */
export const TOUCH_MIN_WORD_SIMILARITY = 0.6;
/** Minimum score for the trigram ESCO fallback on a requirement with no `K` id (need-card.md 3.4.3). */
export const ESCO_FALLBACK_MIN_SIMILARITY = 0.6;
/** The best fallback candidate must beat the runner-up by this much, else none is chosen. */
export const ESCO_FALLBACK_MARGIN = 0.05;
/** Candidate similarity at which a salient posting phrase adds an ESCO candidate to the prompt. */
export const ESCO_PROMPT_MIN_SIMILARITY = 0.45;

/** Most ESCO candidates shown to the model (`K1`..`K40`). */
export const MAX_ESCO_CANDIDATES = 40;
/** Room kept for phrase-based trigram candidates when the posting's own skills fill the list. */
export const TRIGRAM_CANDIDATE_RESERVE = 10;
/** Only short, list-like posting sentences are used as salient phrases for trigram candidates. */
export const SALIENT_PHRASE_MAX_CHARS = 60;
export const SALIENT_PHRASE_MAX_SENTENCES = 25;

/** Posting sentences shown to the model; the rest stay in storage. */
export const MAX_PROMPT_SENTENCES = 120;
export const MAX_REQUIREMENTS = 12;

/** A `years` question needs at least this many years asked for. */
export const YEARS_QUESTION_MIN_YEARS = 3;
/** Most questions shown to a company at once (need-card.md 4.2.5). */
export const MAX_QUESTIONS_SHOWN = 3;
/** A pool smaller than this is too small to say anything about (need-card.md 4.2.3). */
export const QUESTION_MIN_RELEVANT = 3;

export const QUESTION_TEXT_MAX = 240;
export const WHY_MAX = 140;
export const REQUIREMENT_TEXT_MAX = 80;
export const TITLE_MAX = 60;
