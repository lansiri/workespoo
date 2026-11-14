/**
 * Every tunable number and pattern of the matching feature, in one place so the lead can
 * adjust them against real data. Starting values come from docs/specs/matching.md and
 * docs/LEAD-DECISIONS.md.
 */

/** `touches`: a signal phrase and requirement text count as the same thing at or above this. */
export const TOUCH_TRIGRAM_THRESHOLD = 0.6;

/** Eligibility: a need with at least this many anchor requirements needs `ANCHOR_THRESHOLD_LARGE` touched. */
export const ANCHOR_COUNT_FOR_LARGE_NEED = 3;
export const ANCHOR_THRESHOLD_LARGE = 2;
export const ANCHOR_THRESHOLD_SMALL = 1;
/** Alternative route to eligible: one touched anchor plus a self-declared role this close to the need title. */
export const ROLE_TITLE_SIMILARITY = 0.5;

/** Feed retrieval. */
export const FEED_CANDIDATES = 40;
export const FEED_SIZE = 20;
export const FEED_FRESH_DAYS = 60;
/** Espoo, Helsinki, Vantaa, Kauniainen. A posting in region 01 (Uusimaa) also qualifies. */
export const FEED_MUNICIPALITY_CODES = ["049", "091", "092", "235"] as const;
export const FEED_REGION_CODE = "01";
export const ESPOO_CODE = "049";
/** A posting enters the feed when this many different signals link to it (one non-tool signal with a strong link is enough on its own). */
export const GATE_SIGNALS_ALONE = 2;
/**
 * A signal whose strong links (direct, essential, mention) reach more than this share of the
 * postings in the pool, and at least `GENERIC_MIN_POSTINGS` of them, is too generic to bring a
 * posting in alone ("customer service" is a skill of 5 percent of all postings). It still counts
 * towards the two-signal gate and the order. Measured on the 1,338 real postings (14 Nov).
 */
export const GENERIC_SHARE = 0.04;
export const GENERIC_MIN_POSTINGS = 40;
/** `lookingFor.roles` against a posting title. */
export const ROLE_TITLE_HIT_SIMILARITY = 0.5;
/** Reasons. */
export const REASON_TOP_POSTINGS = 5;
/** Need Card drafts requested per feed, for the first postings without one. */
export const NEED_DRAFT_POSTINGS = 3;
/** The Need Card drafts start this long after the feed is stored, so step two is claimed first. */
export const NEED_DRAFT_DELAY_MS = 5000;
/** Deadline of one reason call; a late call keeps the code-written reasons. */
export const REASON_DEADLINE_MS = 20_000;
/** A signal label shorter than this is never matched against posting text as a phrase. */
export const PHRASE_MIN_LENGTH = 3;
export const REASON_CONCURRENCY = 4;
export const REASON_MAX_PER_POSTING = 3;
export const REASON_TEMPERATURE = 0.2;
export const REASON_SENTENCE_MAX_CHARS = 300;

/** "Not mentioned in your conversation" list. */
export const NOT_MENTIONED_MAX = 5;
/** Appended in English to a statutory requirement; the page swaps it for the interface language. */
export const STATUTORY_SUFFIX = " (checked by the employer at hiring)";
