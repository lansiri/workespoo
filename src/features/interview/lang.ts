/** Language detection for participant turns (docs/specs/interview.md 6.6). Pure and isomorphic. */
import type { UiLang } from "@/contracts";
import { STOPWORDS } from "@/lib/i18n/content/interview-lines";

export type DetectedLang = UiLang | "unknown" | (string & {});

const STOP_SETS: Record<UiLang, Set<string>> = {
  en: new Set(STOPWORDS.en),
  fi: new Set(STOPWORDS.fi),
  sv: new Set(STOPWORDS.sv),
};

/** Minimum stopword hits for the stopword count to decide. */
const MIN_HITS = 2;

export function isUiLang(value: unknown): value is UiLang {
  return value === "en" || value === "fi" || value === "sv";
}

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [];
}

/**
 * The voice adapter's language code wins when present (`fi-FI` becomes `fi`); otherwise count
 * stopwords from the three lists. The larger count wins when it is at least 2 and not tied.
 */
export function detectLang(text: string, sttLang?: string | null): DetectedLang {
  const stt = sttLang?.trim().toLowerCase().split(/[-_]/)[0];
  if (stt && /^[a-z]{2,3}$/.test(stt)) return stt;
  const counts: Record<UiLang, number> = { en: 0, fi: 0, sv: 0 };
  for (const token of tokens(text)) {
    for (const lang of ["en", "fi", "sv"] as const) if (STOP_SETS[lang].has(token)) counts[lang]++;
  }
  const ranked = (Object.entries(counts) as [UiLang, number][]).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (!best || best[1] < MIN_HITS || (second && second[1] === best[1])) return "unknown";
  return best[0];
}
