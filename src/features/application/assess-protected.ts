import { findProtectedCard, findProtectedQuestion } from "@/lib/lexicon";

/**
 * A protected-detail check meant for a person's answer sentences, in English, Finnish and
 * Swedish. The shared lists are English-card oriented, so this adds first-person age,
 * family, origin, religion and health wording in all three languages. It errs on blocking:
 * a left-out sentence only costs a citation. Child words from the question list are not
 * used on their own, because "worked with children" is a skill for a childcare job.
 */

const CHILD_ONLY = /^(?:children|kids|laps|lasta|lasten|barn|dina barn|har du barn|barn har du)$/u;

const STEMS = [
  // origin
  "kotoisin", "kotoisi", "syntyn", "syntyisin", "syntynyt", "kommer från", "kommer ifrån", "född", "föddes", "born in", "originally from", "come from", "came from",
  "syyria*", "syrien", "syrisk*", "irak*", "iran*", "irani*", "afganistan*", "somalia*", "somalial*", "venäjä*", "venäläi*", "ryssland", "rysk*", "ukrain*", "turkki*", "turkkil*", "turkiet", "turkisk*",
  "kurdi*", "kurdist*", "arabi*", "arabisk*", "afrikka*", "afrikan*", "kiina*", "kiinal*", "kina", "kinesisk*", "intia*", "intialai*", "indien", "indisk*", "pakistan*", "eritrea*", "etiopia*", "irlanti*", "viro", "virolai*", "estland", "eston*",
  "ruotsalai*", "saksalai*", "ranskalai*", "englantilai*", "amerikkalai*", "nigeria*", "marokko*", "egypti*", "kosovo*", "bosnia*", "albania*",
  // religion
  "muslim*", "islam*", "christian*", "kristitty*", "kristityn", "kristen*", "juutalai*", "jewish", "judisk*", "hindu*", "buddhis*", "buddhalai*", "ateisti*", "atheist*", "uskovainen", "uskovai*", 
  // family
  "my wife", "my husband", "my partner", "my spouse", "my girlfriend", "my boyfriend", "my baby", "my son", "my daughter", "my kids", "my children", "my child", "single mother", "single father", "a mother", "a father", "mother of", "father of", "mum of", "mom of", "stay-at-home", "parental leave", "family leave",
  "lapseni", "lapsiani", "lapsilleni", "lapsen äiti", "lapsen isä", "lasten äiti", "lasten isä", "yksinhuoltaja*", "vanhempainvapa*", "perhevapa*", "hoitovapa*", "äitinä", "isänä", "äiti", "isäni", "avopuoliso*", "aviopuoliso*", "mieheni", "vaimoni", "tyttöystävä*", "poikaystävä*",
  "mina barn", "min fru", "min man", "min make", "min maka", "min sambo", "mitt barn", "tre barn", "två barn", "fyra barn", "ensamstående", "föräldraledig*", "mammaledig*", "pappaledig*", "småbarnsförälder", "småbarnsförälder*", "som mamma", "som pappa", "jag har barn",
  // gender
  "woman", "women", "female", "male", "as a man", "as a woman", "nainen", "naisena", "miehenä", "kvinna", "kvinnor", "som kvinna", "som man", "pregnan*", "expecting a baby",
  // health
  "diabet*", "burnout", "burn-out", "sick leave", "sickness", "cancer", "syöpä*", "depress*", "masennu*", "ahdistu*", "anxiety", "ångest", "asthma", "astma*", "epilep*", "adhd", "autis*", "dysleks*", "dyslex*", "impairment", "vammai*", "handikapp*", "sairasloma*", "sairaslom*", "sairastin", "sairastan", "sairastuin", "sjukskriv*", "sjukledig*", "utbränd*", "utmattning*", "uupumus", "uupum*", "loppuun pal*", 
  // age
  "vuotias", "vuotiaa*", "årig", "åring*", "years old", "year old", "eläkeläi*", "pensionär*", "born in the", "syntyisin",
];

const STEM_RE = (() => {
  const alts = [...new Set(STEMS)]
    .sort((a, b) => b.length - a.length)
    .map((e) => (e.endsWith("*") ? e.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : `${e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`));
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join("|")})`, "giu");
})();

const PATTERNS = [
  /\b(?:i am|i'm|i turned|im)\s+\d{2}\b/iu,
  /\b(?:olen|täytin|täytän)\s+\d{2}\b/iu,
  /\b(?:jag är|jag fyller|jag fyllde)\s+\d{2}\b/iu,
  /\b\d{2}\s*[- ]?(?:vuotia\p{L}*|vuotta vanha|v\.?\s*vanha|år gammal|årig\p{L}*|yo|y\/o)(?![\p{L}\p{N}])/iu,
  /\b\d{2}\s+år\b/iu,
  /\b(?:aged?|ikä|ikäni|iältäni|ålder|min ålder)\b/iu,
  /\b(?:born|syntynyt|syntyi|syntyn|född|föddes)\b[^.]{0,20}\b(?:19|20)\d{2}\b/iu,
  /\b(?:three|two|four|five|\d)\s+(?:kids|children|sons|daughters)\b/iu,
  /\b(?:kahden|kolmen|neljän|viiden|\d)\s+lapsen\b/iu,
  /\b(?:\d|kaksi|kolme|neljä)\s+lasta\b/iu,
];

/** Protected-detail fragments in one answer sentence or one model-written text, in any of en, fi and sv. Empty means clear. */
export function findProtectedAnswer(text: string): string[] {
  const hits = findProtectedCard(text);
  hits.push(...findProtectedQuestion(text).filter((h) => !CHILD_ONLY.test(h)));
  hits.push(...[...text.matchAll(STEM_RE)].map((m) => m[0].toLowerCase()));
  for (const p of PATTERNS) {
    const m = p.exec(text);
    if (m) hits.push(m[0].toLowerCase());
  }
  return hits;
}
