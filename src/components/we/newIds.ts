/** Ids present in `next` that were not in `prev`. Order follows `next`. Used so only new notes animate. */
export function newIds(prev: readonly string[], next: readonly string[]): string[] {
  const seen = new Set(prev);
  return next.filter((id) => !seen.has(id));
}
