import { createHash } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * The key a pick is displayed by: `sha256(digest.seed:id)`. It changes between digests and
 * carries no meaning, so a list sorted by it is "in no particular order" (matching.md 3.4).
 */
export function displayKey(seed: string, id: string): string {
  return sha256Hex(`${seed}:${id}`);
}

/** A copy of `items` in the seeded display order. */
export function inDisplayOrder<T>(items: readonly T[], seed: string, idOf: (item: T) => string): T[] {
  return items
    .map((item) => ({ item, key: displayKey(seed, idOf(item)) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((x) => x.item);
}
