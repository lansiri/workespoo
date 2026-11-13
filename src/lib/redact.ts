/**
 * Contact-data redaction for job postings. Emails and phone numbers are replaced with
 * `[removed]` before a description is split into sentences or stored.
 *
 * Deliberately careful about what it leaves alone: years, year ranges, salaries, postal
 * codes, dates and Finnish business ids (`1234567-8`) are not phone numbers.
 */

import { splitSentences } from "@/lib/sentences";

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

// ---------- contact sentences ----------

/**
 * Cues that a sentence is about whom to contact, as stems so inflected forms match
 * (Finnish, English, Swedish). A cue at a word start is enough.
 */
const STRONG_CUES: RegExp[] = [
  /(?<![\p{L}\p{N}])lisätie/iu,
  /^\s*Ota\s+(?:rohkeasti\s+)?yhteyttä/u,
  /(?<![\p{L}\p{N}])kysy\p{L}*\s+lisää/iu,
  /(?<![\p{L}\p{N}])more\s+information/iu,
  /(?<![\p{L}\p{N}])further\s+information/iu,
  /(?<![\p{L}\p{N}])for\s+questions/iu,
  /(?<![\p{L}\p{N}])please\s+contact/iu,
  /(?<![\p{L}\p{N}])mer\s+information/iu,
  /(?<![\p{L}\p{N}])ytterligare\s+information/iu,
  /(?<![\p{L}\p{N}])upplysningar/iu,
  /(?<![\p{L}\p{N}])frågor\s+besvaras/iu,
  /(?<![\p{L}\p{N}])ta\s+kontakt/iu,
  // "Teams interview with Kukka Roine, Manager": names the staff member.
  /(?<![\p{L}\p{N}])(?:[Ii]nterview|[Hh]aastattelu\p{L}*|[Ii]ntervju\p{L}*)\s+(?:with|med|:)\s+\p{Lu}\p{Ll}+\s+\p{Lu}\p{Ll}+/u,
];

/**
 * Cues that also occur in sentences describing the job ("toimia yhteyshenkilönä asiakkaille", "hoidat yhteydenotot").
 * They count only with a removed-contact marker, two capitalised words in a row (a name), or in
 * a short label such as "Yhteyshenkilö:".
 */
const WEAK_CUES: RegExp[] = [
  /(?<![\p{L}\p{N}])yhteyshenkilö/iu,
  /(?<![\p{L}\p{N}])yhteydenot/iu,
  /(?<![\p{L}\p{N}])contact\s+person/iu,
  /(?<![\p{L}\p{N}])kontaktperson/iu,
  /(?<![\p{L}\p{N}])tiedustelu/iu,
  /(?<![\p{L}\p{N}])ot\p{L}*\s+yhteyttä/iu,
];

/** Words about how or through whom to reach someone. They count only next to a name pair. */
const METHOD_CUES: RegExp[] = [
  /(?<![\p{L}\p{N}])puhelimitse/iu,
  /(?<![\p{L}\p{N}])soita/iu,
  /(?<![\p{L}\p{N}])tavoitat/iu,
  /(?<![\p{L}\p{N}])tavoitettavissa/iu,
  /(?<![\p{L}\p{N}])sähköpostitse/iu,
  /(?<![\p{L}\p{N}])rekrytoija/iu,
  /(?<![\p{L}\p{N}])kysymyksiin/iu,
  /(?<![\p{L}\p{N}])contact(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])kontakta/iu,
  /(?<![\p{L}\p{N}])ring(?:a|er)(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])vastaa(?![\p{L}\p{N}])/iu,
];

const CAP_AFTER = /(?<![\p{L}\p{N}])\p{Lu}\p{Ll}+/u;
const ROLE_VERB_AFTER = /^\p{L}*\s+(?:toimii|on|is|är|will be)(?![\p{L}\p{N}])/iu;

function weakCueNamesSomeone(text: string): boolean {
  for (const re of WEAK_CUES) {
    const m = re.exec(text);
    if (!m) continue;
    const rest = text.slice(m.index + m[0].length);
    if (ROLE_VERB_AFTER.test(rest) || CAP_AFTER.test(rest)) return true;
  }
  return false;
}

const NAME_PAIR = /(?<![\p{L}\p{N}])\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)?\s+\p{Lu}\p{Ll}+/u;
const SHORT_LABEL_LENGTH = 40;

/** True when the text has a contact cue (see `scrubPostingText`). */
export function containsContactCue(text: string): boolean {
  if (STRONG_CUES.some((re) => re.test(text))) return true;
  if (NAME_PAIR.test(text) && METHOD_CUES.some((re) => re.test(text))) return true;
  if (!WEAK_CUES.some((re) => re.test(text))) return false;
  return (
    text.includes(REDACTED) ||
    NAME_PAIR.test(text) ||
    text.trim().length < SHORT_LABEL_LENGTH ||
    weakCueNamesSomeone(text)
  );
}

const isContactSentence = (s: string) => s.includes(REDACTED) || containsContactCue(s);

/**
 * A name line under 60 characters: two to four capitalised words ("Maija Meikäläinen",
 * "Toimitusjohtaja Mika Suominen", "Kai Karrenberg Jobby Oy"), then optionally a title after a
 * comma. Only used for a line that directly follows a removed line.
 */
const CAP_WORD = "\\p{Lu}\\p{Ll}+(?:-\\p{Lu}\\p{Ll}+)?";
const NAME_LINE = new RegExp(`^${CAP_WORD}(?:\\s+${CAP_WORD}){1,3}(?:,\\s*[\\p{L} /&.-]{2,40})?$`, "u");
const isNameLine = (line: string) => {
  const t = line
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|\*|_)/g, "")
    .replace(/\s*\([^)]{1,40}\)\s*$/, "")
    .replace(/[.,;:]+\s*$/, "")
    .trim();
  return t.length < 60 && NAME_LINE.test(t);
};

const LIST_LINE = /^\s*(?:[-•*–—▪●◦·]|\d{1,2}[.)])\s+/;
const MARKER_STAND_IN = "xremovedmarkerx";

function splitLine(line: string): string[] {
  return splitSentences(line.split(REDACTED).join(MARKER_STAND_IN)).map((p) => p.split(MARKER_STAND_IN).join(REDACTED));
}

/**
 * Walk the text line by line. A removed sentence is dropped, or, with `placeholder`, becomes a
 * line holding only `[removed]` so that sentence positions stay the same.
 */
function scrubLines(text: string, placeholder: boolean): string {
  const out: string[] = [];
  let prevRemoved = false;
  const removedLine = () => {
    if (placeholder) out.push(REDACTED);
    prevRemoved = true;
  };
  for (const line of redactContacts(text).replace(/\r\n?/g, "\n").split("\n")) {
    if (!line.trim()) {
      out.push(line); // blank lines do not break a contact block
      continue;
    }
    if (LIST_LINE.test(line)) {
      if (isContactSentence(line)) removedLine();
      else if (prevRemoved && isNameLine(line.replace(LIST_LINE, ""))) removedLine();
      else {
        out.push(line);
        prevRemoved = false;
      }
      continue;
    }
    const sentences = splitLine(line);
    const flags = sentences.map(isContactSentence);
    if (!flags.some(Boolean)) {
      if (prevRemoved && isNameLine(line)) removedLine();
      else {
        out.push(line);
        prevRemoved = false;
      }
      continue;
    }
    if (!placeholder && flags.every(Boolean)) {
      prevRemoved = true;
      continue;
    }
    // Mixed line: kept sentences stay together, removed ones leave a placeholder line.
    let kept: string[] = [];
    const flush = () => {
      if (kept.length > 0) out.push(kept.join(" "));
      kept = [];
    };
    sentences.forEach((s, i) => {
      if (!flags[i]) {
        kept.push(s);
        return;
      }
      if (placeholder) {
        flush();
        out.push(REDACTED);
      }
    });
    flush();
    prevRemoved = flags[flags.length - 1] ?? false;
  }
  return out.join("\n");
}

/**
 * Redact emails and phone numbers, then remove every sentence (and every list line) that holds
 * the `[removed]` marker or a contact cue, and a short name line right after a removed line.
 * A sentence is never removed only for holding a capitalised word.
 */
export function scrubPostingText(text: string): string {
  return scrubLines(text, false);
}

/** Like `scrubPostingText`, but each removed sentence stays as a line `[removed]` (fixture edits). */
export function blankContactSentences(text: string): string {
  return scrubLines(text, true);
}

/**
 * The same removal for an existing list of sentences, keeping every position: a removed
 * sentence becomes `[removed]`.
 */
export function scrubSentenceList(sentences: readonly string[]): string[] {
  let prevRemoved = false;
  return sentences.map((raw) => {
    const s = redactContacts(raw);
    const remove = isContactSentence(s) || (prevRemoved && isNameLine(s));
    prevRemoved = remove;
    return remove ? REDACTED : s;
  });
}
