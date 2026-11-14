import { COUNTRIES_AND_DEMONYMS } from "@/lib/lexicon";

/**
 * What of a person's answer the assessor (and the organiser) may read, in English, Finnish and
 * Swedish.
 *
 * Two different things are kept apart, because treating them alike was unfair in opposite
 * directions:
 *
 * - A sentence in which the person says something protected **about themselves** (their age,
 *   where they are from, their first language, religion, family, gender, health) is left out
 *   whole. It can then never be cited and never colours a rating.
 * - A sentence that merely names a country or a nationality ("I worked at a factory in
 *   Germany") is work evidence. Dropping it would cost exactly the people this product is for
 *   their experience abroad. The place word is hidden and the sentence stays.
 *
 * The names of languages are neither: "the release notes were in English" and "I use Finnish
 * with customers" are evidence for a language requirement and are shown as they are. A
 * language name used as a nationality ("I am Russian") is caught by the first rule.
 *
 * Ordinary work vocabulary must pass: a nurse talks about illnesses and diagnoses, a teacher
 * about children, an electrician about male and female connectors. So nothing here is a bare
 * topic word; every entry is something a person says of themselves.
 */

/** Stands in for a hidden word inside a sentence that is still shown. */
export const HIDDEN_WORD = "[…]";
/** Stands in for a whole sentence that is not shown. */
export const LEFT_OUT_SENTENCE = "[left out]";

/** Names on the country list that are also the names of languages. */
const LANGUAGE_NAMES = new Set([
  "English", "Finnish", "Swedish", "German", "French", "Spanish", "Russian", "Estonian", "Italian", "Portuguese", "Polish", "Dutch",
  "Norwegian", "Danish", "Chinese", "Japanese", "Korean", "Arabic", "Turkish", "Ukrainian", "Vietnamese", "Thai", "Greek", "Latvian",
  "Lithuanian", "Hungarian", "Czech", "Romanian", "Bulgarian", "Hindi", "Persian", "Somali", "Kurdish", "Icelandic", "Croatian", "Serbian",
]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const notInWord = "(?<![\\p{L}\\p{N}])";
const wordEnd = "(?![\\p{L}\\p{N}])";

/** Stems end in `*`; anything else must end at a word end. Longest first, so the longest wins. */
function compile(entries: readonly string[], flags: string): RegExp {
  const alts = [...new Set(entries)]
    .sort((a, b) => b.length - a.length)
    .map((e) => (e.endsWith("*") ? escape(e.slice(0, -1)) : `${escape(e)}${wordEnd}`));
  return new RegExp(`${notInWord}(?:${alts.join("|")})`, flags);
}

/* ------------------------------ said of oneself: the sentence is left out ------------------------------ */

const ABOUT_ONESELF = [
  // where the person is from
  "kotoisin", "syntyisin", "olen syntynyt", "synnyin", "born in", "originally from", "i come from", "i came from", "i am from", "i'm from",
  "jag kommer från", "jag kommer ifrån", "jag är född", "född i", "föddes i", "my home country", "my country", "back home", "kotimaani", "kotimaassani",
  "mitt hemland", "i mitt hemland", "maahanmuuttaja*", "invandrare", "as an immigrant", "refugee*", "pakolai*", "flykting*", "asylum", "turvapaik*",
  "nationality", "citizenship", "kansalaisuu*", "medborgarskap*", "residence permit", "work permit", "oleskelulu*", "työlupa*", "uppehållstillstånd*",
  // first language
  "mother tongue", "first language", "native language", "native speaker", "äidinkiel*", "modersmål*",
  // religion
  "muslim*", "islam*", "christian*", "kristitty*", "kristityn", "kristen*", "juutalai*", "jewish", "judisk*", "hindu*", "buddhis*", "buddhalai*",
  "ateisti*", "atheist*", "uskovai*", "uskontoni", "my faith", "my religion", "min tro", "min religion", "ramadan*", "hijab*",
  // family
  "my wife", "my husband", "my partner", "my spouse", "my girlfriend", "my boyfriend", "my baby", "my son", "my daughter", "my kids", "my children",
  "my child", "single mother", "single father", "single parent", "a mother of", "a father of", "as a mother", "as a father", "as a parent", "married",
  "maternity leave", "paternity leave", "parental leave", "pregnan*", "expecting a baby",
  "lapseni", "lapsiani", "lapsilleni", "vaimoni", "mieheni", "puolisoni", "yksinhuoltaja*", "vanhempainvapa*", "perhevapa*", "hoitovapa*", "äitiyslom*",
  "isyyslom*", "äitinä", "isänä", "raskaana", "raskauteni", "naimisissa", "minulla on kolme lasta", "minulla on kaksi lasta",
  "mina barn", "min fru", "min man", "min make", "min maka", "min sambo", "mitt barn", "ensamstående", "föräldraledig*", "mammaledig*", "pappaledig*",
  "gravid*", "är gift", "som mamma", "som pappa",
  // gender
  "as a woman", "as a man", "i am a woman", "i am a man", "i'm a woman", "i'm a man", "naisena", "miehenä", "olen nainen", "olen mies", "som kvinna",
  "som man", "jag är kvinna", "jag är en kvinna", "jag är man",
  // health
  "my illness", "my disability", "my diagnosis", "my burnout", "my depression", "my anxiety", "my diabetes", "my cancer", "my condition", "my health",
  "sick leave", "i have diabetes", "i have adhd", "i have autism", "i have dyslexia", "i have asthma", "i have epilepsy", "i am disabled", "i'm disabled",
  "sairauslom*", "sairaslom*", "minulla on diabetes", "minulla on adhd", "minulla on masennus", "sairauteni", "vammani", "terveyteni", "uupumukseni",
  "sjukskriv*", "jag har diabetes", "jag har adhd", "min sjukdom", "min diagnos", "min hälsa", "mitt handikapp", "min utbrändhet",
  // age
  "years old", "year old", "vuotias", "vuotiaa*", "årig", "åring*", "eläkeläi*", "pensionär*", "my age", "at my age", "ikäni", "iältäni", "min ålder",
];
const ABOUT_ONESELF_RE = compile(ABOUT_ONESELF, "giu");

const ABOUT_ONESELF_PATTERNS = [
  // ages
  /\b(?:i am|i'm|i turned|im)\s+\d{2}\b/iu,
  /\b(?:olen|täytin|täytän)\s+\d{2}\b/iu,
  /\b(?:jag är|jag fyller|jag fyllde)\s+\d{2}\b/iu,
  /\b\d{2}\s*[- ]?(?:vuotia\p{L}*|vuotta vanha|v\.?\s*vanha|år gammal|årig\p{L}*|yo|y\/o)(?![\p{L}\p{N}])/iu,
  /\b(?:born|syntynyt|syntyi|synnyin|född|föddes)\b[^.]{0,20}\b(?:19|20)\d{2}\b/iu,
  // children counted
  /\b(?:three|two|four|five|\d)\s+(?:kids|children|sons|daughters)\b/iu,
  /\b(?:kahden|kolmen|neljän|viiden|\d)\s+lapsen\s+(?:äiti|isä|vanhempi)/iu,
  /\b(?:har|med)\s+(?:två|tre|fyra|fem|\d)\s+barn\b/iu,
  // a first language, however the language is named
  /\bnative\s+\p{L}+\s+speaker\b/iu,
  // a nationality said of oneself: "I am Russian", "as a Finn", "olen virolainen", "jag är finländare"
  // Only when the word ends the clause: in "I am an Indian chef" the word is hidden and the chef stays.
  /\b(?:[Ii] am|[Ii]'m|[Aa]s an?|[Bb]eing an?)\s+(?:an?\s+)?[A-Z]\p{Ll}+(?:ish|ian|ean|ese|an|i|ch|ic)(?=\s*(?:[.,;:!?]|$|and\b|but\b|so\b|by birth\b|who\b))/u,
  /\bolen\s+\p{L}+l[aä]inen\b/iu,
  /\bjag är\s+(?:finländare|finne|svensk|ryss|est|tysk|engelsman|amerikan|irakier|syrier|somalier|iranier|ukrainare|polack|kines|indier)\b/iu,
];

/* ------------------------------ a place or a nationality: the word is hidden ------------------------------ */

/**
 * Like `compile`, but a stem takes the rest of its word with it, so that hiding "Saksassa"
 * leaves no "ssa" behind.
 */
function compileWords(entries: readonly string[], flags: string): RegExp {
  const alts = [...new Set(entries)]
    .sort((a, b) => b.length - a.length)
    .map((e) => (e.endsWith("*") ? `${escape(e.slice(0, -1))}\\p{L}*` : `${escape(e)}${wordEnd}`));
  return new RegExp(`${notInWord}(?:${alts.join("|")})`, flags);
}

const PLACE_NAMES_EN = COUNTRIES_AND_DEMONYMS.filter((n) => !LANGUAGE_NAMES.has(n));
/** English names keep their capital letter ("Turkey", not "turkey"; "Oman", not the Finnish "oman"). */
const PLACE_EN_RE = compileWords(PLACE_NAMES_EN, "gu");

/**
 * Countries in Finnish and Swedish, with their capital letter. The capital matters in Finnish:
 * "Venäjä" is the country and "venäjä" the language, and the language is evidence.
 */
const COUNTRIES_FI_SV = [
  "Syyria*", "Irak*", "Iran*", "Afganistan*", "Somalia*", "Venäjä*", "Ukraina*", "Turkki*", "Turki*", "Kiina*", "Intia*", "Pakistan*", "Eritrea*",
  "Etiopia*", "Viro*", "Saksa*", "Ranska*", "Espanja*", "Italia*", "Puola*", "Nigeria*", "Marokko*", "Egypti*", "Kosovo*", "Bosnia*", "Albania*",
  "Vietnam*", "Thaimaa*", "Filippiini*", "Nepal*", "Bangladesh*", "Brasilia*", "Afrikka*", "Afrika*", "Kurdistan*", "Syrien", "Ryssland", "Turkiet",
  "Kina", "Indien", "Etiopien", "Estland", "Tyskland", "Frankrike", "Spanien", "Italien", "Polen", "Marocko", "Egypten", "Bosnien", "Albanien",
  "Thailand", "Filippinerna", "Brasilien", "Afghanistan",
];
const COUNTRIES_FI_SV_RE = compileWords(COUNTRIES_FI_SV, "gu");

/**
 * Words for a nationality in Finnish and Swedish, in any case. Only those that are not also
 * the name of a language: "somali", "kurdi", "ryska" and "tyska" name languages and pass.
 */
const NATIONALITIES_FI_SV = [
  "syyrialai*", "irakilai*", "iranilai*", "afgaani*", "afganistanilai*", "somalialai*", "venäläi*", "ukrainalai*", "turkkilai*", "kiinalai*",
  "intialai*", "pakistanilai*", "eritrealai*", "etiopialai*", "virolai*", "saksalai*", "ranskalai*", "espanjalai*", "italialai*", "puolalai*",
  "nigerialai*", "marokkolai*", "egyptiläi*", "kosovolai*", "bosnialai*", "albanialai*", "vietnamilai*", "thaimaalai*", "filippiiniläi*",
  "nepalilai*", "brasilialai*", "afrikkalai*", "aasialai*", "syrisk*", "syrier*", "irakisk*", "irakier*", "iransk*", "iranier*", "afghansk*",
  "afghaner*", "somalier*", "pakistansk*", "eritreansk*", "etiopisk*", "nigeriansk*", "marockansk*", "egyptisk*", "indisk*", "indier*",
  "afrikansk*", "ryssar*", "ukrainare*", "kineser*",
];
const NATIONALITIES_FI_SV_RE = compileWords(NATIONALITIES_FI_SV, "giu");

const PLACE_RES = [PLACE_EN_RE, COUNTRIES_FI_SV_RE, NATIONALITIES_FI_SV_RE];

/* ------------------------- said of the person by the model: the text is not used ------------------------- */

/**
 * A reason describes evidence, so it is written in the third person and the phrases above
 * ("I am 52") do not occur in it. These are the third-person ways a protected detail gets
 * into one. The same rule holds as above: no bare topic words, since "children", "illness"
 * and "diabetes" are what a teacher or a nurse did their work with. An entry ties the topic to
 * the person ("has three children", "their illness") or is a word that is only ever about a
 * person ("sick leave", "immigrant", "mother tongue").
 */
const ABOUT_THE_PERSON = [
  // age
  "years of age", "at the age of", "their age", "the person's age", "age of the person", "middle-aged", "ikäinen", "ikäisenä", "ikäisen", "iältään",
  "ikänsä", "ikäänsä", "vuotias", "vuotiaa*", "sin ålder", "personens ålder", "år gammal", "årig", "åring*",
  // origin and first language
  "immigrant*", "refugee*", "foreign-born", "foreigner*", "country of origin", "home country", "native country", "nationality", "citizenship", "ethnic*",
  "asylum", "maahanmuuttaja*", "pakolai*", "ulkomaalai*", "kotimaa*", "kansalaisuu*", "syntyperä*", "etni*", "invandrar*", "flykting*", "utlänning*",
  "hemland*", "medborgarskap*", "etnisk*", "mother tongue", "first language", "native language", "native speaker", "native-level", "non-native",
  "äidinkiel*", "modersmål*", "förstaspråk*",
  // religion
  "religio*", "muslim*", "islam*", "christian*", "jewish", "hindu*", "buddhis*", "atheis*", "their faith", "uskonto*", "uskonno*", "uskovai*",
  "kristit*", "juutalai*", "kristen*", "judisk*", "troende",
  // family
  "married", "marriage", "spouse", "their wife", "their husband", "his wife", "her husband", "their partner", "pregnan*", "maternity", "paternity",
  "parental leave", "parenthood", "motherhood", "fatherhood", "single parent", "single mother", "single father", "being a mother", "being a father",
  "being a parent", "as a mother", "as a father", "as a parent", "a mother of", "a father of", "a parent of", "their children", "their child",
  "their kids", "their family", "own children", "her children", "his children", "naimisi*", "puoliso*", "vaimonsa", "miehensä", "aviomie*", "raskau*",
  "raskaana", "äitiyslom*", "isyyslom*", "vanhempainvapa*", "perhevapa*", "hoitovapa*", "yksinhuoltaj*", "lapsensa", "lapsiaan", "lapsistaan",
  "perheensä", "omat lapsensa", "omia lapsia", "omien lasten", "äitinä", "isänä", "är gift", "sin fru", "sin man", "sin make", "sin maka", "sin sambo",
  "sina barn", "sitt barn", "egna barn", "sin familj", "gravid*", "föräldraledig*", "mammaledig*", "pappaledig*", "ensamstående", "som mamma",
  "som pappa", "som förälder",
  // gender
  "a woman", "the woman", "as a woman", "being a woman", "a man", "the man", "as a man", "being a man", "female applicant", "female candidate",
  "female person", "female worker", "female employee", "male applicant", "male candidate", "male person", "male worker", "male employee", "gender",
  "nainen", "naisena", "mies", "miehenä", "naispuol*", "miespuol*", "sukupuol*", "kvinna", "kvinnan", "kvinnlig*", "manlig*", "som man", "en man",
  "mannen", "kön", "könet",
  // health
  "sick leave", "medical leave", "disabled", "their health", "own health", "their illness", "own illness", "their disability", "their diagnosis",
  "their condition", "their burnout", "their depression", "their injury", "the person's health", "the person's illness", "sairauslom*", "sairaslom*",
  "työkyvyttömy*", "sairautensa", "sairaudestaan", "vammansa", "terveytensä", "terveydestään", "diagnoosinsa", "uupumuksensa", "masennuksensa",
  "oma sairaus", "omasta sairaudesta", "oman sairauden", "sjukskriv*", "sin sjukdom", "sin hälsa", "sin diagnos", "sin funktionsnedsättning",
  "sin utbrändhet", "egen sjukdom",
];
const ABOUT_THE_PERSON_RE = compile(ABOUT_THE_PERSON, "giu");

const CONDITION_EN = "(?:diabetes|adhd|autism|dyslexia|asthma|epilepsy|cancer|depression|anxiety|burnout|disability|illness|disease|diagnosis|disorder|impairment)";
const CONDITION_FI = "(?:diabete\\p{L}*|adhd\\p{L}*|autismi\\p{L}*|lukihäiriö\\p{L}*|astma\\p{L}*|epilepsia\\p{L}*|syöpä\\p{L}*|syövä\\p{L}*|masennu\\p{L}*|uupumu\\p{L}*|sairau\\p{L}*|vamma\\p{L}*|diagnoos\\p{L}*)";
const CONDITION_SV = "(?:diabetes|adhd|autism|dyslexi|astma|epilepsi|cancer|depression|ångest|utbrändhet|sjukdom|funktionsnedsättning|funktionshinder|diagnos)";
const COUNT_EN = "(?:a|one|two|three|four|five|six|\\d)";
const COUNT_FI = "(?:yksi|kaksi|kolme|neljä|viisi|kuusi|\\d)";
const COUNT_SV = "(?:ett|två|tre|fyra|fem|sex|\\d)";

const ABOUT_THE_PERSON_PATTERNS = [
  // ages
  /(?<![\p{L}\p{N}])\d{2}\s*[- ]?(?:years?[- ]old|yrs?[- ]old|year[- ]old)/iu,
  /\baged\s+\d{2}\b/iu,
  /\bage\s+(?:of\s+)?\d{2}\b/iu,
  /\b(?:young|younger|older|elderly)\s+(?:person|worker|applicant|candidate|employee|man|woman)\b/iu,
  /(?<![\p{L}\p{N}])\d{2}\s*[- ]?(?:vuotia\p{L}*|vuoden\s+ikäi\p{L}*|vuotta\s+vanha)/iu,
  /(?<![\p{L}\p{N}])\d{2}\s*[- ]?år(?:ig\p{L}*|ing\p{L}*|\s+gammal)/iu,
  /\bi\s+\d{2}[- ]?årsåldern\b/iu,
  // children of the person's own
  new RegExp(`\\b(?:mentions?|mentioning|has|have|had|having|raising|raised|mother of|father of|parent of|mother to|father to|parent to)\\s+${COUNT_EN}\\s+(?:young\\s+|small\\s+)?(?:kids?|child|children|sons?|daughters?)\\b`, "iu"),
  new RegExp(`(?<![\\p{L}\\p{N}])(?:on|mainitsee|mainitaan|mainitsi)\\s+${COUNT_FI}\\s+las(?:ta|ten)(?![\\p{L}\\p{N}])`, "iu"),
  /(?<![\p{L}\p{N}])(?:yhden|kahden|kolmen|neljän|viiden|\d)\s+lapsen\s+(?:äi\p{L}+|isä\p{L}*|vanhem\p{L}+|huolta\p{L}+)/iu,
  new RegExp(`(?<![\\p{L}\\p{N}])(?:har|hade|nämner)\\s+${COUNT_SV}\\s+barn(?![\\p{L}\\p{N}])`, "iu"),
  // a health condition of the person's own
  new RegExp(`\\b(?:has|have|had|having|suffers? from|suffering from|diagnosed with|living with|recovering from|recovered from|mentions?|mentioning)\\s+(?:an?\\s+|the\\s+|their\\s+|own\\s+)?(?:\\p{L}+\\s+)?${CONDITION_EN}\\b`, "iu"),
  new RegExp(`(?<![\\p{L}\\p{N}])(?:hänellä on|henkilöllä on|sairastaa|sairasti|sairastanut|sairastui|sairastunut|mainitsee|mainitaan)\\s+(?:\\p{L}+\\s+)?${CONDITION_FI}`, "iu"),
  new RegExp(`(?<![\\p{L}\\p{N}])(?:personen har|personen hade|lider av|diagnostiserad med|nämner)\\s+(?:en\\s+|ett\\s+|sin\\s+)?(?:\\p{L}+\\s+)?${CONDITION_SV}(?![\\p{L}\\p{N}])`, "iu"),
  new RegExp(`(?<![\\p{L}\\p{N}])(?:barn|familj)\\s+och\\s+${CONDITION_SV}(?![\\p{L}\\p{N}])`, "iu"),
];

/* --------------------------------------------- the checks --------------------------------------------- */

function aboutOneself(text: string): string[] {
  const hits = [...text.matchAll(ABOUT_ONESELF_RE)].map((m) => m[0].toLowerCase());
  for (const p of ABOUT_ONESELF_PATTERNS) {
    const m = p.exec(text);
    if (m) hits.push(m[0].toLowerCase());
  }
  return hits;
}

function aboutThePerson(text: string): string[] {
  const hits = [...text.matchAll(ABOUT_THE_PERSON_RE)].map((m) => m[0].toLowerCase());
  for (const p of ABOUT_THE_PERSON_PATTERNS) {
    const m = p.exec(text);
    if (m) hits.push(m[0].toLowerCase());
  }
  return hits;
}

function placeWords(text: string): string[] {
  return PLACE_RES.flatMap((re) => [...text.matchAll(re)].map((m) => m[0]));
}

/**
 * One sentence of a person's answer as the assessor and the organiser may read it: left out
 * whole when the person says something protected about themselves, otherwise shown with any
 * country or nationality word hidden. Pure.
 */
export function screenAnswerSentence(text: string): { text: string; leftOut: boolean } {
  if (aboutOneself(text).length > 0) return { text: LEFT_OUT_SENTENCE, leftOut: true };
  const hidden = PLACE_RES.reduce((shown, re) => shown.replace(re, HIDDEN_WORD), text);
  return { text: hidden, leftOut: false };
}

/**
 * Protected fragments in a text the model wrote (a reason, a summary): anything said about the
 * person, in the first or the third person, and any country or nationality. Empty means
 * clear. The names of languages pass, since a reason for a language requirement has to name
 * the language. Keyword lists cannot tell every case from a description of the work; the
 * model is told the same rule, never reads the sentences that are left out, and an organiser
 * reads every reason before a company does. This is the backstop.
 */
export function findProtectedWritten(text: string): string[] {
  return [...aboutOneself(text), ...aboutThePerson(text), ...placeWords(text)];
}
