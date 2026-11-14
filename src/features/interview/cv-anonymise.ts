/**
 * CV anonymisation in code, before any model sees the text (docs/specs/prompts/cv-seed.md).
 *
 * Deterministic rules, no model: the same input always gives the same output, and the person
 * is shown the result and can change it before the interview starts. What is removed:
 *
 * - the person's name (the name line at the top, a "Name:" line, and every later use of it)
 * - contact details: emails, phone numbers, links, social handles, street addresses, postal codes
 * - identity numbers: Finnish personal identity codes, Swedish personal numbers, IBANs
 * - dates, years and ages (age proxies)
 * - labelled personal lines ("Date of birth:", "Kansalaisuus:", "Civilstånd:" ...)
 * - whole sections that hold personal details, references (third parties) or hobbies
 * - sentences about protected attributes: nationality, family, religion, health, gender, native language
 * - country names and nationality adjectives (nationality proxies)
 *
 * This is one layer. The model is also told to ignore such content, and the questions it
 * suggests are checked against the protected lexicons before they are used.
 */
import type { CvRemovedKind } from "@/contracts";
import { COUNTRIES_AND_DEMONYMS } from "@/lib/lexicon";
import { REDACTED, redactContacts } from "@/lib/redact";

export type { CvRemovedKind };

export type CvRemoved = Record<CvRemovedKind, number>;

export type AnonymisedCv = {
  text: string;
  /** How many things of each kind were removed. Counts only: never what they were. */
  removed: CvRemoved;
};

const L = "\\p{L}\\p{N}";
const BEFORE = `(?<![${L}])`;
const AFTER = `(?![${L}])`;

function wordList(words: readonly string[], flags = "giu"): RegExp {
  const alts = [...words]
    .sort((a, b) => b.length - a.length)
    .map((w) => (w.endsWith("*") ? escape(w.slice(0, -1)) : `${escape(w)}${AFTER}`).replace(/ /g, "\\s+"));
  return new RegExp(`${BEFORE}(?:${alts.join("|")})`, flags);
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------- section headings ----------

/** Sections dropped whole: personal details, contacts, references (other people), hobbies. */
const DROP_HEADINGS = [
  "personal details", "personal information", "personal data", "personal info", "contact", "contacts",
  "contact details", "contact information", "contact info", "references", "referees", "reference",
  "hobbies", "interests", "hobbies and interests", "interests and hobbies", "leisure", "free time",
  "henkilötiedot", "yhteystiedot", "suosittelijat", "suosittelija", "harrastukset", "vapaa-aika",
  "personuppgifter", "kontaktuppgifter", "kontakt", "referenser", "referenspersoner", "fritidsintressen",
  "intressen", "fritid",
];

/** Ordinary CV headings. They end a dropped section. */
const KEEP_HEADINGS = [
  "profile", "summary", "professional summary", "about me", "about", "objective", "work experience",
  "experience", "professional experience", "employment", "employment history", "work history", "career",
  "education", "training", "studies", "skills", "key skills", "technical skills", "competences",
  "competencies", "core competencies", "languages", "language skills", "projects", "certifications",
  "certificates", "courses", "licences", "licenses", "achievements", "volunteering", "volunteer work",
  "positions of trust", "publications", "awards", "tools", "other",
  "profiili", "tiivistelmä", "minusta", "työkokemus", "työhistoria", "kokemus", "koulutus", "opinnot",
  "taidot", "osaaminen", "kielitaito", "kielet", "projektit", "sertifikaatit", "kurssit", "lisäkoulutus",
  "luottamustehtävät", "vapaaehtoistyö", "it-taidot", "atk-taidot", "kortit", "pätevyydet", "muuta",
  "profil", "sammanfattning", "om mig", "arbetslivserfarenhet", "erfarenhet", "anställningar",
  "utbildning", "kompetenser", "kunskaper", "färdigheter", "språk", "språkkunskaper", "projekt",
  "certifikat", "kurser", "ideellt arbete", "förtroendeuppdrag", "övrigt",
];

const DROP_SET = new Set(DROP_HEADINGS);
const KEEP_SET = new Set(KEEP_HEADINGS);

/** A dropped section never swallows more than this many non-empty lines. */
const MAX_SECTION_LINES = 12;

function headingKey(line: string): string | null {
  const t = line
    .replace(/^\s*(?:[-•*▪●#]|\d{1,2}[.)])\s*/, "")
    .replace(/[:：]\s*$/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*&\s*/g, " and ");
  if (t.length === 0 || t.length > 40) return null;
  return t;
}

// ---------- labelled personal lines ----------

const PERSONAL_LABELS = [
  // English
  "name", "full name", "first name", "last name", "surname", "address", "home address", "street address",
  "postal address", "postal code", "post code", "zip", "zip code", "city", "phone", "mobile", "tel",
  "telephone", "email", "e-mail", "linkedin", "github", "website", "homepage",
  "date of birth", "birth date", "birthdate", "dob", "born", "place of birth", "birthplace", "age",
  "nationality", "citizenship", "gender", "sex", "marital status", "civil status", "family", "children",
  "religion", "health", "photo", "social security number", "personal identity code", "id number", "passport",
  // Finnish
  "nimi", "etunimi", "sukunimi", "osoite", "katuosoite", "postiosoite", "postinumero", "postitoimipaikka",
  "kotikunta", "asuinpaikka", "asuinkunta", "puhelin", "puh", "matkapuhelin", "gsm", "sähköposti",
  "s-posti", "kotisivu", "kotisivut", "syntymäaika", "syntynyt", "syntymäpaikka", "ikä", "kansalaisuus",
  "sukupuoli", "siviilisääty", "perhe", "perhesuhteet", "lapset", "uskonto", "terveys", "valokuva",
  "henkilötunnus", "hetu", "sotu",
  // Swedish
  "namn", "förnamn", "efternamn", "adress", "postnummer", "postadress", "ort", "telefon", "mobil",
  "e-post", "mejl", "hemsida", "födelsedatum", "född", "födelseort", "ålder", "nationalitet",
  "medborgarskap", "kön", "civilstånd", "familj", "barn", "hälsa", "foto", "personnummer",
];

const LABEL_LINE = new RegExp(
  `^\\s*(?:[-•*▪●]\\s*)?(${[...PERSONAL_LABELS]
    .sort((a, b) => b.length - a.length)
    .map((l) => escape(l).replace(/ /g, "\\s+"))
    .join("|")})\\s*(?:[:：|]|\\s[-–—]\\s)\\s*(.*)$`,
  "iu",
);

const NAME_LABELS = new Set(["name", "full name", "nimi", "namn"]);

// ---------- the name ----------

const CAP = "(?:\\p{Lu}[\\p{Ll}'’]+|\\p{Lu}{2,})(?:-(?:\\p{Lu}[\\p{Ll}'’]+|\\p{Lu}{2,}))?";
const NAME_LINE = new RegExp(`^${CAP}(?:\\s+${CAP}){1,3}$`, "u");
const CV_WORDS = /(?:curriculum\s+vitae|ansioluettelo|meritförteckning|levnadsbeskrivning|résumé|resume|\bcv\b)/giu;

/** Words that make a capitalised line a job title or heading, not a name. */
const NOT_NAME_WORDS = new Set([
  "developer", "engineer", "designer", "manager", "assistant", "specialist", "consultant", "analyst",
  "nurse", "teacher", "worker", "driver", "cook", "chef", "cleaner", "student", "intern", "trainee",
  "coordinator", "officer", "director", "lead", "senior", "junior", "technician", "accountant", "sales",
  "customer", "service", "project", "software", "data", "marketing", "administrator", "architect",
  "operator", "mechanic", "electrician", "carpenter", "advisor", "adviser", "representative", "agent",
  "support", "full", "stack", "frontend", "backend", "web", "product", "owner", "head", "chief",
  "executive", "graduate", "professional", "experienced", "warehouse", "logistics", "care", "health",
  "kehittäjä", "insinööri", "suunnittelija", "päällikkö", "assistentti", "asiantuntija", "konsultti",
  "sairaanhoitaja", "lähihoitaja", "opettaja", "työntekijä", "kuljettaja", "kokki", "siivooja",
  "opiskelija", "harjoittelija", "koordinaattori", "johtaja", "myyjä", "myyntineuvottelija", "esihenkilö",
  "utvecklare", "ingenjör", "chef", "assistent", "konsult", "sjuksköterska", "lärare", "förare",
  "kock", "städare", "studerande", "praktikant", "säljare", "handläggare",
]);

function looksLikeName(line: string): boolean {
  if (!NAME_LINE.test(line)) return false;
  const words = line.toLowerCase().split(/[\s-]+/);
  if (words.some((w) => NOT_NAME_WORDS.has(w))) return false;
  const key = headingKey(line);
  return key === null || (!DROP_SET.has(key) && !KEEP_SET.has(key));
}

function stripCvWords(line: string): string {
  return line
    .replace(CV_WORDS, " ")
    .replace(/[|•·,–—:]+/g, " ")
    .replace(/(^|\s)-(\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(name: string): string[] {
  return name.split(/\s+/).filter((t) => t.replace(/[^\p{L}]/gu, "").length >= 3);
}

/** "MAIJA" also matches "Maija", and "Maija" matches "MAIJA"; "Will" never matches the verb "will". */
function tokenVariants(token: string): string[] {
  const lower = token.toLocaleLowerCase("fi");
  const title = lower.replace(/(^|-)(\p{L})/gu, (_m, sep: string, c: string) => sep + c.toLocaleUpperCase("fi"));
  return [...new Set([token, title, token.toLocaleUpperCase("fi")])];
}

// ---------- inline patterns ----------

const HETU = new RegExp(`${BEFORE}\\d{6}[-+A-FU-Y]\\d{3}[0-9A-Y]${AFTER}`, "gu");
const PERSONNUMMER = new RegExp(`${BEFORE}(?:\\d{2})?\\d{6}[-+]\\d{4}${AFTER}`, "gu");
const IBAN = new RegExp(`${BEFORE}[A-Z]{2}\\d{2}(?:\\s?[A-Z0-9]{4}){3,7}(?:\\s?[A-Z0-9]{1,4})?${AFTER}`, "gu");

const URL = /\b(?:https?:\/\/|www\.)\S+/giu;
const SOCIAL = /\b(?:[a-z]{2,3}\.)?(?:linkedin|github|gitlab|behance|dribbble|facebook|instagram|twitter|x|medium|stackoverflow|tiktok|youtube)\.com\/\S*/giu;
const DOMAIN_PATH = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|fi|se|io|net|org|dev|me|eu|app|page|site)\/\S*/gu;
const HANDLE = new RegExp(`${BEFORE}@[\\p{L}\\p{N}_.]{2,}`, "gu");

const STREET = new RegExp(
  `\\p{Lu}[\\p{L}-]*(?:tie|katu|kuja|polku|väylä|kaari|rinne|tori|ranta|aukio|piha|vägen|gatan|gränd|stigen|torget|backen)\\s+\\d{1,4}\\s*[A-Za-z]?(?:\\s*\\d{1,3})?${AFTER}`,
  "gu",
);
const STREET_EN = new RegExp(`${BEFORE}\\d{1,5}\\s+(?:\\p{Lu}\\p{Ll}+\\s+){1,3}(?:Street|St\\.?|Road|Rd\\.?|Avenue|Ave\\.?|Lane|Drive|Way|Close|Court)${AFTER}`, "gu");
const POSTAL_FI = new RegExp(`${BEFORE}\\d{5}\\s+\\p{Lu}[\\p{L}-]+`, "gu");
const POSTAL_SE = new RegExp(`${BEFORE}\\d{3}\\s\\d{2}\\s+\\p{Lu}[\\p{L}-]+`, "gu");

const MONTH = [
  "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
  "january", "february", "march", "april", "june", "july", "august", "september", "october", "november", "december",
  "tammi", "helmi", "maalis", "huhti", "touko", "kesä", "heinä", "elo", "syys", "loka", "marras", "joulu",
  "januari", "februari", "mars", "maj", "juni", "juli", "augusti", "okt", "oktober",
]
  .map(escape)
  .join("|");
const MONTH_WORD = `(?:(?:${MONTH})(?:kuu(?:ta|ssa|sta)?)?\\.?\\s+)`;
const YEAR = `(?:19|20)\\d{2}`;
const DATEISH = `(?:\\d{1,2}\\s*[./-]\\s*\\d{1,2}\\s*[./-]\\s*(?:${YEAR}|\\d{2})|${YEAR}-\\d{2}-\\d{2}|(?:0?[1-9]|1[0-2])\\s*[/.]\\s*${YEAR}|${MONTH_WORD}?${YEAR})`;
const ONGOING = "(?:present|current|now|today|ongoing|nyt|nykyään|nykyhetki|jatkuu|pågående|nu|idag)";
const DATE_RANGE = new RegExp(`${BEFORE}${DATEISH}(?:\\s*[–—-]\\s*(?:${DATEISH}|${ONGOING})?)?${AFTER}`, "giu");
const LEADING_RANGE = new RegExp(`[–—-]\\s*${DATEISH}${AFTER}`, "giu");
const AGE = new RegExp(
  `${BEFORE}(?:\\d{2}\\s*(?:years?\\s+old|yrs?\\s+old|y\\/o|-?vuotia\\p{L}*|år\\s+gammal|-?åring)|(?:age|aged|ikä|ålder)\\s*:?\\s*\\d{2})${AFTER}`,
  "giu",
);

// ---------- protected sentences ----------

/**
 * Words about the person's own protected attributes. Phrases for family words, so that work
 * such as "worked with children" or "lasten kanssa" stays.
 */
const PROTECTED_WORDS = wordList([
  // English
  "nationality", "citizen*", "ethnic*", "religio*", "married", "marital", "spouse", "husband", "wife",
  "divorced", "widow*", "pregnan*", "maternity leave", "paternity leave", "parental leave",
  "disab*", "diagnos*", "chronic illness", "health condition", "visa", "residence permit", "work permit",
  "native language", "mother tongue", "first language", "native speaker", "native-level", "gender", "male",
  "female", "born", "date of birth", "place of birth", "church", "mosque", "synagogue",
  // Finnish
  "kansalaisuu*", "kansalainen", "syntynyt", "syntyperä*", "syntymäaika", "syntymäpaikka", "syntymävuo*",
  "naimisi*", "avioliito*", "aviomie*", "vaimo*", "puoliso*", "eronnut", "lapseni", "lapsemme",
  "uskonto*", "uskonno*", "terveydentila*", "sairau*", "vamma*", "diagnoo*", "raskaana", "raskau*",
  "äitiysloma*", "isyysloma*", "vanhempainvapaa*", "perhevapaa*", "hoitovapaa*", "sukupuol*",
  "äidinkiel*", "oleskelulu*", "työlupa*", "työluva*", "perheeseeni", "perheeni", "perheellinen",
  "perheetön", "seurakun*",
  // Swedish
  "medborgar*", "nationalitet*", "etnisk*", "född", "födelsedatum", "födelseår", "är gift", "gift med", "sambo",
  "skild", "änka", "änkling", "religion*", "hälsotillstånd*", "sjukdom*", "funktionsneds*",
  "gravid*", "föräldraledig*", "mammaledig*", "pappaledig*", "kön", "modersmål*", "förstaspråk*",
  "uppehållstillstånd*", "arbetstillstånd*",
]);

const FAMILY_PHRASES = [
  /(?<![\p{L}\p{N}])(?:my|our|\d+|one|two|three|four|five|six)\s+(?:children|child|kids|sons?|daughters?)(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])(?:mother|father|parent|mum|mom|dad)\s+of(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])(?:yksi|kaksi|kolme|neljä|viisi|kuusi|\d+)\s+(?:lasta|lapsi)(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])minulla\s+on\s+(?:\p{L}+\s+)?lap\p{L}*/iu,
  /(?<![\p{L}\p{N}])(?:mina|våra|ett|två|tre|fyra|fem|sex|\d+)\s+barn(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])(?:mamma|pappa|förälder)\s+till(?![\p{L}\p{N}])/iu,
  // "Finnish (native)", "English – native": the language part is fine, the native marker is not.
  /[(\[]\s*(?:native|äidinkieli|modersmål)\s*[)\]]|[–—-]\s*native(?![\p{L}\p{N}])/iu,
];

function isProtectedSentence(s: string): boolean {
  PROTECTED_WORDS.lastIndex = 0;
  if (PROTECTED_WORDS.test(s)) return true;
  return FAMILY_PHRASES.some((re) => re.test(s));
}

const COUNTRY = wordList(COUNTRIES_AND_DEMONYMS, "gu");

/** Zero-width and control characters (hidden text), except tab and newline. */
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F­​-‏‪-‮⁠-⁤﻿]/g;

// ---------- the pass ----------

function emptyRemoved(): CvRemoved {
  return { name: 0, contact: 0, id: 0, date: 0, personal: 0, section: 0, protected: 0, country: 0 };
}

function replaceCounting(text: string, re: RegExp, removed: CvRemoved, kind: CvRemovedKind): string {
  return text.replace(re, () => {
    removed[kind] += 1;
    return REDACTED;
  });
}

/** Lines out: personal sections, labelled personal lines, and the name line at the top. */
function dropLines(lines: string[], removed: CvRemoved): { kept: string[]; names: string[] } {
  const kept: string[] = [];
  const names: string[] = [];
  let dropping = 0; // non-empty lines left to drop in a personal section, 0 when not in one
  let seenContent = 0; // non-empty lines kept or dropped so far, for the name at the top

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      kept.push("");
      continue;
    }
    // "Curriculum Vitae", "CV" on a line of its own says nothing.
    if (stripCvWords(line) === "") continue;
    seenContent += 1;
    const key = headingKey(line);

    if (key !== null && DROP_SET.has(key)) {
      removed.section += 1;
      dropping = MAX_SECTION_LINES;
      continue;
    }
    if (dropping > 0) {
      if (key !== null && KEEP_SET.has(key)) {
        dropping = 0;
      } else {
        dropping -= 1;
        const label = LABEL_LINE.exec(line);
        if (label && NAME_LABELS.has(label[1]!.toLowerCase().replace(/\s+/g, " "))) names.push(stripCvWords(label[2] ?? ""));
        continue;
      }
    }

    const label = LABEL_LINE.exec(line);
    if (label) {
      if (NAME_LABELS.has(label[1]!.toLowerCase().replace(/\s+/g, " "))) {
        names.push(stripCvWords(label[2] ?? ""));
        removed.name += 1;
      } else {
        removed.personal += 1;
      }
      continue;
    }

    if (names.length === 0 && seenContent <= 3) {
      const candidate = stripCvWords(line);
      if (looksLikeName(candidate)) {
        names.push(candidate);
        removed.name += 1;
        continue;
      }
    }

    kept.push(line);
  }
  return { kept, names: names.filter((n) => n.length > 0) };
}

/** Every later use of the name: the full name first, then each of its words. */
function removeName(text: string, names: string[], removed: CvRemoved): string {
  let out = text;
  for (const name of names) {
    const full = new RegExp(`${BEFORE}${name.split(/\s+/).map(escape).join("\\s+")}${AFTER}`, "giu");
    out = replaceCounting(out, full, removed, "name");
    for (const token of nameTokens(name)) {
      const re = new RegExp(`${BEFORE}(?:${tokenVariants(token).map(escape).join("|")})${AFTER}`, "gu");
      out = replaceCounting(out, re, removed, "name");
    }
  }
  return out;
}

function dropProtectedSentences(text: string, removed: CvRemoved): string {
  return text
    .split("\n")
    .map((line) => {
      if (line.trim() === "") return line;
      const parts = line.split(/(?<=[.!?;])\s+/);
      const kept = parts.filter((p) => {
        if (!isProtectedSentence(p)) return true;
        removed.protected += 1;
        return false;
      });
      return kept.length === parts.length ? line : kept.join(" ");
    })
    .join("\n");
}

/** Tidy: runs of markers become one, empty bracket pairs and stray separators go, blank lines collapse. */
function tidy(text: string): string {
  const marker = escape(REDACTED);
  return text
    .split("\n")
    .map((line) =>
      line
        .replace(new RegExp(`${marker}(?:[\\s,;:/|·•–—()-]*${marker})+`, "g"), REDACTED)
        .replace(/\(\s*\)|\[\s*\]/g, "")
        .replace(/[^\S\n]+/g, " ")
        .trim(),
    )
    .filter((line) => line === "" || (line !== REDACTED && !/^[\s,;:/|·•–—()-]*$/.test(line)))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Remove personal data from CV text by fixed rules. Never throws; never logs. */
export function anonymiseCv(input: string): AnonymisedCv {
  const removed = emptyRemoved();
  const normalised = input.replace(/\r\n?/g, "\n").replace(INVISIBLE, "").normalize("NFC");

  const { kept, names } = dropLines(normalised.split("\n"), removed);
  let text = kept.join("\n");

  text = replaceCounting(text, HETU, removed, "id");
  text = replaceCounting(text, PERSONNUMMER, removed, "id");
  text = replaceCounting(text, IBAN, removed, "id");

  const beforeContacts = text;
  text = redactContacts(text);
  removed.contact += countMarkers(text) - countMarkers(beforeContacts);
  text = replaceCounting(text, URL, removed, "contact");
  text = replaceCounting(text, SOCIAL, removed, "contact");
  text = replaceCounting(text, DOMAIN_PATH, removed, "contact");
  text = replaceCounting(text, HANDLE, removed, "contact");
  text = replaceCounting(text, STREET, removed, "contact");
  text = replaceCounting(text, STREET_EN, removed, "contact");
  text = replaceCounting(text, POSTAL_FI, removed, "contact");
  text = replaceCounting(text, POSTAL_SE, removed, "contact");

  text = removeName(text, names, removed);

  text = dropProtectedSentences(text, removed);

  text = replaceCounting(text, AGE, removed, "date");
  text = replaceCounting(text, DATE_RANGE, removed, "date");
  text = replaceCounting(text, LEADING_RANGE, removed, "date");

  text = replaceCounting(text, COUNTRY, removed, "country");

  return { text: tidy(text), removed };
}

function countMarkers(text: string): number {
  return text.split(REDACTED).length - 1;
}
