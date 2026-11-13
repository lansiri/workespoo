import { MASKED_EMPLOYER_WORD } from "./constants";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The strings that identify an employer: its whole name and its first word when longer than 3 characters. */
export function employerTerms(...names: Array<string | null | undefined>): string[] {
  const terms = new Set<string>();
  for (const raw of names) {
    const name = (raw ?? "").trim();
    if (!name) continue;
    terms.add(name);
    const first = name.split(/\s+/)[0]?.replace(/[,.;:]+$/, "") ?? "";
    if (first.length > 3) terms.add(first);
  }
  return [...terms].sort((a, b) => b.length - a.length);
}

/**
 * Replace every case-insensitive occurrence of the employer's name (and its first word when
 * longer than 3 characters) with "the company" (docs/specs/company-view.md 1.1).
 */
export function maskEmployer(text: string, terms: string[]): string {
  let out = text;
  for (const term of terms) {
    out = out.replace(new RegExp(escapeRegExp(term), "gi"), MASKED_EMPLOYER_WORD);
  }
  return out;
}
