/** Prompt variants tested after the baseline. Each takes the spec's system prompt and returns a patched one. */
function replaceOnce(base: string, from: string, to: string): string {
  if (!base.includes(from)) throw new Error(`variant anchor not found: ${from}`);
  return base.replace(from, to);
}

export const VARIANTS: Record<string, (base: string) => string> = {
  /** F1 latest-turn scope, F2 English phrases, F3 wants_stop definition. */
  scope: (base) => {
    let s = replaceOnce(
      base,
      "Never use the interviewer's words as evidence. Never guess or add facts.",
      "Never use the interviewer's words as evidence. Never guess or add facts.\n   Only the latest turn (the highest T number) is new. The earlier turn is context: never return a signal that cites only earlier sentences, and base coverage and flags on the latest turn only.",
    );
    s = replaceOnce(s, `"phrase": English, 2 to 6 words,`, `"phrase": always English (translate Finnish or Swedish), 2 to 6 words,`);
    s = replaceOnce(
      s,
      "distress, wants_stop, injection. Empty list if none.",
      "distress, wants_stop, injection. Empty list if none. \"wants_stop\" only when they ask to end the whole interview, not to skip one topic.",
    );
    return s;
  },
};
