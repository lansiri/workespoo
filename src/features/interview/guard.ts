/**
 * Output guard on the live stream (docs/specs/interview.md section 7). Applied sentence by
 * sentence as tokens arrive, before text reaches the client or text-to-speech.
 */
import { findBannedEvaluative, findProtectedQuestion } from "@/lib/lexicon";

export const STOP_SENTINEL = "[[STOP]]";
export const GUARD_MAX_SENTENCES = 2;
export const GUARD_MAX_WORDS = 40;
/** A non-question sentence (an acknowledgement or a one-line answer) may be at most this long. */
const MAX_STATEMENT_WORDS = 30;
export const LIVE_TIMEOUT_MS = 6000;

export type GuardResult = {
  /** Sentences that were emitted, in order. Includes the fallback question when used. */
  emitted: string[];
  text: string;
  stopped: boolean;
  fallbackUsed: boolean;
  /** The caller's signal aborted (barge-in or disconnect): nothing more was emitted. */
  aborted: boolean;
  /** Short action names for the `llm_call.guard` column. */
  actions: string[];
};

export type GuardOptions = {
  fallbackQuestion: string;
  /** Aborts the model stream once the guard has what it needs. Pass the same controller to `chatStream`. */
  upstream: AbortController;
  /** The caller's signal. Aborting it ends the guard without a fallback. */
  signal?: AbortSignal;
  timeoutMs?: number;
  /** The model call's options: `guard` is set to what the guard did, before the stream is cut. */
  llmOptions?: { guard?: string | null };
};

const LABEL = /^\s*(?:interviewer|you|haastattelija|intervjuare)\s*:\s*/i;
const ABBREVIATION_END = /(?:^|\s)(?:e\.g|i\.e|etc|esim|mm|jne|ns|t\.ex|bl\.a|dvs|osv)\.$/i;
const BOUNDARY = /[.!?…]+["'”’)\]]*(?=\s)/g;

/** Index just past the first real sentence end followed by whitespace, or -1. */
function findBoundary(text: string): number {
  for (const m of text.matchAll(BOUNDARY)) {
    const end = m.index + m[0].length;
    if (ABBREVIATION_END.test(text.slice(0, end))) continue;
    return end;
  }
  // A question mark at the very end is a complete question: do not wait for the stream to close.
  const q = /\?["'”’)\]]*$/.exec(text);
  return q ? text.length : -1;
}

export function wordsIn(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

/** Strip markdown, emoji, quotation marks and a leading speaker label. */
export function cleanSentence(sentence: string): string {
  return sentence
    .replace(LABEL, "")
    .replace(/[*_`#~>]+/g, "")
    .replace(/^\s*(?:[-•]\s+|\d+[.)]\s+)/, "")
    .replace(/\p{Extended_Pictographic}|️|‍/gu, "")
    .replace(/["“”„«»]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function endsWithQuestion(text: string): boolean {
  return /\?["'”’)\]]*$/.test(text.trim());
}

const TIMED_OUT = Symbol("timed out");
const ABORTED = Symbol("aborted");

/**
 * Yields each sentence that passes the guard; the generator's return value says what happened.
 * Consume with a manual `next()` loop to read the result.
 */
export async function* guardStream(
  source: AsyncIterable<string>,
  options: GuardOptions,
): AsyncGenerator<string, GuardResult, void> {
  const { upstream, signal } = options;
  const result: GuardResult = {
    emitted: [],
    text: "",
    stopped: false,
    fallbackUsed: false,
    aborted: false,
    actions: [],
  };
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    upstream.abort();
  }, options.timeoutMs ?? LIVE_TIMEOUT_MS);
  const onAbort = () => {
    result.aborted = true;
    upstream.abort();
  };
  if (signal?.aborted) onAbort();
  signal?.addEventListener("abort", onAbort, { once: true });

  const interrupted = new Promise<typeof TIMED_OUT | typeof ABORTED>((resolve) => {
    upstream.signal.addEventListener("abort", () => resolve(timedOut ? TIMED_OUT : ABORTED), { once: true });
    if (upstream.signal.aborted) resolve(timedOut ? TIMED_OUT : ABORTED);
  });

  let raw = "";
  let pending = "";
  let words = 0;
  let statements = 0;
  let haveQuestion = false;
  /** An acceptable statement is held until a question is accepted, so a fallback never makes the reply too long. */
  let held: string | null = null;
  const fallbackSentences = (options.fallbackQuestion.match(/[.!?]+(?=\s|$)/g) ?? []).length;
  const accept = function* (decided: { emit?: string; done?: boolean }): Generator<string> {
    if (decided.emit === undefined) return;
    if (!decided.done) {
      // A statement can be shown at once only if the fallback could still follow it within the limits.
      const fits =
        fallbackSentences <= 1 && wordsIn(decided.emit) + wordsIn(options.fallbackQuestion) <= GUARD_MAX_WORDS;
      if (fits) {
        result.emitted.push(decided.emit);
        yield decided.emit;
      } else held = decided.emit;
      return;
    }
    if (held !== null) {
      result.emitted.push(held);
      yield held;
      held = null;
    }
    result.emitted.push(decided.emit);
    yield decided.emit;
  };

  /** Decide what to do with one sentence. Applies the effect only when `commit` is true. */
  const judge = (sentence: string, commit: boolean): { emit?: string; done?: boolean; action?: string } => {
    const text = cleanSentence(sentence);
    if (text === "" || !/[\p{L}\p{N}]/u.test(text)) return {};
    if (findBannedEvaluative(text).length > 0 || findProtectedQuestion(text).length > 0) {
      if (commit) result.actions.push("dropped_sentence");
      return { action: "dropped_sentence" };
    }
    const w = wordsIn(text);
    if (endsWithQuestion(text)) {
      if (words + w > GUARD_MAX_WORDS) {
        if (commit) result.actions.push("dropped_long");
        return { action: "dropped_long" };
      }
      if (commit) words += w;
      return { emit: text, done: true };
    }
    if (statements >= GUARD_MAX_SENTENCES - 1 || w > MAX_STATEMENT_WORDS || words + w > GUARD_MAX_WORDS) {
      if (commit) result.actions.push("dropped_extra");
      return { action: "dropped_extra" };
    }
    if (commit) {
      statements++;
      words += w;
    }
    return { emit: text };
  };
  const consider = (sentence: string) => judge(sentence, true);

  /**
   * What the guard would have done had the stream ended right now. The model call is logged
   * at the moment its stream ends, so `llmOptions.guard` reads this lazily at that moment.
   */
  const noteIfEndedNow = (): string | null => {
    const actions = [...result.actions];
    if (!haveQuestion && !result.stopped && !result.aborted) {
      const last = pending.trim() === "" || timedOut ? {} : judge(pending, false);
      if (last.action) actions.push(last.action);
      if (!last.done) actions.push("fallback");
    }
    const note = [...new Set(actions)].join(",").slice(0, 120);
    return note === "" ? null : note;
  };
  if (options.llmOptions) {
    Object.defineProperty(options.llmOptions, "guard", {
      configurable: true,
      enumerable: true,
      get: noteIfEndedNow,
    });
  }

  const iterator = source[Symbol.asyncIterator]();
  try {
    reading: while (!result.aborted) {
      const step = await Promise.race([iterator.next(), interrupted]);
      if (step === TIMED_OUT || step === ABORTED) break;
      if (step.done) break;
      raw += step.value;
      if (raw.includes(STOP_SENTINEL)) {
        result.stopped = true;
        result.actions.push("stop");
        break;
      }
      pending += step.value;
      // Hold back until the first 8 characters are in, so a leading sentinel is never emitted.
      if (raw.trimStart().length < STOP_SENTINEL.length) continue;
      for (;;) {
        const boundary = findBoundary(pending);
        if (boundary === -1) break;
        const sentence = pending.slice(0, boundary);
        pending = pending.slice(boundary).trimStart();
        const decided = consider(sentence);
        yield* accept(decided);
        if (decided.done) {
          haveQuestion = true;
          break reading;
        }
      }
    }
    if (!haveQuestion && !result.stopped && !result.aborted && !timedOut && pending.trim() !== "") {
      const decided = consider(pending);
      pending = "";
      yield* accept(decided);
      if (decided.done) haveQuestion = true;
    }
  } catch {
    result.actions.push("stream_error");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    if (options.llmOptions) {
      Object.defineProperty(options.llmOptions, "guard", {
        configurable: true,
        enumerable: true,
        writable: true,
        value: noteIfEndedNow(),
      });
    }
    upstream.abort();
    void iterator.return?.().catch(() => {});
  }

  if (result.stopped) {
    result.emitted = [];
    result.text = "";
    return result;
  }
  if (!haveQuestion && !result.aborted) {
    result.fallbackUsed = true;
    result.actions.push("fallback");
    result.emitted.push(options.fallbackQuestion);
    yield options.fallbackQuestion;
  }
  result.text = result.emitted.join(" ");
  return result;
}
