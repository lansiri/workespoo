function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Legal-form words that postings often leave off a company name ("Acme Robotics" for "Acme Robotics Oy"). */
const LEGAL_FORMS = new Set(["oy", "oyj", "ab", "abp", "ltd", "inc", "gmbh", "llc", "plc", "ry", "ky", "as", "asa", "a/s", "bv", "sa"]);

/** The name without trailing legal-form words, or null when there is nothing to strip. */
function withoutLegalForm(name: string): string | null {
  const words = name.split(/\s+/);
  while (words.length > 1 && LEGAL_FORMS.has(words[words.length - 1].toLowerCase().replace(/\.$/, ""))) words.pop();
  const core = words.join(" ");
  return core !== name && core.length > 0 ? core : null;
}

/**
 * Replace the employer's name in posting text with "the company" (company-view.md 1.1):
 * every case-insensitive occurrence of the full name, of the name without its legal form,
 * and of its first word when that word is longer than three characters.
 */
export function maskEmployer(text: string, employerName: string, replacement = "the company"): string {
  const full = employerName.trim();
  if (!full) return text;
  const names = new Set<string>([full]);
  const core = withoutLegalForm(full);
  if (core) names.add(core);
  const first = full.split(/\s+/)[0] ?? "";
  if (first.length > 3) names.add(first);
  let out = text;
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(escapeRegExp(name), "gi"), replacement);
  }
  return out;
}
