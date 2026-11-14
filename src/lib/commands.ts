/**
 * The pre-check (docs/specs/interview.md 6.2): commands and empty input, before any model call.
 * Shared by the general interview and the job interview.
 */
import { COMMAND_WORDS, FILLER_WORDS } from "@/lib/i18n/content/interview-lines";

export type PreCheck = "empty" | "stop" | "skip" | "delete" | "none";

const STOP_MAX_WORDS = 4;
const SKIP_MAX_WORDS = 4;
const DELETE_MAX_WORDS = 6;

/** Lowercase, drop punctuation (keeping apostrophes inside words), collapse spaces. */
export function normaliseForCommand(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/(^|\s)'+|'+(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const all = (key: "stop" | "skip" | "delete") =>
  new Set(Object.values(COMMAND_WORDS).flatMap((c) => c[key].map(normaliseForCommand)));
const STOP = all("stop");
const SKIP = all("skip");
const DELETE = all("delete");
const FILLERS = new Set(Object.values(FILLER_WORDS).flat().map((w) => w.toLowerCase()));

export function wordCount(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

export function preCheck(text: string): PreCheck {
  const normalised = normaliseForCommand(text);
  const words = normalised === "" ? [] : normalised.split(" ");
  if (!/\p{L}/u.test(text) || words.every((w) => FILLERS.has(w))) return "empty";
  if (words.length <= STOP_MAX_WORDS && STOP.has(normalised)) return "stop";
  if (words.length <= SKIP_MAX_WORDS && SKIP.has(normalised)) return "skip";
  if (words.length <= DELETE_MAX_WORDS && DELETE.has(normalised)) return "delete";
  return "none";
}
