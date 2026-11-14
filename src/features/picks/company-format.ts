import type { UiLang } from "@/contracts";
import { UI_LANG_LOCALES } from "@/lib/i18n/types";

/** "Monday 16 November": the day, written out in the page's language. Empty for a missing or unreadable date. */
export function longDay(iso: string | null | undefined, lang: UiLang): string {
  if (!iso) return "";
  const at = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(at.getTime())) return iso.slice(0, 10);
  return at.toLocaleDateString(UI_LANG_LOCALES[lang], {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Helsinki",
  });
}
