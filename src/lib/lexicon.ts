/**
 * Word lists that keep evaluation and protected attributes out of the product.
 * Source: docs/specs/interview.md sections 10.3 and 10.4, extended by the lead with Swedish,
 * with Finnish stems that also match inflected forms, and with fixes for entries that
 * collided with ordinary work vocabulary. Lead-owned: the interview guard, the turn
 * extractor's merge step and card synthesis all use these, so they must not drift.
 *
 * How entries match (always case-insensitive, always starting at a word boundary):
 * - an entry ending in `*` is a stem: `sairau*` matches `sairaus` and `sairausloma`;
 * - any other entry is a whole word or phrase: `senior` matches "senior developer" but
 *   not "seniors", and `taso` does not match `tasoitus`.
 * Country names and nationality adjectives are matched case-sensitively as whole words,
 * because many are also ordinary words in lower case (`polish`, `turkey`, `china`).
 *
 * The lists err on the side of blocking. When a question is dropped, the interviewer falls
 * back to a scripted bank question, which is a mild cost; a protected question getting
 * through is not.
 */

/** The interviewer must never say these: praise, levels, or remarks on manner of speaking. */
export const BANNED_EVALUATIVE = [
  // English
  "impressive", "great", "excellent", "amazing", "awesome", "fantastic", "wonderful", "brilliant",
  "outstanding", "perfect", "perfectly", "well done", "good job", "nice work", "strong",
  "stronger", "strongest", "talented", "skilled", "expert", "senior", "junior", "level", "levels",
  "score", "scores", "rating", "ratings", "you sound", "you seem", "you look like",
  "you look good", "you look tired", "you look nervous", "you look young", "you look old",
  "confident", "nervous", "passionate", "enthusias*", "your accent", "your english",
  "your finnish", "your swedish", "fluent", "fluently",
  // Finnish
  "vaikuttava", "vaikuttavaa", "vaikuttavan", "vaikuttavalta", "upea*", "hieno", "hienoa",
  "hienosti", "hienon", "hienolta", "mahtava*", "loistava*", "erinomai*", "täydelli*",
  "hyvin tehty", "hyvä vastaus", "taitava*", "lahjakas", "lahjakk*", "kokenut", "taso", "tason",
  "tasoa", "tasosi", "tasolla", "tasoinen", "tasoista", "pisteet", "pisteitä", "kuulostat",
  "vaikutat", "itsevarma*", "hermostu*", "innokas", "innokk*", "aksentti*", "aksentin",
  "aksenttisi", "suomesi", "englantisi", "ruotsisi", "sujuva*",
  // Swedish
  "imponera*", "fantastisk*", "utmärkt*", "underbar*", "lysande", "perfekt", "bra jobbat",
  "bra svar", "snyggt jobbat", "duktig*", "skicklig*", "talang*", "begåvad*", "nivå", "nivån",
  "poäng", "betyg", "du låter", "du verkar", "självsäker*", "nervös*", "passionerad*",
  "entusias*", "din accent", "din brytning", "din svenska", "din engelska", "din finska",
  "flytande",
] as const;

/** List A: topics the interviewer must never ask about. */
export const PROTECTED_QUESTION = [
  // English
  "how old", "your age", "were you born", "when you were born", "where are you from",
  "where do you come from", "nationality", "citizenship", "ethnic*", "religio*", "married",
  "husband", "wife", "children", "kids", "pregnan*", "maternity", "your health", "disab*",
  "illness", "illnesses", "diagnos*", "visa", "residence permit", "work permit",
  "native language", "mother tongue", "first language", "gender",
  // Finnish. Stems, so that inflected forms match (äidinkielesi, lapsesi, oleskeluluvan).
  "ikäsi", "minkä ikäinen", "kuinka vanha", "milloin synnyit", "olet syntynyt", "syntymävuo*",
  "mistä olet kotoisin", "kansalaisuu*", "etni*", "uskonto*", "uskonno*", "naimisi*", "puoliso*",
  "vaimo*", "aviomie*", "laps*", "lasta", "lasten", "raskau*", "raskaana", "äitiysloma*",
  "terveydentila*", "sairau*", "vamma*", "diagnoo*", "oleskelulu*", "työlupa*", "työluva*",
  "viisumi*", "äidinkiel*", "sukupuol*",
  // Swedish. Phrases rather than short words, so they cannot collide with English or Finnish.
  "hur gammal", "din ålder", "när är du född", "är du född", "när föddes du",
  "var kommer du ifrån", "varifrån kommer du", "nationalitet*", "medborgarskap*", "etnisk*",
  "är du gift", "din make", "din maka", "din fru", "din man", "har du barn", "barn har du",
  "dina barn", "gravid*", "föräldraledig*", "mammaledig*", "din hälsa", "funktionsneds*",
  "sjukdom*", "visum", "uppehållstillstånd*", "arbetstillstånd*", "modersmål*", "förstaspråk*",
  "ditt kön",
] as const;

/**
 * List B: terms that must not appear in card text (headline, phrase, company view).
 * Narrower than list A, because words such as "health and safety" are legitimate skills.
 * Card text is always English.
 */
export const PROTECTED_CARD = [
  "nationality", "citizen*", "ethnic*", "religio*", "married", "husband", "wife", "my children",
  "kids", "pregnan*", "maternity leave", "paternity leave", "disab*", "diagnos*", "visa",
  "residence permit", "work permit", "native language", "mother tongue", "native speaker", "gender",
] as const;

const PROTECTED_CARD_PATTERNS = [/\b\d{2} years old\b/i, /\baged \d/i];

/**
 * Countries and nationality adjectives. Finland, the Nordics and Europe are left out on
 * purpose: "Finnish labour law" or "Nordic market sales" describe the labour market a skill
 * applies to, not where a person comes from.
 */
export const COUNTRIES_AND_DEMONYMS = [
  "Afghanistan", "Afghan", "Albania", "Albanian", "Algeria", "Algerian", "Angola", "Angolan",
  "Argentina", "Argentinian", "Argentine", "Armenia", "Armenian", "Australia", "Australian",
  "Austria", "Austrian", "Azerbaijan", "Azerbaijani", "Bahrain", "Bahraini", "Bangladesh",
  "Bangladeshi", "Belarus", "Belarusian", "Belgium", "Belgian", "Benin", "Beninese", "Bolivia",
  "Bolivian", "Bosnia", "Bosnian", "Botswana", "Brazil", "Brazilian", "Bulgaria", "Bulgarian",
  "Burkina Faso", "Burundi", "Burundian", "Cambodia", "Cambodian", "Cameroon", "Cameroonian",
  "Canada", "Canadian", "Chad", "Chadian", "Chile", "Chilean", "China", "Chinese", "Colombia",
  "Colombian", "Congo", "Congolese", "Costa Rica", "Costa Rican", "Croatia", "Croatian", "Cuba",
  "Cuban", "Cyprus", "Cypriot", "Czechia", "Czech", "Denmark", "Danish", "Dominican", "Ecuador",
  "Ecuadorian", "Egypt", "Egyptian", "El Salvador", "Salvadoran", "Eritrea", "Eritrean",
  "Estonia", "Estonian", "Ethiopia", "Ethiopian", "France", "French", "Gambia", "Gambian",
  "Georgia", "Georgian", "Germany", "German", "Ghana", "Ghanaian", "Greece", "Greek", "Guatemala",
  "Guatemalan", "Guinea", "Guinean", "Haiti", "Haitian", "Honduras", "Honduran", "Hungary",
  "Hungarian", "Iceland", "Icelandic", "India", "Indian", "Indonesia", "Indonesian", "Iran",
  "Iranian", "Persian", "Iraq", "Iraqi", "Ireland", "Irish", "Israel", "Israeli", "Italy",
  "Italian", "Ivory Coast", "Ivorian", "Jamaica", "Jamaican", "Japan", "Japanese", "Jordan",
  "Jordanian", "Kazakhstan", "Kazakh", "Kenya", "Kenyan", "Korea", "Korean", "Kosovo", "Kosovar",
  "Kurdistan", "Kurdish", "Kuwait", "Kuwaiti", "Kyrgyzstan", "Kyrgyz", "Laos", "Laotian", "Latvia",
  "Latvian", "Lebanon", "Lebanese", "Liberia", "Liberian", "Libya", "Libyan", "Lithuania",
  "Lithuanian", "Luxembourg", "Madagascar", "Malagasy", "Malawi", "Malawian", "Malaysia",
  "Malaysian", "Mali", "Malian", "Malta", "Maltese", "Mauritania", "Mauritius", "Mexico",
  "Mexican", "Moldova", "Moldovan", "Mongolia", "Mongolian", "Montenegro", "Montenegrin",
  "Morocco", "Moroccan", "Mozambique", "Mozambican", "Myanmar", "Burmese", "Namibia", "Namibian",
  "Nepal", "Nepali", "Nepalese", "Netherlands", "Dutch", "New Zealand", "Nicaragua", "Nicaraguan",
  "Niger", "Nigeria", "Nigerian", "North Macedonia", "Macedonian", "Norway", "Norwegian", "Oman",
  "Omani", "Pakistan", "Pakistani", "Palestine", "Palestinian", "Panama", "Panamanian",
  "Paraguay", "Paraguayan", "Peru", "Peruvian", "Philippines", "Filipino", "Filipina", "Poland",
  "Polish", "Portugal", "Portuguese", "Qatar", "Qatari", "Romania", "Romanian", "Russia",
  "Russian", "Rwanda", "Rwandan", "Saudi Arabia", "Saudi", "Senegal", "Senegalese", "Serbia",
  "Serbian", "Sierra Leone", "Singapore", "Singaporean", "Slovakia", "Slovak", "Slovenia",
  "Slovenian", "Somalia", "Somali", "South Africa", "South African", "Spain", "Spanish",
  "Sri Lanka", "Sri Lankan", "Sudan", "Sudanese", "Sweden", "Swedish", "Switzerland", "Swiss",
  "Syria", "Syrian", "Taiwan", "Taiwanese", "Tajikistan", "Tajik", "Tanzania", "Tanzanian",
  "Thailand", "Thai", "Togo", "Togolese", "Tunisia", "Tunisian", "Turkey", "Türkiye", "Turkish",
  "Turkmenistan", "Turkmen", "Uganda", "Ugandan", "Ukraine", "Ukrainian", "United Arab Emirates",
  "Emirati", "United Kingdom", "British", "English", "Scottish", "Welsh", "United States",
  "American", "Uruguay", "Uruguayan", "Uzbekistan", "Uzbek", "Venezuela", "Venezuelan", "Vietnam",
  "Vietnamese", "Yemen", "Yemeni", "Zambia", "Zambian", "Zimbabwe", "Zimbabwean", "Arab",
  "Arabic", "African", "Asian", "Latin American",
] as const;

/**
 * Words about how someone spoke or about the interview itself. They must never appear in text
 * a company or organiser reads about a person (writing rules R3 and R7 in signal-card.md),
 * because they hint at language, fluency or input mode. Card text is always English.
 * This also catches legitimate skills such as translation or public speaking; such a rendering
 * falls back to a plain code-built sentence, which is the safe side.
 */
export const SPEECH_CUES = [
  "interview*", "accent*", "fluen*", "translat*", "speak*", "spoke*", "spoken", "typed", "typing",
  "mother tongue", "pronunciation",
] as const;

/**
 * Words that turn a reason into a judgement of a person. A reason states how a card relates
 * to a posting or a need; it never praises, grades, compares or recommends. Source: the code
 * checks in docs/specs/prompts/match-reasons.md and picks-draft.md. Reasons are always English.
 */
export const REASON_JUDGEMENT = [
  "strong", "strongly", "excellent", "great", "impressive", "perfect", "perfectly", "ideal",
  "ideally", "expert", "talented", "skilled", "qualified", "senior", "junior", "fit", "fits",
  "match", "matches", "matched", "best", "top", "highly", "recommend", "recommends",
  "recommended", "score", "scores", "percent", "outstanding", "exceptional", "superb",
] as const;

/** Third-person pronouns. A reason about a person shown to a company must not gender them. */
export const GENDERED_PRONOUNS = ["he", "she", "him", "her", "his", "hers", "himself", "herself"] as const;

/** Words that grade a skill. They are removed from phrases; a phrase is never a level. */
export const QUALITY_WORDS = [
  "advanced", "expert", "senior", "junior", "strong", "good", "basic", "excellent", "experienced",
  "skilled", "proficient",
] as const;

const BEFORE = "(?<![\\p{L}\\p{N}])";
const AFTER = "(?![\\p{L}\\p{N}])";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Compile a list where `stem*` entries may continue into a longer word and others may not. */
function compileList(list: readonly string[], flags: string): RegExp {
  const sorted = [...list].sort((a, b) => b.length - a.length);
  const alternatives = sorted.map((entry) =>
    entry.endsWith("*") ? escapeRegExp(entry.slice(0, -1)) : `${escapeRegExp(entry)}${AFTER}`,
  );
  return new RegExp(`${BEFORE}(?:${alternatives.join("|")})`, flags);
}

const BANNED_RE = compileList(BANNED_EVALUATIVE, "giu");
const QUESTION_RE = compileList(PROTECTED_QUESTION, "giu");
const CARD_RE = compileList(PROTECTED_CARD, "giu");
const COUNTRY_RE = compileList(COUNTRIES_AND_DEMONYMS, "gu");
const QUALITY_RE = compileList(QUALITY_WORDS, "giu");
const SPEECH_RE = compileList(SPEECH_CUES, "giu");
const JUDGEMENT_RE = compileList(REASON_JUDGEMENT, "giu");
const PRONOUN_RE = compileList(GENDERED_PRONOUNS, "giu");
const NUMBER_CLAIM_RE = /%|\d+\s*\/\s*\d+|\b\d+\s+(?:out\s+)?of\s+\d+\b/giu;

function matches(re: RegExp, text: string): string[] {
  return [...text.matchAll(re)].map((m) => m[0].toLowerCase());
}

/** Evaluative or manner-of-speaking wording in something the interviewer is about to say. */
export function findBannedEvaluative(text: string): string[] {
  return matches(BANNED_RE, text);
}

/** Protected topics in something the interviewer is about to ask (list A). */
export function findProtectedQuestion(text: string): string[] {
  return matches(QUESTION_RE, text);
}

/** Protected terms in card text (list B, age patterns, countries and nationalities). */
export function findProtectedCard(text: string): string[] {
  const hits = matches(CARD_RE, text);
  for (const pattern of PROTECTED_CARD_PATTERNS) {
    const m = pattern.exec(text);
    if (m) hits.push(m[0].toLowerCase());
  }
  hits.push(...[...text.matchAll(COUNTRY_RE)].map((m) => m[0]));
  return hits;
}

/**
 * Why a model-written reason may not be shown, as the offending fragments: judgement words,
 * percentages and "2/5" or "2 of 5" style counts, and (with `pronouns`) gendered pronouns.
 * An empty list means the reason passes. Use for job-feed reasons and for pick reasons.
 */
export function findReasonJudgement(text: string, opts: { pronouns?: boolean } = {}): string[] {
  const hits = matches(JUDGEMENT_RE, text);
  hits.push(...[...text.matchAll(NUMBER_CLAIM_RE)].map((m) => m[0].toLowerCase()));
  if (opts.pronouns) hits.push(...matches(PRONOUN_RE, text));
  return hits;
}

/** Manner-of-speaking or interview wording in text meant for a company or organiser. */
export function findSpeechCue(text: string): string[] {
  return matches(SPEECH_RE, text);
}

/**
 * Remove grading words and year counts from a skill phrase ("senior Java developer, 5 years"
 * becomes "Java developer"). Returns an empty string when nothing meaningful is left;
 * the caller then drops the phrase.
 */
export function stripQualityWords(phrase: string): string {
  const stripped = phrase
    .replace(QUALITY_RE, " ")
    .replace(/\b\d+\+?\s*(?:years?|yrs?|vuotta|v)\b(?:\s+(?:of|in))?/giu, " ")
    .replace(/\s*[,;]\s*(?=[,;]|$)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:-]+|[\s,;:-]+$/g, "");
  return stripped.length >= 2 ? stripped : "";
}
