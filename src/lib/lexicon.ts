/**
 * Word lists that keep evaluation and protected attributes out of the product.
 * Source: docs/specs/interview.md sections 10.3 and 10.4, extended by the lead with Swedish and
 * with Finnish stems that also match inflected forms. Lead-owned: the interview guard,
 * the turn extractor's merge step and card synthesis all use these, so they must not drift.
 *
 * Matching is case-insensitive and a pattern must start at a word boundary, so a stem such
 * as `sairau` matches `sairausloma` while `born` does not match `stubborn`. Country names and
 * nationality adjectives are matched case-sensitively as whole words, because many are also
 * ordinary words in lower case (`polish`, `turkey`, `china`).
 */

/** The interviewer must never say these: praise, levels, or remarks on manner of speaking. */
export const BANNED_EVALUATIVE = [
  // English
  "impressive", "great", "excellent", "amazing", "awesome", "fantastic", "wonderful", "brilliant",
  "outstanding", "perfect", "well done", "good job", "nice work", "strong", "talented", "skilled",
  "expert", "senior", "junior", "level", "score", "rating", "you sound", "you seem", "you look",
  "confident", "nervous", "passionate", "enthusias", "your accent", "your english", "your finnish",
  "fluent",
  // Finnish
  "vaikuttava", "upea", "hieno", "hienoa", "mahtava", "loistava", "erinomai", "täydellinen",
  "hyvin tehty", "hyvä vastaus", "taitava", "lahjakas", "asiantuntija", "kokenut", "taso",
  "pisteet", "kuulostat", "vaikutat", "itsevarma", "hermostu", "innokas", "aksentti", "suomesi",
  "englantisi", "ruotsisi", "sujuva",
  // Swedish
  "imponerande", "fantastisk", "utmärkt", "underbar", "lysande", "perfekt", "bra jobbat",
  "bra svar", "snyggt jobbat", "duktig", "skicklig", "talang", "begåvad", "nivå", "poäng",
  "betyg", "du låter", "du verkar", "självsäker", "nervös", "passionerad", "entusias",
  "din accent", "din brytning", "din svenska", "din engelska", "din finska", "flytande",
] as const;

/** List A: topics the interviewer must never ask about. */
export const PROTECTED_QUESTION = [
  // English
  "how old", "your age", "were you born", "where are you from", "where do you come from",
  "nationality", "citizenship", "ethnic", "religio", "married", "husband", "wife", "children",
  "kids", "pregnan", "maternity", "your health", "disab", "illness", "diagnos", "visa",
  "residence permit", "work permit", "native language", "mother tongue", "first language", "gender",
  // Finnish. Stems, so that inflected forms match (äidinkielesi, lapsesi, oleskeluluvan).
  "ikäsi", "minkä ikäinen", "kuinka vanha", "milloin synnyit", "mistä olet kotoisin",
  "kansalaisuu", "etni", "uskonto", "uskonno", "naimisi", "puoliso", "vaimo", "laps", "raskau",
  "äitiysloma", "terveydentila", "sairau", "vamma", "diagnoo", "oleskelulu", "työlupa", "työluva",
  "viisumi", "äidinkiel", "sukupuol",
  // Swedish. Phrases rather than short words, so they cannot collide with English or Finnish.
  "hur gammal", "din ålder", "när är du född", "var kommer du ifrån", "varifrån kommer du",
  "nationalitet", "medborgarskap", "etnisk", "är du gift", "din make", "din maka", "din fru",
  "din man", "har du barn", "dina barn", "gravid", "föräldraledig", "mammaledig", "din hälsa",
  "funktionsneds", "sjukdom", "visum", "uppehållstillstånd", "arbetstillstånd", "modersmål",
  "förstaspråk", "ditt kön",
] as const;

/**
 * List B: terms that must not appear in card text (headline, phrase, company view).
 * Narrower than list A, because words such as "health and safety" are legitimate skills.
 */
export const PROTECTED_CARD = [
  "nationality", "citizen", "ethnic", "religio", "married", "husband", "wife", "my children",
  "kids", "pregnan", "maternity leave", "paternity leave", "disab", "diagnos", "visa",
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

/** Words that grade a skill. They are removed from phrases; a phrase is never a level. */
export const QUALITY_WORDS = [
  "advanced", "expert", "senior", "junior", "strong", "good", "basic", "excellent", "experienced",
  "skilled", "proficient",
] as const;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive, must start at a word boundary, may continue into a longer word. */
function compilePrefixList(list: readonly string[]): RegExp {
  const alternatives = [...list].sort((a, b) => b.length - a.length).map(escapeRegExp);
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join("|")})`, "giu");
}

/** Case-sensitive whole words. */
function compileWholeWordList(list: readonly string[]): RegExp {
  const alternatives = [...list].sort((a, b) => b.length - a.length).map(escapeRegExp);
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}])`, "gu");
}

const BANNED_RE = compilePrefixList(BANNED_EVALUATIVE);
const QUESTION_RE = compilePrefixList(PROTECTED_QUESTION);
const CARD_RE = compilePrefixList(PROTECTED_CARD);
const COUNTRY_RE = compileWholeWordList(COUNTRIES_AND_DEMONYMS);
const QUALITY_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${QUALITY_WORDS.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`,
  "giu",
);

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
