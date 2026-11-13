import { randomBytes, randomInt } from "node:crypto";

export type IdPrefix =
  | "tal" | "int" | "trn" | "job" | "co" | "nc" | "req" | "jm" | "dig" | "pick"
  | "intro" | "ag" | "ev" | "con" | "ntf" | "note";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** `${prefix}_${12 random lowercase alphanumerics}`. */
export function newId(prefix: IdPrefix): string {
  let out = "";
  for (let i = 0; i < 12; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}_${out}`;
}

/** 32 random URL-safe characters, for signed links (digest, agenda). */
export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Fixed word list from docs/specs/signal-card.md section 6. */
export const HANDLE_WORDS = [
  "Maple", "Birch", "Cedar", "Spruce", "Alder", "Larch", "Pine", "Moss", "Lichen", "Pebble",
  "Granite", "Basalt", "Quartz", "Harbour", "Fjord", "Delta", "Meadow", "Ridge", "Glacier",
  "Comet", "Orbit", "Lantern", "Compass", "Anchor", "Beacon", "Kettle", "Ladder", "Bridge",
  "Canal", "Island", "Valley", "Cloud",
] as const;

const TWO_DIGIT_ATTEMPTS = 20;

/** A pseudonymous handle such as `Birch-27`. After 20 collisions it uses three digits. */
export async function newHandle(isTaken: (handle: string) => Promise<boolean>): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const word = HANDLE_WORDS[randomInt(HANDLE_WORDS.length)];
    const number = attempt < TWO_DIGIT_ATTEMPTS ? randomInt(10, 100) : randomInt(100, 1000);
    const handle = `${word}-${number}`;
    if (!(await isTaken(handle))) return handle;
    if (attempt > 10_000) throw new Error("Could not find a free handle");
  }
}
