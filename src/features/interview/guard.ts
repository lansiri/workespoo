/**
 * Output guard on the live stream (docs/specs/interview.md section 7). Applied sentence by
 * sentence as tokens arrive, before text reaches the client or text-to-speech.
 *
 * Nothing is shown until a sentence ending in "?" has arrived (patch IL-1): the model sometimes
 * writes planning notes first, and those must never reach the person. The buffered statement
 * (at most one) is emitted together with the question; with no question the fallback is used.
 */
import { findBannedEvaluative, findProtectedQuestion } from "@/lib/lexicon";

export const STOP_SENTINEL = "[[STOP]]";
export const GUARD_MAX_SENTENCES = 2;
export const GUARD_MAX_WORDS = 40;
/** A non-question sentence (an acknowledgement or a one-line answer) may be at most this long. */
const MAX_STATEMENT_WORDS = 30;

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
  const onAbort = () => {
    result.aborted = true;
    upstream.abort();
  };
  if (signal?.aborted) onAbort();
  signal?.addEventListener("abort", onAbort, { once: true });

  const interrupted = new Promise<typeof ABORTED>((resolve) => {
    upstream.signal.addEventListener("abort", () => resolve(ABORTED), { once: true });
    if (upstream.signal.aborted) resolve(ABORTED);
  });

  let raw = "";
  let pending = "";
  let words = 0;
  let statements = 0;
  let haveQuestion = false;
  /** The one acceptable statement, held back until a question is accepted. */
  let buffered: string | null = null;
  /** Over 40 words arrived with no question. */
  let overflowed = false;

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
      const last = pending.trim() === "" ? {} : judge(pending, false);
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
      if (step === ABORTED) break;
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
        if (decided.done && decided.emit !== undefined) {
          if (buffered !== null) {
            result.emitted.push(buffered);
            yield buffered;
            buffered = null;
          }
          result.emitted.push(decided.emit);
          yield decided.emit;
          haveQuestion = true;
          break reading;
        }
        if (decided.emit !== undefined) buffered = decided.emit;
      }
      // 40 words have arrived and still no question: discard the buffer and use the fallback.
      if (wordsIn(raw) > GUARD_MAX_WORDS) {
        overflowed = true;
        result.actions.push("dropped_long");
        break;
      }
    }
    if (!haveQuestion && !result.stopped && !result.aborted && !overflowed && pending.trim() !== "") {
      const decided = consider(pending);
      pending = "";
      if (decided.done && decided.emit !== undefined) {
        if (buffered !== null) {
          result.emitted.push(buffered);
          yield buffered;
        }
        result.emitted.push(decided.emit);
        yield decided.emit;
        haveQuestion = true;
      }
    }
  } catch {
    result.actions.push("stream_error");
  } finally {
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
    result.emitted = [options.fallbackQuestion];
    yield options.fallbackQuestion;
  }
  result.text = result.emitted.join(" ");
  return result;
}
