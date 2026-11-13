import { createHash } from "node:crypto";

/** Seed string for every random choice in the synthetic world (docs/specs/synthetic-world.md). */
export const SYNTH_SEED = "workespoo-demo-2026";

/** `sha256(SYNTH_SEED + ":" + purpose + ":" + key)` as a hex string. */
export function seededHash(purpose: string, key: string | number): string {
  return createHash("sha256").update(`${SYNTH_SEED}:${purpose}:${key}`).digest("hex");
}

/** The same hash mapped to [0, 1). */
export function seededUnit(purpose: string, key: string | number): number {
  return Number.parseInt(seededHash(purpose, key).slice(0, 12), 16) / 2 ** 48;
}
