/**
 * Contact-data redaction for job postings. Emails and phone numbers are replaced with
 * `[removed]` before a description is split into sentences or stored.
 *
 * Deliberately careful about what it leaves alone: years, year ranges, salaries, postal
 * codes, dates and Finnish business ids (`1234567-8`) are not phone numbers.
 */

export const REDACTED = "[removed]";

const LABEL = "[\\p{L}\\p{N}](?:[\\p{L}\\p{N}-]*[\\p{L}\\p{N}])?";
const DOT_WORD = "\\s*[\\(\\[\\{]\\s*(?:dot|piste)\\s*[\\)\\]\\}]\\s*";

/** Plain addresses: name@example.fi */
const EMAIL = /[\p{L}\p{N}._%+'-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;

/** name(at)example.fi, name [at] example [dot] fi, name (ät) example.fi */
const EMAIL_BRACKET_AT = new RegExp(
  `[\\p{L}\\p{N}._%+'-]+\\s*[\\(\\[\\{]\\s*(?:at|ät|a)\\s*[\\)\\]\\}]\\s*${LABEL}(?:(?:\\.|${DOT_WORD})${LABEL})+`,
  "giu",
);

/** name at example dot fi (needs "dot" or "piste" before a short TLD so ordinary prose is safe) */
const EMAIL_WORD_AT = new RegExp(
  `[\\p{L}\\p{N}._%+'-]+\\s+(?:at|ät)\\s+${LABEL}(?:\\s+(?:dot|piste)\\s+${LABEL})*\\s+(?:dot|piste)\\s+\\p{L}{2,4}(?![\\p{L}\\p{N}])`,
  "giu",
);

/** Candidate digit runs (not parts of uuids, paths or ids). Validated by `isPhone`. */
const PHONE_CANDIDATE = /(?<![\p{L}\p{N}+/_=#-])\+?\(?\d[\d\s()\-/]{5,}\d(?![\p{L}\p{N}_]|-[\p{L}\p{N}])/gu;

const BUSINESS_ID = /^\d{7}-\d(?:-\d+)?$/;

function isPhone(candidate: string): boolean {
  const c = candidate.trim();
  if (BUSINESS_ID.test(c)) return false;
  const digits = c.replace(/\D/g, "");
  if (c.startsWith("+")) return digits.length >= 8 && digits.length <= 15;
  if (c.startsWith("00")) return digits.length >= 10 && digits.length <= 17;
  if (c.startsWith("0") || c.startsWith("(0")) {
    // Finnish national format: area or mobile prefix starting with 0, 8 to 11 digits.
    return digits.length >= 8 && digits.length <= 11;
  }
  return false;
}

function redactCandidate(candidate: string): string {
  if (isPhone(candidate)) return REDACTED;
  // Two numbers glued together by " - " or " / ": judge the pieces separately.
  if (/\s[-/]\s/.test(candidate)) {
    return candidate
      .split(/(\s+[-/]\s+)/)
      .map((part, i) => (i % 2 === 1 ? part : isPhone(part) ? REDACTED : part))
      .join("");
  }
  return candidate;
}

/** Replace email addresses and phone numbers with `[removed]`. */
export function redactContacts(text: string): string {
  return text
    .replace(EMAIL_BRACKET_AT, REDACTED)
    .replace(EMAIL_WORD_AT, REDACTED)
    .replace(EMAIL, REDACTED)
    .replace(PHONE_CANDIDATE, redactCandidate);
}

export function containsContact(text: string): boolean {
  return redactContacts(text) !== text;
}
