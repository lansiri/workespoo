function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace the employer's name in posting text with "the company" (company-view.md 1.1):
 * every case-insensitive occurrence of the full name, and of its first word when that word
 * is longer than three characters.
 */
export function maskEmployer(text: string, employerName: string, replacement = "the company"): string {
  const full = employerName.trim();
  if (!full) return text;
  const names = new Set<string>([full]);
  const first = full.split(/\s+/)[0] ?? "";
  if (first.length > 3) names.add(first);
  let out = text;
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(escapeRegExp(name), "gi"), replacement);
  }
  return out;
}
