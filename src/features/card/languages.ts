/**
 * Work languages the person lists on their card, mapped to ISO 639-1 codes. Names are accepted
 * in the three interface languages and in the language's own name; anything else is skipped.
 */
const LANGUAGES: Array<{ code: string; names: string[] }> = [
  { code: "fi", names: ["finnish", "suomi", "finska"] },
  { code: "sv", names: ["swedish", "ruotsi", "svenska", "svensk"] },
  { code: "en", names: ["english", "englanti", "engelska", "british english"] },
  { code: "et", names: ["estonian", "viro", "eesti", "estniska"] },
  { code: "ru", names: ["russian", "venäjä", "русский", "ryska"] },
  { code: "de", names: ["german", "saksa", "deutsch", "tyska"] },
  { code: "fr", names: ["french", "ranska", "français", "francais", "franska"] },
  { code: "es", names: ["spanish", "espanja", "español", "espanol", "spanska"] },
  { code: "it", names: ["italian", "italia", "italiano", "italienska"] },
  { code: "pt", names: ["portuguese", "portugali", "português", "portugues", "portugisiska"] },
  { code: "nl", names: ["dutch", "hollanti", "nederlands", "nederländska"] },
  { code: "pl", names: ["polish", "puola", "polski", "polska"] },
  { code: "uk", names: ["ukrainian", "ukraina", "українська", "ukrainska"] },
  { code: "ar", names: ["arabic", "arabia", "العربية", "arabiska"] },
  { code: "so", names: ["somali", "soomaali", "somaliska"] },
  { code: "fa", names: ["persian", "farsi", "persia", "persiska"] },
  { code: "ku", names: ["kurdish", "kurdi", "kurdiska"] },
  { code: "tr", names: ["turkish", "turkki", "türkçe", "turkiska"] },
  { code: "zh", names: ["chinese", "mandarin", "kiina", "中文", "kinesiska"] },
  { code: "ja", names: ["japanese", "japani", "日本語", "japanska"] },
  { code: "ko", names: ["korean", "korea", "한국어", "koreanska"] },
  { code: "hi", names: ["hindi", "hindi"] },
  { code: "ur", names: ["urdu", "urdu"] },
  { code: "bn", names: ["bengali", "bangla", "bengali"] },
  { code: "ta", names: ["tamil", "tamili", "tamil"] },
  { code: "vi", names: ["vietnamese", "vietnam", "tiếng việt", "vietnamesiska"] },
  { code: "th", names: ["thai", "thai", "ไทย", "thailändska"] },
  { code: "tl", names: ["tagalog", "filipino", "tagalog"] },
  { code: "ro", names: ["romanian", "romania", "română", "rumänska"] },
  { code: "bg", names: ["bulgarian", "bulgaria", "български", "bulgariska"] },
  { code: "hu", names: ["hungarian", "unkari", "magyar", "ungerska"] },
  { code: "el", names: ["greek", "kreikka", "ελληνικά", "grekiska"] },
  { code: "da", names: ["danish", "tanska", "dansk", "danska"] },
  { code: "no", names: ["norwegian", "norja", "norsk", "norska"] },
  { code: "is", names: ["icelandic", "islanti", "íslenska", "isländska"] },
  { code: "sq", names: ["albanian", "albania", "shqip", "albanska"] },
  { code: "am", names: ["amharic", "amhara", "አማርኛ", "amhariska"] },
  { code: "sw", names: ["swahili", "swahili", "kiswahili", "swahili"] },
  { code: "he", names: ["hebrew", "heprea", "עברית", "hebreiska"] },
];

const BY_NAME = new Map<string, string>();
for (const { code, names } of LANGUAGES) {
  BY_NAME.set(code, code);
  for (const name of names) BY_NAME.set(name.toLowerCase(), code);
}

/** ISO 639-1 code for a language name or code, or null when it is not recognised. */
export function languageCode(input: string): string | null {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/\b(?:language|kieli|språk)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return BY_NAME.get(cleaned) ?? null;
}

/** Unique codes for a list of names, skipping what cannot be mapped. */
export function languageCodes(names: readonly string[]): string[] {
  const codes = new Set<string>();
  for (const name of names) {
    const code = languageCode(name);
    if (code) codes.add(code);
  }
  return [...codes];
}
