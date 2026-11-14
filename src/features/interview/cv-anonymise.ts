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
 * - sentences about protected attributes: nationality, family, religion, health, gender, military
 *   service, age, and the statement of a native language (the language itself stays)
 * - country names and nationality adjectives (nationality proxies); names of languages stay
 *
 * Every pattern here is written so that its time grows with the length of the text, not with its
 * square: an unbounded repetition either starts only at the start of a run (a lookbehind) or is
 * bounded. A hostile file of one repeated shape is handled in the tests.
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

/** The alternatives of a word list as a regex source: `stem*` may continue into a longer word, others may not. */
function wordSource(words: readonly string[]): string {
  return [...words]
    .sort((a, b) => b.length - a.length)
    .map((w) => (w.endsWith("*") ? escape(w.slice(0, -1)) : `${escape(w)}${AFTER}`).replace(/ /g, "\\s+"))
    .join("|");
}

function wordList(words: readonly string[], flags = "giu"): RegExp {
  return new RegExp(`${BEFORE}(?:${wordSource(words)})`, flags);
}

/** Like `wordList`, but a match covers the whole word, also after a `stem*`. For replacing words, not for testing. */
function wholeWords(words: readonly string[], flags = "giu"): RegExp {
  return new RegExp(`${BEFORE}(?:${wordSource(words)})[\\p{L}]*`, flags);
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
    .replace(/(?<=\S) ?\([^)]{0,40}\)$/, "")
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
  "disability", "diagnosis", "health condition", "faith", "military service", "national service",
  "mother tongue", "native language", "first language", "family status", "family situation",
  // Finnish
  "nimi", "etunimi", "sukunimi", "osoite", "katuosoite", "postiosoite", "postinumero", "postitoimipaikka",
  "kotikunta", "asuinpaikka", "asuinkunta", "puhelin", "puh", "matkapuhelin", "gsm", "sähköposti",
  "s-posti", "kotisivu", "kotisivut", "syntymäaika", "syntynyt", "syntymäpaikka", "ikä", "kansalaisuus",
  "sukupuoli", "siviilisääty", "perhe", "perhesuhteet", "lapset", "uskonto", "terveys", "valokuva",
  "henkilötunnus", "hetu", "sotu", "äidinkieli", "vammaisuus", "sairaudet", "terveydentila", "varusmiespalvelus",
  "asepalvelus", "siviilipalvelus", "perhetilanne", "lapsia", "uskonnollinen vakaumus", "vakaumus",
  // Swedish
  "namn", "förnamn", "efternamn", "adress", "postnummer", "postadress", "ort", "telefon", "mobil",
  "e-post", "mejl", "hemsida", "födelsedatum", "född", "födelseort", "ålder", "nationalitet",
  "medborgarskap", "kön", "civilstånd", "familj", "barn", "hälsa", "foto", "personnummer",
  "modersmål", "funktionsnedsättning", "sjukdomar", "värnplikt", "militärtjänst", "trosuppfattning", "familjesituation",
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
const CAP_WORD = new RegExp(`^${CAP}$`, "u");
/** Lowercase parts inside a name: "Johan von Essen", "Anna af Ugglas". */
const PARTICLES = new Set(["von", "van", "der", "den", "de", "af", "av"]);
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
  // more titles and header words, so that "Operations Planner" is not taken for a person
  "barista", "waiter", "waitress", "programmer", "scientist", "researcher", "clerk", "cashier", "receptionist",
  "secretary", "supervisor", "plumber", "welder", "baker", "planner", "buyer", "recruiter", "trainer",
  "coach", "courier", "security", "operations", "finance", "business", "general", "technical", "office",
  "administration", "retail", "restaurant", "kitchen", "production", "quality", "safety", "team", "contact",
  "address", "phone", "email", "mobile", "location", "profile", "summary",
  "hitsaaja", "asentaja", "kirjanpitäjä", "hoitaja", "lääkäri", "tutkija", "tarjoilija", "kassa", "vastaava",
  "työnjohtaja", "vartija", "lastenhoitaja", "ohjaaja", "kouluttaja", "asiakaspalvelija", "asiakaspalvelu",
  "markkinointi", "tuotanto", "ravintola", "keittiö", "varasto", "talous",
  "svetsare", "elektriker", "snickare", "projektledare", "vårdare", "läkare", "forskare", "servitör", "kassör",
  "lagerarbetare", "arbetsledare", "väktare", "barnskötare", "handledare", "kundtjänst", "marknadsföring",
  "produktion", "kvalitet", "säkerhet", "restaurang", "kök", "lager", "ekonomi",
  // company and place words: "Nordea Bank", "Wolt Finland" are employers, not people
  "bank", "group", "oy", "oyj", "ab", "abp", "ltd", "inc", "corp", "company", "university", "college", "school",
  "hospital", "city", "centre", "center", "finland", "sweden", "europe", "nordic",
  "yliopisto", "korkeakoulu", "koulu", "sairaala", "kaupunki", "suomi", "ruotsi", "pohjola",
  "universitet", "högskola", "skola", "sjukhus", "stad", "sverige", "norden",
]);

/** The text without accents ("Lindström" → "lindstrom"), lowercase. For comparing spellings. */
function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function isStopWord(token: string): boolean {
  const t = token.toLowerCase();
  return NOT_NAME_WORDS.has(t) || KEEP_SET.has(t) || DROP_SET.has(t);
}

const isNameWord = (t: string) => CAP_WORD.test(t) && !isStopWord(t);

/**
 * Runs of two to four name-like words inside a header line: "Aino Virtanen", "Johan von Essen",
 * "VIRTANEN AINO", also when the name shares the line with a job title or with contacts
 * ("Aino Maria Virtanen Software Developer"). A run stops at a job title or a heading word.
 */
export function nameRuns(headerLine: string): string[] {
  const runs: string[] = [];
  for (const segment of headerLine.split(/\s*[|•·,–—:/;]\s*|\s{2,}|\s[-–]\s/u)) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || tokens.length > 8) continue;
    // Prose, not a name line: more than one ordinary lowercase word.
    if (tokens.filter((t) => !CAP_WORD.test(t) && !PARTICLES.has(t)).length > 1) continue;
    let i = 0;
    while (i < tokens.length) {
      const run: string[] = [];
      let j = i;
      while (j < tokens.length) {
        const t = tokens[j]!;
        const next = tokens[j + 1];
        if (isNameWord(t)) run.push(t);
        else if (PARTICLES.has(t) && run.length > 0 && next !== undefined && isNameWord(next)) run.push(t);
        else break;
        j += 1;
        if (run.filter((r) => !PARTICLES.has(r)).length === 4) break;
      }
      if (run.filter((r) => !PARTICLES.has(r)).length >= 2) {
        runs.push(run.join(" "));
        i = j;
      } else {
        i = Math.max(j, i + 1);
      }
    }
  }
  return runs;
}

// ---------- the name from the email address and the profile link ----------

const EMAIL_FIND = /(?<![\p{L}\p{N}._%+'-])[\p{L}\p{N}._%+'-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const PROFILE_SLUG = /(?:linkedin\.com\/(?:in|pub)|xing\.com\/profile|github\.com)\/([\p{L}\p{N}%_.-]+)/giu;
const CAPITALISED = /(?<![\p{L}\p{N}])(?:\p{Lu}\p{Ll}+|\p{Lu}{2,})(?![\p{L}\p{N}])/gu;
/** Mailbox names that say nothing about a person. */
const GENERIC_LOCAL = new Set([
  "info", "contact", "contacts", "hello", "hi", "mail", "email", "cv", "work", "jobs", "job", "hr", "admin",
  "office", "support", "sales", "noreply", "me", "my", "the", "and", "team", "post", "posti", "yhteys",
  "kontakt", "kontakti", "tyo", "työ", "recruit", "recruiting", "career", "careers",
]);

/**
 * Spellings (folded) of name words found in the email addresses and profile links of the text.
 * An address such as `erik.lindstrom@…` or `/in/erik-lindstrom-4821` names the person better
 * than anything else in a CV. `single` holds one-word mailboxes ("avirtanen92"), which only
 * count for header words that appear inside them.
 */
function identityParts(text: string): { parts: Set<string>; single: string[] } {
  const parts = new Set<string>();
  const single: string[] = [];
  const addPieces = (pieces: string[]) => {
    for (const p of pieces) {
      const f = fold(p).replace(/[^a-z]/g, "");
      if (f.length >= 3 && !GENERIC_LOCAL.has(f)) parts.add(f);
    }
  };
  for (const m of text.matchAll(EMAIL_FIND)) {
    const local = m[0].slice(0, m[0].lastIndexOf("@"));
    const pieces = local.split(/[._+'-]+/).filter((p) => p.replace(/\d/g, "").length >= 3);
    if (pieces.length >= 2) addPieces(pieces.map((p) => p.replace(/\d+/g, "")));
    else if (pieces.length === 1) {
      const f = fold(pieces[0]!).replace(/[^a-z]/g, "");
      if (f.length >= 5 && !GENERIC_LOCAL.has(f)) single.push(f);
    }
  }
  for (const m of text.matchAll(PROFILE_SLUG)) {
    const pieces = m[1]!.split(/[-_.%]+/).filter((p) => p.length >= 3 && !/\d/.test(p));
    if (pieces.length >= 2) addPieces(pieces);
  }
  return { parts, single };
}

/** Name words of the text (in the text's own spelling) that the email or profile link confirms. */
function confirmedNameWords(text: string, headerText: string, id: { parts: Set<string>; single: string[] }): string[] {
  const found = new Set<string>();
  if (id.parts.size > 0) {
    for (const m of text.matchAll(CAPITALISED)) if (id.parts.has(fold(m[0]))) found.add(m[0]);
  }
  for (const m of headerText.matchAll(CAPITALISED)) {
    const f = fold(m[0]);
    if (f.length >= 4 && !isStopWord(m[0]) && id.single.some((s) => s.includes(f))) found.add(m[0]);
  }
  return [...found];
}

/** Candidates the email or profile link confirms; without confirmation, the first two. */
function pickNames(candidates: string[], confirmed: Set<string>): string[] {
  const sure = candidates.filter((c) => c.split(/[\s-]+/).some((t) => confirmed.has(fold(t))));
  return sure.length > 0 ? sure : candidates.slice(0, 2);
}

function stripCvWords(line: string): string {
  return line
    .replace(CV_WORDS, " ")
    .replace(/[|•·,–—:]+/g, " ")
    .replace(/(^|\s)-(\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NAME_LEADIN = /(?<![\p{L}\p{N}])(?:my\s+name\s+is|my\s+name['’]s|minun\s+nimeni\s+on|nimeni\s+on|jag\s+heter|mitt\s+namn\s+är|mitt\s+namn\s+är)\s+/giu;

/** "My name is Liisa Korhonen", "Nimeni on ...", "Jag heter ...", "Mitt namn är ...": the name that follows. */
function namesFromProse(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(NAME_LEADIN)) {
    const start = (m.index ?? 0) + m[0].length;
    const run: string[] = [];
    let pending: string[] = [];
    for (const raw of text.slice(start, start + 120).split(/\s+/).slice(0, 6)) {
      const w = raw.replace(/[.,;:!?)"”]+$/u, "");
      const last = w !== raw;
      if (isNameWord(w)) {
        run.push(...pending, w);
        pending = [];
      } else if (PARTICLES.has(w) && run.length > 0) {
        pending.push(w);
        continue;
      } else break;
      if (last || run.filter((r) => !PARTICLES.has(r)).length === 4) break;
    }
    if (run.length > 0) out.push(run.join(" "));
  }
  return out;
}

/** The words of a name that are worth removing alone: no particles, no short bits, hyphen parts too. */
function nameTokens(name: string): string[] {
  const out = new Set<string>();
  for (const t of name.split(/\s+/)) {
    if (PARTICLES.has(t) || isStopWord(t)) continue;
    if (t.replace(/[^\p{L}]/gu, "").length >= 3) out.add(t);
    if (t.includes("-")) {
      for (const part of t.split("-")) if (part.length >= 3 && !isStopWord(part)) out.add(part);
    }
  }
  return [...out];
}

/** "MAIJA" also matches "Maija", and "Maija" matches "MAIJA"; "Will" never matches the verb "will". */
function tokenVariants(token: string): string[] {
  const lower = token.toLocaleLowerCase("fi");
  const title = lower.replace(/(^|-)(\p{L})/gu, (_m, sep: string, c: string) => sep + c.toLocaleUpperCase("fi"));
  return [...new Set([token, title, token.toLocaleUpperCase("fi")])];
}

const CASE_ENDINGS = "(?:n|s|a|ä|ssa|ssä|sta|stä|lle|lta|lla|llä|ksi|na|nä|:n|:s|'s|’s)";

/**
 * A regex source that finds the name word as it appears in text: in any case, with or without
 * accents ("Lindström" and "Lindstrom"), and in the endings of Finnish and Swedish ("Ainon",
 * "Virtasen" for Virtanen, "Hintikan" for Hintikka, "Lindströms"). Written in capitals the word
 * is matched as it stands.
 */
function tokenPattern(token: string): string {
  const alts = new Set<string>();
  for (const v of tokenVariants(token)) {
    for (const spelling of new Set([v, v.normalize("NFD").replace(/\p{M}/gu, "")])) {
      const isUpper = spelling === spelling.toLocaleUpperCase("fi") && spelling.length > 1;
      if (isUpper || spelling.length < 4) {
        alts.add(escape(spelling));
        continue;
      }
      alts.add(`${escape(spelling)}${CASE_ENDINGS}?`);
      if (spelling.endsWith("nen")) {
        alts.add(`${escape(spelling.slice(0, -3))}s(?:en|ta|ella|elta|elle|essa|esta|eksi|ena|e)`);
      }
      if (/(?:kk|pp|tt)[aeo]$/.test(spelling)) {
        alts.add(`${escape(spelling.slice(0, -2))}(?:an|alle|alta|alla|asta|assa|aksi|ana|aa|on|olle|olta|olla|osta|ossa|oksi|ona|oa)`);
      }
    }
  }
  return [...alts].join("|");
}

// ---------- inline patterns ----------

const HETU = new RegExp(`${BEFORE}\\d{6}[-+A-FU-Y]\\d{3}[0-9A-Y]${AFTER}`, "gu");
const PERSONNUMMER = new RegExp(`${BEFORE}(?:\\d{2})?\\d{6}[-+]\\d{4}${AFTER}`, "gu");
const IBAN = new RegExp(`${BEFORE}[A-Z]{2}\\d{2}(?:\\s?[A-Z0-9]{4}){3,7}(?:\\s?[A-Z0-9]{1,4})?${AFTER}`, "gu");

const URL = /\b(?:https?:\/\/|www\.)\S+/giu;
const SOCIAL = /\b(?:[a-z]{2,3}\.)?(?:linkedin|github|gitlab|behance|dribbble|facebook|instagram|twitter|x|medium|stackoverflow|tiktok|youtube)\.com\/\S*/giu;
// A match starts only at the start of a run of host characters, so a long run of dots and letters is read once.
const DOMAIN_PATH = /(?<![a-z0-9.-])[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|fi|se|io|net|org|dev|me|eu|app|page|site)\/\S*/giu;
const HANDLE = new RegExp(`${BEFORE}@[\\p{L}\\p{N}_.]{2,}`, "gu");
/** "Instagram: maija_k", "skype: live:maija": a handle that carries no "@", anywhere in a line. */
const SOCIAL_LABEL = new RegExp(
  `${BEFORE}(?:instagram|insta|ig|twitter|tiktok|telegram|snapchat|skype|discord|signal|whatsapp|facebook|fb|threads|mastodon|github|gitlab|linkedin|xing|behance|dribbble|youtube|wechat|kik)\\s*[:：]\\s*[^\\s,;|]+`,
  "giu",
);

const STREET = new RegExp(
  `\\p{Lu}[\\p{L}-]{0,40}(?:tie|katu|kuja|polku|väylä|kaari|rinne|tori|ranta|aukio|piha|vägen|gatan|gränd|stigen|torget|backen)\\s+\\d{1,4}\\s*[A-Za-z]?(?:\\s*\\d{1,3})?${AFTER}`,
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
  `${BEFORE}(?:\\d{2}\\s*(?:years?\\s+old|yrs?\\s+old|y\\/o|-?vuotia\\p{L}*|år\\s+gammal|-?åring|v\\.?|år)|(?:age|aged|ikä|ålder)\\s*:?\\s*\\d{2})${AFTER}`,
  "giu",
);

// ---------- languages ----------

/**
 * Names of languages (English, Finnish and Swedish spellings). A language a person works in is
 * what the interviewer should be able to ask about, so these stay, although many of them are also
 * nationality adjectives in the shared country list. What goes is the statement of a first language.
 */
const LANGUAGES_EN = [
  "English", "Finnish", "Swedish", "Russian", "Arabic", "Somali", "Estonian", "French", "German", "Spanish",
  "Italian", "Portuguese", "Chinese", "Mandarin", "Cantonese", "Japanese", "Korean", "Turkish", "Persian", "Farsi",
  "Kurdish", "Polish", "Dutch", "Norwegian", "Danish", "Icelandic", "Greek", "Hungarian", "Czech", "Slovak",
  "Slovenian", "Latvian", "Lithuanian", "Albanian", "Bulgarian", "Romanian", "Serbian", "Croatian", "Bosnian",
  "Macedonian", "Ukrainian", "Belarusian", "Georgian", "Armenian", "Azerbaijani", "Kazakh", "Uzbek", "Kyrgyz",
  "Tajik", "Turkmen", "Mongolian", "Hindi", "Urdu", "Bengali", "Punjabi", "Tamil", "Nepali", "Thai", "Vietnamese",
  "Burmese", "Malagasy", "Swahili", "Amharic", "Tigrinya", "Hebrew", "Tagalog", "Filipino", "Indonesian", "Malay",
  "Latin", "Sami", "Romani",
] as const;
const LANGUAGES_FI = [
  "suomi", "suomea", "suomeksi", "englanti", "englantia", "englanniksi", "ruotsi", "ruotsia", "ruotsiksi",
  "venäjä", "venäjää", "venäjäksi", "saksa", "saksaa", "saksaksi", "ranska", "ranskaa", "ranskaksi", "espanja",
  "espanjaa", "espanjaksi", "italia", "italiaa", "portugali", "portugalia", "arabia", "arabiaa", "somali",
  "somalia", "viro", "viroa", "kiina", "kiinaa", "japani", "japania", "turkki", "turkkia", "persia", "kurdi",
  "puola", "puolaa", "hollanti", "hollantia", "norja", "norjaa", "tanska", "tanskaa", "unkari", "kreikka",
  "heprea", "hindi", "urdu", "swahili", "latina", "romania", "bulgaria", "serbia", "kroatia", "ukraina",
] as const;
const LANGUAGES_SV = [
  "finska", "svenska", "engelska", "ryska", "tyska", "franska", "spanska", "italienska", "portugisiska",
  "arabiska", "somaliska", "estniska", "kinesiska", "japanska", "turkiska", "persiska", "kurdiska", "polska",
  "holländska", "nederländska", "norska", "danska", "isländska", "grekiska", "ungerska", "hebreiska", "latin",
] as const;

const LANGUAGE_SET = new Set<string>([...LANGUAGES_EN, ...LANGUAGES_FI, ...LANGUAGES_SV].map((l) => l.toLowerCase()));
const LANGUAGE_SRC = wordSource([...LANGUAGES_EN, ...LANGUAGES_FI, ...LANGUAGES_SV]);

/** A first-language marker: "native", "native speaker", "mother tongue", "äidinkieli", "modersmål" and their forms. */
const NATIVE_SRC =
  "(?:native(?:[\\s-]+(?:speaker|level|proficiency|fluency))?|mother\\s+tongue|first\\s+language|äidinkiel\\p{L}*|ensikiel\\p{L}*|modersmål\\p{L}*|förstaspråk\\p{L}*)";

/** "Finnish (native)", "Finnish: native", "Finnish – native speaker", "suomi äidinkielenä": the marker goes, the language stays. */
const NATIVE_AFTER_LANG = new RegExp(
  `${BEFORE}(${LANGUAGE_SRC})(?:[^\\S\\n]*[(\\[]\\s*${NATIVE_SRC}\\s*[)\\]]|[^\\S\\n]*[:：–—-][^\\S\\n]*${NATIVE_SRC}|[^\\S\\n]+${NATIVE_SRC})${AFTER}`,
  "giu",
);
/** "Native speaker of Finnish", "native Finnish speaker", "native-level English": the marker before the language goes. */
const NATIVE_BEFORE_LANG = new RegExp(
  `${BEFORE}(?:native(?:[\\s-]+(?:speaker|level|proficiency|fluency))?(?:\\s+of)?|(?:mother\\s+tongue|first\\s+language)\\s*[:：])[\\s-]+(?=(?:${LANGUAGE_SRC}))`,
  "giu",
);
/** A language this list does not know: "Xhosa (native)", "Xhosa: native," a bracket or a closing segment. */
const NATIVE_GENERIC = new RegExp(
  `(?<=\\S)[^\\S\\n]*[(\\[]\\s*${NATIVE_SRC}\\s*[)\\]]|(?<=\\p{L})[^\\S\\n]*[:：–—-][^\\S\\n]*native(?=[^\\S\\n]*(?:[,;.)]|\\n|$))`,
  "giu",
);

function stripNativeMarkers(text: string, removed: CvRemoved): string {
  let out = text;
  for (const re of [NATIVE_AFTER_LANG, NATIVE_BEFORE_LANG, NATIVE_GENERIC]) {
    out = out.replace(re, (m: string, lang?: unknown) => {
      removed.protected += 1;
      return re === NATIVE_AFTER_LANG && typeof lang === "string" ? lang : "";
    });
  }
  return out;
}

// ---------- nationality words in Finnish and Swedish ----------

/** Finnish and Swedish nationality words, and "foreigner" words. Stems end with `*`. */
const DEMONYMS_FI_SV = [
  // Finnish
  "suomalai*", "suomenruotsalai*", "virolai*", "ruotsalai*", "venäläi*", "saksalai*", "ranskalai*", "espanjalai*",
  "italialai*", "brittiläi*", "englantilai*", "amerikkalai*", "norjalai*", "tanskalai*", "puolalai*", "ukrainalai*",
  "kiinalai*", "intialai*", "turkkilai*", "irakilai*", "iranilai*", "somalialai*", "syyrialai*", "afganistanilai*",
  "pakistanilai*", "kreikkalai*", "unkarilai*", "latvialai*", "liettualai*", "romanialai*", "bulgarialai*",
  "serbialai*", "nigerialai*", "etiopialai*", "eritrealai*", "marokkolai*", "egyptiläi*", "thaimaalai*",
  "vietnamilai*", "filippiiniläi*", "kosovolai*", "albanialai*", "bosnialai*", "israelilai*", "libanonilai*",
  "afrikkalai*", "aasialai*", "ulkomaalai*", "maahanmuuttaja*", "kansalaisuude*",
  // Swedish
  "svensk", "svenskt", "svensken", "svenskar", "finländare", "finländsk*", "finne", "finnar", "estländare",
  "estnisk*", "ryss", "ryssar", "tysk", "tyskar", "fransman", "fransk", "franskt", "norrman", "norsk", "dansk",
  "polsk", "ukrainare", "ukrainsk*", "irakier", "syrier", "somalier", "kines", "kinesisk*", "turk", "amerikan",
  "amerikansk*", "brittisk*", "engelsman", "italienare", "italiensk*", "spanjor", "spansk*", "greker", "grekisk*",
  "ungrare", "ungersk*", "utländsk*", "invandrare",
] as const;
const DEMONYM_FI_SV = wholeWords(DEMONYMS_FI_SV);

/** Every word that can name a nationality: the shared list, the languages that double as one, and the above. */
const NATIONALITY_SRC = [
  wordSource([...COUNTRIES_AND_DEMONYMS, ...LANGUAGES_EN, ...DEMONYMS_FI_SV]),
].join("|");
const NOT_A_PERSON = "(?!\\s+(?:teacher|tutor|speaker|translator|interpreter|instructor|lecturer|trainer|student|professor|language|literature|studies|courses?|classes|grammar|keyboard|market|customers?|clients?)(?![\\p{L}\\p{N}]))";

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
  "faith", "religious", "believer*", "christian*", "muslim*", "islam*", "jewish", "judaism", "hindu*", "buddhis*",
  "catholic*", "lutheran*", "atheis*", "agnostic*", "military service", "national service", "conscript*",
  "military duty", "army service", "reservist*", "sick leave",
  // Finnish
  "kansalaisuu*", "kansalainen", "syntynyt", "syntyperä*", "syntymäaika", "syntymäpaikka", "syntymävuo*",
  "naimisi*", "avioliito*", "aviomie*", "vaimo*", "puoliso*", "eronnut", "lapseni", "lapsemme",
  "uskonto*", "uskonno*", "terveydentila*", "sairau*", "vamma*", "diagnoo*", "raskaana", "raskau*",
  "äitiysloma*", "isyysloma*", "vanhempainvapaa*", "perhevapaa*", "hoitovapaa*", "sukupuol*",
  "äidinkiel*", "oleskelulu*", "työlupa*", "työluva*", "perheeseeni", "perheeni", "perheellinen",
  "perheetön", "seurakun*",
  "uskova*", "kristitty", "kristitty*", "kristillis*", "muslimi*", "juutalai*", "buddhalai*", "hindulai*",
  "ateisti*", "luterila*", "ortodoksi*", "varusmies*", "asepalvelu*", "siviilipalvelu*", "reservin*",
  "reserviläi*", "sairausloma*", "sairaslom*", "mies", "nainen",
  // Swedish
  "medborgar*", "nationalitet*", "etnisk*", "född", "födelsedatum", "födelseår", "är gift", "gift med", "sambo",
  "skild", "änka", "änkling", "religion*", "hälsotillstånd*", "sjukdom*", "funktionsneds*",
  "gravid*", "föräldraledig*", "mammaledig*", "pappaledig*", "kön", "modersmål*", "förstaspråk*",
  "uppehållstillstånd*", "arbetstillstånd*",
  "kristen*", "judisk*", "katolsk*", "ateist*", "troende", "trosuppfattning*", "församling*", "kyrka*",
  "moské*", "värnplikt*", "militärtjänst*", "civiltjänst*", "sjukskriv*", "sjukledig*", "manlig", "kvinnlig",
  "kvinna",
]);

/** Health words as single words: replaced where they stand, so "a diabetes ward" stays a ward. */
const HEALTH_WORDS_LIST = [
  "adhd", "autis*", "asperger*", "dyslex*", "dysleks*", "diabet*", "depress*", "masennu*", "masentun*",
  "anxiety", "ahdistu*", "ahdistuneisuu*", "ångest*", "bipolar*", "bipolaari*", "skitsofren*", "schizophren*",
  "epilep*", "astma*", "asthma", "cancer", "syöpä*", "syövä*", "handicap*", "vammaisuu*", "burnout", "burn-out",
  "uupumu*", "ptsd", "hiv", "mental illness", "eating disorder", "tourette*", "ocd",
] as const;
const HEALTH_WORDS = wholeWords(HEALTH_WORDS_LIST);
const HEALTH_SRC = wordSource(HEALTH_WORDS_LIST);

const ME = "(?:i\\s+am|i['’]m|olen|jag\\s+är)";
const NB = "(?<![\\p{L}\\p{N}])";

const FAMILY_PHRASES = [
  /(?<![\p{L}\p{N}])(?:my|our|\d+|one|two|three|four|five|six)\s+(?:children|child|kids|sons?|daughters?)(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])(?:mother|father|parent|mum|mom|dad)\s+of(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])(?:yksi|kaksi|kolme|neljä|viisi|kuusi|\d+)\s+(?:lasta|lapsi)(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])minulla\s+on\s+(?:\p{L}+\s+)?lap\p{L}*/iu,
  /(?<![\p{L}\p{N}])(?:mina|våra|ett|två|tre|fyra|fem|sex|\d+)\s+barn(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])(?:mamma|pappa|förälder)\s+till(?![\p{L}\p{N}])/iu,
  // "I have a son", "I have three young children", "jag har tre barn": a statement about the person.
  /(?<![\p{L}\p{N}])(?:i\s+have|i['’]ve\s+got|jag\s+har|vi\s+har)\s+(?:(?:\d+|one|two|three|four|five|six|a|an|small|young|little|grown|två|tre|fyra|ett|en)\s+){1,2}(?:children|child|kids?|sons?|daughters?|barn|son|dotter|döttrar)(?![\p{L}\p{N}])/iu,
];

/** Statements about the person, in first person or as a plain label. A work line never has these shapes. */
const PERSONAL_STATEMENTS: RegExp[] = [
  // age
  new RegExp(`${NB}${ME}\\s+\\d{2}(?![\\p{L}\\p{N}/%:]|[.,]\\d)`, "iu"),
  // health: "I have ADHD", "my dyslexia", "diagnosed with diabetes", "living with depression", "minulla on ADHD"
  new RegExp(
    `${NB}(?:i\\s+(?:have|had|suffer(?:ed)?\\s+from|live\\s+with|am\\s+living\\s+with|am\\s+diagnosed(?:\\s+with)?|was\\s+diagnosed(?:\\s+with)?)|i['’]ve|my|diagnosed\\s+with|suffer(?:s|ing)?\\s+from|living\\s+with|lives\\s+with|minulla\\s+on|minulla\\s+oli|minun|sairastan|sairastin|sairastanut|jag\\s+har|jag\\s+lider\\s+av|min|mitt)\\s+(?:[\\p{L}\\p{N}]+\\s+){0,2}(?:${HEALTH_SRC})`,
    "iu",
  ),
  // gender, family status, nationality as "I am ..."
  new RegExp(`${NB}${ME}\\s+(?:an?\\s+|en\\s+|ett\\s+)?(?:male|female|man|woman|mies|nainen|kvinna|pojka|tyttö|poika|girl|boy|lady|gentleman)(?![\\p{L}\\p{N}])`, "iu"),
  new RegExp(
    `${NB}${ME}\\s+(?:an?\\s+|en\\s+)?(?:single|married|divorced|widowed|father|mother|parent|dad|mum|mom|pappa|mamma|isä|äiti|vanhempi|yksinhuoltaja|sinkku|naimaton|ogift|singel|förälder|gift)(?![\\p{L}\\p{N}])`,
    "iu",
  ),
  new RegExp(`${NB}${ME}\\s+(?:an?\\s+|en\\s+)?(?:${NATIONALITY_SRC})${NOT_A_PERSON}`, "iu"),
  // nationality: "Russian-born", "Somali origin", "of Kenyan descent", "Kenyan passport"
  new RegExp(`${NB}(?:${NATIONALITY_SRC})[\\s-]+(?:born|origin|descent|heritage|national|nationality|passport)(?![\\p{L}\\p{N}])`, "iu"),
  new RegExp(`${NB}of\\s+(?:${NATIONALITY_SRC})\\s+(?:origin|descent|heritage|background)(?![\\p{L}\\p{N}])`, "iu"),
  // Finnish and Swedish: "Olen suomalainen", "Jag är finländare"
  new RegExp(`${NB}(?:olen|oli|jag\\s+är)\\s+(?:\\p{L}+\\s+)?(?:${wordSource(DEMONYMS_FI_SV)})`, "iu"),
];

/** Words of a line that only says family status: "Married, two children", "Single, no children", "Gift, två barn". */
const FAMILY_TERMS = new Set([
  "married", "single", "divorced", "widowed", "children", "child", "kids", "kid", "son", "sons", "daughter",
  "daughters", "family", "naimisissa", "naimaton", "eronnut", "leski", "avoliitossa", "lapsi", "lapsia", "lasta",
  "lapset", "perhe", "barn", "gift", "ogift", "singel", "skild", "sambo", "änka", "änkling", "familj",
]);
const FAMILY_FILLER = new Set([
  "and", "ja", "och", "with", "no", "none", "ei", "inga", "a", "of", "one", "two", "three", "four", "five", "six",
  "yksi", "kaksi", "kolme", "neljä", "viisi", "kuusi", "ett", "en", "två", "tre", "fyra", "fem", "sex", "the", "my",
  "minulla", "on", "har", "have", "i", "am", "olen", "jag", "är",
]);

function isFamilyOnly(sentence: string): boolean {
  const words = sentence.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0 || words.length > 10) return false;
  let term = false;
  for (const w of words) {
    if (FAMILY_TERMS.has(w)) term = true;
    else if (!FAMILY_FILLER.has(w) && !/^\d+$/.test(w)) return false;
  }
  return term;
}

function isProtectedSentence(s: string): boolean {
  PROTECTED_WORDS.lastIndex = 0;
  if (PROTECTED_WORDS.test(s)) return true;
  return FAMILY_PHRASES.some((re) => re.test(s)) || PERSONAL_STATEMENTS.some((re) => re.test(s)) || isFamilyOnly(s);
}

/** Country names and nationality adjectives, except those that are also the names of languages. */
const COUNTRY = wordList(
  COUNTRIES_AND_DEMONYMS.filter((c) => !LANGUAGE_SET.has(c.toLowerCase())),
  "gu",
);

/** Zero-width and control characters (hidden text), except tab and newline. */
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F­​-‏‪-‮⁠-⁤﻿]/g;

// ---------- where the person lives (header only) ----------

/**
 * Towns and countries, removed from the header block only: there they are a home address. In
 * the body "Nokia, Espoo" or "Stockholm office" says where an employer is, which is work.
 */
const HEADER_PLACES = wordList([
  // Finnish towns (Finnish, Swedish and English forms)
  "Helsinki", "Helsingfors", "Espoo", "Esbo", "Vantaa", "Vanda", "Kauniainen", "Grankulla", "Tampere",
  "Tammerfors", "Turku", "Åbo", "Oulu", "Uleåborg", "Jyväskylä", "Lahti", "Kuopio", "Pori", "Björneborg",
  "Joensuu", "Lappeenranta", "Hämeenlinna", "Vaasa", "Vasa", "Seinäjoki", "Rovaniemi", "Kotka", "Kouvola",
  "Mikkeli", "Porvoo", "Borgå", "Kokkola", "Karleby", "Hyvinkää", "Lohja", "Lojo", "Järvenpää", "Nurmijärvi",
  "Rauma", "Kajaani", "Kerava", "Savonlinna", "Tuusula", "Kirkkonummi", "Kyrkslätt", "Sipoo", "Sibbo",
  "Riihimäki", "Salo", "Raasepori", "Raseborg", "Imatra", "Kemi", "Tornio", "Iisalmi", "Raisio", "Naantali",
  "Kangasala", "Ylöjärvi", "Pirkkala", "Lempäälä", "Kaarina", "Mariehamn", "Maarianhamina",
  // Swedish towns
  "Stockholm", "Göteborg", "Gothenburg", "Malmö", "Uppsala", "Västerås", "Örebro", "Linköping", "Helsingborg",
  "Jönköping", "Norrköping", "Lund", "Umeå", "Gävle", "Borås", "Södertälje", "Eskilstuna", "Karlstad", "Täby",
  "Växjö", "Halmstad", "Sundsvall", "Luleå", "Trollhättan", "Östersund", "Borlänge", "Kalmar", "Falun",
  "Skövde", "Karlskrona", "Kristianstad", "Skellefteå", "Uddevalla", "Lidingö", "Landskrona", "Nyköping",
  "Solna", "Sundbyberg", "Nacka", "Huddinge", "Haninge", "Botkyrka", "Sollentuna", "Märsta", "Varberg",
  "Kista", "Älvsjö", "Bromma",
  // countries of residence
  "Finland", "Sweden", "Sverige",
]);
/** "Suomi" and "Ruotsi" are also the languages: only the capitalised word, as an address has it, goes. */
const HEADER_PLACES_CS = wordList(["Suomi", "Ruotsi"], "gu");

// ---------- the pass ----------

/** Non-empty lines at the top that can still be the header, when no heading comes first. */
const HEADER_MAX_LINES = 10;
/** Name runs are looked for in this many non-empty lines at the top. */
const NAME_SCAN_LINES = 3;

function emptyRemoved(): CvRemoved {
  return { name: 0, contact: 0, id: 0, date: 0, personal: 0, section: 0, protected: 0, country: 0 };
}

function replaceCounting(text: string, re: RegExp, removed: CvRemoved, kind: CvRemovedKind): string {
  return text.replace(re, () => {
    removed[kind] += 1;
    return REDACTED;
  });
}

/** A header line with contacts and links turned into separators, ready to look for a name in. */
function forNameScan(line: string): string {
  return redactContacts(line)
    .replace(URL, REDACTED)
    .replace(SOCIAL, REDACTED)
    .replace(DOMAIN_PATH, REDACTED)
    .split(REDACTED)
    .join(" | ");
}

/** "References: Matti ..." or "Referenser Anna ..." on one line: the reference's name and contacts follow. */
const INLINE_REFERENCES = /^\s*(?:[-•*▪●]\s*)?(?:(?:references|referees|suosittelijat|referenser|referenspersoner)(?=[\s:–—-])|(?:reference|suosittelija)\s*[:–—-])\s*[:–—-]?\s*\S/iu;
/** "Hobbies: running, reading": a dropped heading with its content on the same line. */
const INLINE_DROP = new RegExp(
  `^\\s*(?:[-•*▪●]\\s*)?(?:${DROP_HEADINGS.filter((h) => !/reference|referee|suosittelij|referens/.test(h))
    .sort((a, b) => b.length - a.length)
    .map((h) => escape(h).replace(/ /g, "\\s+"))
    .join("|")})\\s*[:：–—-]\\s*\\S`,
  "iu",
);

/** One capitalised word of three letters or more that is not a job word, a heading, a place or a country. */
function isLoneName(line: string): boolean {
  if (/\s/.test(line) || !isNameWord(line) || line.replace(/[^\p{L}]/gu, "").length < 3) return false;
  for (const re of [HEADER_PLACES, HEADER_PLACES_CS, COUNTRY]) {
    re.lastIndex = 0;
    if (re.test(line)) return false;
  }
  return true;
}

type LineResult = {
  kept: string[];
  /** Names from labelled lines ("Name: ..."), always taken. */
  labelled: string[];
  /** Name-like runs from the top lines: used when the email or profile link confirms one, else the first two. */
  candidates: string[];
  /** How many entries of `kept` belong to the header (before the first section heading). */
  headerLength: number;
};

/** Lines out: personal sections and labelled personal lines. Names and the header are noted on the way. */
function dropLines(lines: string[], removed: CvRemoved): LineResult {
  const kept: string[] = [];
  const labelled: string[] = [];
  const candidates: string[] = [];
  let dropping = 0; // non-empty lines left to drop in a personal section, 0 when not in one
  let untilBlank = false; // an inline "References: ..." line: its section ends at the next empty line
  let seenContent = 0; // non-empty lines so far
  let header = true;
  let headerLength = -1;
  const endHeader = () => {
    if (header) {
      header = false;
      headerLength = kept.length;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      if (untilBlank) dropping = 0;
      untilBlank = false;
      kept.push("");
      continue;
    }
    // "Curriculum Vitae", "CV" on a line of its own says nothing.
    if (stripCvWords(line) === "") continue;
    seenContent += 1;
    const key = headingKey(line);
    const isHeading = key !== null && (DROP_SET.has(key) || KEEP_SET.has(key));
    if (isHeading || seenContent > HEADER_MAX_LINES) endHeader();

    if (key !== null && DROP_SET.has(key)) {
      removed.section += 1;
      dropping = MAX_SECTION_LINES;
      continue;
    }
    if (dropping === 0 && INLINE_REFERENCES.test(line)) {
      removed.section += 1;
      dropping = MAX_SECTION_LINES;
      untilBlank = true;
      continue;
    }
    if (dropping === 0 && INLINE_DROP.test(line)) {
      removed.section += 1;
      continue;
    }
    if (dropping > 0) {
      if (key !== null && KEEP_SET.has(key)) {
        dropping = 0;
        untilBlank = false;
      } else {
        dropping -= 1;
        const label = LABEL_LINE.exec(line);
        if (label && NAME_LABELS.has(label[1]!.toLowerCase().replace(/\s+/g, " "))) labelled.push(stripCvWords(label[2] ?? ""));
        continue;
      }
    }

    const label = LABEL_LINE.exec(line);
    if (label) {
      if (NAME_LABELS.has(label[1]!.toLowerCase().replace(/\s+/g, " "))) {
        labelled.push(stripCvWords(label[2] ?? ""));
        removed.name += 1;
      } else {
        removed.personal += 1;
      }
      continue;
    }

    if (header && !isHeading && seenContent <= NAME_SCAN_LINES) {
      candidates.push(...nameRuns(forNameScan(line)));
      // A first name alone on the first line of the header.
      if (seenContent === 1 && isLoneName(line)) candidates.push(line);
    }

    kept.push(line);
  }
  endHeader();
  return { kept, labelled: labelled.filter((n) => n.length > 0), candidates, headerLength };
}

const MAX_NAMES = 16;
/** A real name is short; a longer "name" is not one, and it would only make a very large pattern. */
const MAX_NAME_LENGTH = 80;

/** Every use of the names: the full name first, then each of its words as it appears in text. */
function removeName(text: string, allNames: string[], removed: CvRemoved): string {
  let out = text;
  // A hostile file with thousands of "Name:" lines must not mean thousands of passes over the text.
  const names = [...new Set(allNames)].filter((n) => n.length <= MAX_NAME_LENGTH).slice(0, MAX_NAMES);
  for (const name of names) {
    const full = new RegExp(`${BEFORE}${name.split(/\s+/).map(escape).join("\\s+")}${AFTER}`, "giu");
    out = replaceCounting(out, full, removed, "name");
    for (const token of nameTokens(name)) {
      out = replaceCounting(out, new RegExp(`${BEFORE}(?:${tokenPattern(token)})${AFTER}`, "gu"), removed, "name");
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

const SEPARATORS = new Set(["|", "•", "·", ",", "–", "—", ":", "/", "-"]);

/** "Kesko – [removed]": a separator that now leads to nothing goes. Walks back from the end, once. */
function stripSeparatorBeforeMarker(line: string): string {
  if (!line.endsWith(REDACTED)) return line;
  let i = line.length - REDACTED.length;
  let sawSeparator = false;
  while (i > 0 && (SEPARATORS.has(line[i - 1]!) || /\s/.test(line[i - 1]!))) {
    if (SEPARATORS.has(line[i - 1]!)) sawSeparator = true;
    i -= 1;
  }
  if (!sawSeparator || i === 0) return line;
  return line.slice(0, i);
}

/** Tidy: runs of markers become one, empty bracket pairs and stray separators go, blank lines collapse. */
function tidy(text: string): string {
  const marker = escape(REDACTED);
  return text
    .split("\n")
    .map((line) => {
      const head = line
        .replace(new RegExp(`${marker}(?:[\\s,;:/|·•–—()-]*${marker})+`, "g"), REDACTED)
        // "[removed] – Customer Service Specialist": the removed name leaves its separator behind.
        .replace(new RegExp(`^${marker}\\s*[|•·,–—:/-]+\\s*(?=\\S)`), "");
      return stripSeparatorBeforeMarker(head)
        .replace(/\(\s*\)|\[\s*\]/g, "")
        .replace(/[^\S\n]+/g, " ")
        .trim();
    })
    .filter((line) => line === "" || (line !== REDACTED && !/^[\s,;:/|·•–—()-]*$/.test(line)))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Remove personal data from CV text by fixed rules. Never throws; never logs. */
export function anonymiseCv(input: string): AnonymisedCv {
  const removed = emptyRemoved();
  const normalised = input.replace(/\r\n?/g, "\n").replace(INVISIBLE, "").normalize("NFC");

  // The email and profile link name the person best: read them before anything is removed,
  // from the whole text (a contact section is dropped later).
  const identity = identityParts(normalised);
  const proseNames = namesFromProse(normalised);
  const { kept, labelled, candidates, headerLength } = dropLines(normalised.split("\n"), removed);

  // Home town and country, in the header only. Postal codes go first: "33100 Tampere" is one address.
  for (let i = 0; i < Math.min(headerLength, kept.length); i++) {
    let line = replaceCounting(kept[i]!, POSTAL_FI, removed, "contact");
    line = replaceCounting(line, POSTAL_SE, removed, "contact");
    line = replaceCounting(line, HEADER_PLACES, removed, "contact");
    kept[i] = replaceCounting(line, HEADER_PLACES_CS, removed, "contact");
  }
  let text = kept.join("\n");

  const headerText = kept.slice(0, headerLength).join("\n");
  const confirmedWords = confirmedNameWords(normalised, headerText, identity);
  const confirmed = new Set([...identity.parts, ...confirmedWords.map(fold)]);
  const names = [...labelled, ...proseNames, ...pickNames(candidates, confirmed), ...confirmedWords];

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
  text = replaceCounting(text, SOCIAL_LABEL, removed, "contact");
  text = replaceCounting(text, STREET, removed, "contact");
  text = replaceCounting(text, STREET_EN, removed, "contact");
  text = replaceCounting(text, POSTAL_FI, removed, "contact");
  text = replaceCounting(text, POSTAL_SE, removed, "contact");

  text = removeName(text, names, removed);

  text = stripNativeMarkers(text, removed);
  text = dropProtectedSentences(text, removed);
  text = replaceCounting(text, HEALTH_WORDS, removed, "protected");

  text = replaceCounting(text, AGE, removed, "date");
  text = replaceCounting(text, DATE_RANGE, removed, "date");
  text = replaceCounting(text, LEADING_RANGE, removed, "date");

  text = replaceCounting(text, COUNTRY, removed, "country");
  text = replaceCounting(text, DEMONYM_FI_SV, removed, "country");

  return { text: tidy(text), removed };
}

function countMarkers(text: string): number {
  return text.split(REDACTED).length - 1;
}
