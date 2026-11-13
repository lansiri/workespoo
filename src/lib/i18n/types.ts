import type { UiLang } from "@/contracts";

/**
 * A set of interface texts in every supported language. The type makes each language
 * provide exactly the same keys, so a missing translation is a compile error.
 */
export type Messages<T extends Record<string, string>> = Record<UiLang, T>;

export const UI_LANGS = ["en", "fi", "sv"] as const satisfies readonly UiLang[];

/** How each language names itself, for the language switcher. */
export const UI_LANG_NAMES: Record<UiLang, string> = {
  en: "English",
  fi: "Suomi",
  sv: "Svenska",
};

/** Speech and locale tags per interface language. */
export const UI_LANG_LOCALES: Record<UiLang, string> = {
  en: "en-GB",
  fi: "fi-FI",
  sv: "sv-SE",
};

export const DEFAULT_UI_LANG: UiLang = "en";
