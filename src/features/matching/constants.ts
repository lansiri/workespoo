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
export const FEED_SIZE = 40;
export const FEED_FRESH_DAYS = 60;
/** Espoo, Helsinki, Vantaa, Kauniainen. A posting in region 01 (Uusimaa) also qualifies. */
export const FEED_MUNICIPALITY_CODES = ["049", "091", "092", "235"] as const;
export const FEED_REGION_CODE = "01";
export const ESPOO_CODE = "049";
/** A posting passes the gate with this many occupation-linked skills (essential or optional) on their own. */
export const GATE_OCC_LINKS_ALONE = 2;
/** Text hits for this many different signals let a posting in without any link. */
export const GATE_TEXT_SIGNALS_ALONE = 2;
/** `lookingFor.roles` against a posting title. */
export const ROLE_TITLE_HIT_SIMILARITY = 0.5;
/** Words shorter than this are left out of the text search. */
export const TEXT_TERM_MIN_LENGTH = 4;
/** Cap on text-search terms so the query stays small. */
export const TEXT_TERM_MAX = 60;

/** Reasons. */
export const REASON_TOP_POSTINGS = 5;
/** Need Card drafts requested per feed, for the first postings without one. */
export const NEED_DRAFT_POSTINGS = 3;
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

/** Words that carry no meaning in an ESCO label, left out of the text search. */
export const TEXT_STOPWORDS = new Set([
  "with", "from", "that", "this", "using", "work", "works", "working", "skill", "skills",
  "knowledge", "ability", "basic", "general", "other", "support", "service", "services",
  "management", "manage", "perform", "provide", "apply", "ensure", "maintain", "develop",
  "tasks", "task", "types", "type", "such", "their", "into", "over", "under", "between",
  "and", "the", "for", "ja", "tai", "sekä", "jotka", "joka", "kanssa", "työ", "taito",
  "taidot", "tieto", "och", "eller", "med",
  "solution", "solutions", "ratkaisu", "ratkaisuja", "kehittää", "kehittäminen",
]);
