// Isomorphic: safe in server and client code. Imports nothing from next/*.
import type { UiLang } from "@/contracts";
import { DEFAULT_UI_LANG, UI_LANGS, type Messages } from "./types";

export * from "./types";

/** Name of the cookie that stores the chosen interface language. */
export const UI_LANG_COOKIE = "ui_lang";

/** One year, in seconds. */
export const UI_LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Select the texts for one language. */
export function pick<T extends Record<string, string>>(messages: Messages<T>, lang: UiLang): T {
  return messages[lang];
}

/** Replace `{name}` placeholders. Unknown placeholders stay visible. Never throws. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return String(template).replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole,
  );
}

export function isUiLang(value: unknown): value is UiLang {
  return typeof value === "string" && (UI_LANGS as readonly string[]).includes(value);
}

/**
 * Best supported language from an Accept-Language header (q-values respected,
 * regional variants map to their base language). Null when nothing matches.
 */
export function matchAcceptLanguage(header: string | null | undefined): UiLang | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      let q = 1;
      for (const p of params) {
        const m = /^\s*q\s*=\s*([\d.]+)\s*$/i.exec(p);
        if (m) q = Number(m[1]);
      }
      return { base: tag.trim().toLowerCase().split("-")[0], q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((e) => e.q > 0 && isUiLang(e.base))
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return ranked.length ? (ranked[0].base as UiLang) : null;
}

/** The `document.cookie` string that stores a language choice. */
export function uiLangCookieString(lang: UiLang): string {
  return `${UI_LANG_COOKIE}=${lang}; Path=/; Max-Age=${UI_LANG_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export { DEFAULT_UI_LANG };
