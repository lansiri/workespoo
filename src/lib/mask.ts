/**
 * Hiding an employer's name in posting text for a masked demo company
 * (docs/specs/company-view.md 1.1). One helper for every feature that shows posting-derived
 * text to a company, an organiser or a person: Need Cards, picks, introductions.
 */

export const MASKED_EMPLOYER_WORD = "the company";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Legal-form words that postings often leave off a company name ("Acme Robotics" for "Acme Robotics Oy"). */
const LEGAL_FORMS = new Set(["oy", "oyj", "ab", "abp", "ltd", "inc", "gmbh", "llc", "plc", "ry", "ky", "as", "asa", "a/s", "bv", "sa"]);

const isLegalForm = (word: string) => LEGAL_FORMS.has(word.toLowerCase().replace(/[.,;:]+$/, ""));

/** The name without leading or trailing legal-form words, or null when there is nothing to strip. */
function withoutLegalForm(name: string): string | null {
  const words = name.split(/\s+/);
  while (words.length > 1 && isLegalForm(words[words.length - 1])) words.pop();
  while (words.length > 1 && isLegalForm(words[0])) words.shift();
  const core = words.join(" ").replace(/[,.;:]+$/, "");
  return core !== name && core.length > 0 ? core : null;
}

/**
 * The strings that identify an employer, longest first: each whole name, the name without its
 * legal form, and its first word when that word is longer than three characters and is not
 * itself a legal form.
 */
export function employerTerms(...names: Array<string | null | undefined>): string[] {
  const terms = new Set<string>();
  for (const raw of names) {
    const full = (raw ?? "").trim();
    if (!full) continue;
    terms.add(full);
    const core = withoutLegalForm(full);
    if (core) terms.add(core);
    const first = (core ?? full).split(/\s+/)[0]?.replace(/[,.;:]+$/, "") ?? "";
    if (first.length > 3 && !isLegalForm(first)) terms.add(first);
  }
  return [...terms].sort((a, b) => b.length - a.length);
}

/**
 * Replace the employer's name with "the company". A term matches only at a word start, may be
 * followed by a Finnish or Swedish case ending (up to six lower-case letters, optionally after a
 * colon or apostrophe: "Koneen", "ABB:n", "Acmes") and then needs a word end; the ending is
 * swallowed. A single-word term matches only when it starts with an upper-case letter, so the
 * common noun "kone" is left alone; multi-word terms are case-insensitive.
 * `employer` is one name, or the terms from `employerTerms()` when several names apply
 * (the company's real name and the name on the posting).
 */
export function maskEmployer(
  text: string,
  employer: string | readonly string[],
  replacement: string = MASKED_EMPLOYER_WORD,
): string {
  const terms = typeof employer === "string" ? employerTerms(employer) : employer;
  let out = text;
  for (const raw of terms) {
    const term = raw.trim();
    if (!term) continue;
    const singleWord = !/\s/.test(term);
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?:[:'\u2019]?(\\p{L}{1,6}))?(?![\\p{L}\\p{N}])`, "giu");
    out = out.replace(re, (match, ending: string | undefined) => {
      if (ending !== undefined && ending !== ending.toLowerCase()) return match;
      if (singleWord && /\p{Ll}/u.test(match.charAt(0))) return match;
      return replacement;
    });
  }
  return out;
}
