"use client";

/**
 * Owns the interview page's two streams: the response to each turn (`turn.delta`, `turn.done`)
 * and the background events stream (signals, coverage, jobs lit, completion, card ready,
 * reconnecting after a drop). The page only renders what this hook returns, so Phase 3 can
 * restyle it freely. Client-safe: no server imports.
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import type { CoverageArea, CoverageStatus, InterviewEvent, JobTeaser, SignalPublic } from "@/contracts";
import { readSse } from "@/lib/sse-client";
import type { InterviewView, TranscriptLine } from "./views";

export type InterviewInitial = Pick<InterviewView, "interviewId" | "ended" | "transcript" | "signals" | "coverage">;

export type InterviewUiState = {
  transcript: TranscriptLine[];
  /** The interviewer's line while it is still arriving. */
  streaming: string | null;
  signals: SignalPublic[];
  jobsLit: { count: number; sample: JobTeaser[] };
  coverage: Partial<Record<CoverageArea, CoverageStatus>>;
  sending: boolean;
  /** The closing line has been sent. */
  ended: boolean;
  cardReady: boolean;
  /** Preparing the notes failed (`retry`) or there were no notes to prepare (`none`). */
  cardProblem: "retry" | "none" | null;
  sendFailed: boolean;
  reconnecting: boolean;
};

type Action =
  | { type: "event"; event: InterviewEvent }
  | { type: "participant"; text: string }
  | { type: "sending"; value: boolean }
  | { type: "sendFailed"; value: boolean }
  | { type: "reconnecting"; value: boolean }
  | { type: "interrupt" };

export function initialUiState(initial: InterviewInitial): InterviewUiState {
  return {
    transcript: initial.transcript,
    streaming: null,
    signals: initial.signals,
    jobsLit: { count: 0, sample: [] },
    coverage: initial.coverage,
    sending: false,
    ended: initial.ended,
    cardReady: false,
    cardProblem: null,
    sendFailed: false,
    reconnecting: false,
  };
}

/** Events are applied idempotently, so replaying the whole stream after a reconnect is safe. */
export function reduce(state: InterviewUiState, action: Action): InterviewUiState {
  switch (action.type) {
    case "participant":
      return { ...state, transcript: [...state.transcript, { index: -1, role: "participant", text: action.text }], sendFailed: false };
    case "sending":
      return { ...state, sending: action.value };
    case "sendFailed":
      return { ...state, sendFailed: action.value };
    case "reconnecting":
      return { ...state, reconnecting: action.value };
    case "interrupt":
      return { ...state, streaming: null };
    case "event":
      return applyEvent(state, action.event);
  }
}

function applyEvent(state: InterviewUiState, event: InterviewEvent): InterviewUiState {
  switch (event.type) {
    case "turn.delta":
      return { ...state, streaming: state.streaming ? `${state.streaming} ${event.text}` : event.text };
    case "turn.done": {
      const known = state.transcript.some((l) => l.role === "interviewer" && l.index === event.turnIndex);
      return {
        ...state,
        streaming: null,
        ended: state.ended || event.closing,
        transcript: known
          ? state.transcript
          : [...state.transcript, { index: event.turnIndex, role: "interviewer", text: event.text }],
      };
    }
    case "signal.proposed":
    case "signal.updated": {
      const rest = state.signals.filter((s) => s.id !== event.signal.id);
      if (event.signal.status === "removed") return { ...state, signals: rest };
      const at = state.signals.findIndex((s) => s.id === event.signal.id);
      const signals = [...state.signals];
      if (at >= 0) signals[at] = event.signal;
      else signals.push(event.signal);
      return { ...state, signals };
    }
    case "jobs.lit":
      return { ...state, jobsLit: { count: event.count, sample: event.sample } };
    case "coverage.updated":
      return { ...state, coverage: { ...state.coverage, ...event.areas } };
    case "interview.completed":
      return { ...state, ended: true };
    case "card.ready":
      return { ...state, cardReady: true, cardProblem: null };
    case "error":
      // Only errors that matter after the end are shown; a failed turn is handled by `sendFailed`.
      return state.ended && !state.cardReady ? { ...state, cardProblem: event.retryable ? "retry" : "none" } : state;
  }
}

const MAX_SEND_ATTEMPTS = 3;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 8000;

export type UseInterviewOptions = {
  initial: InterviewInitial;
  /** Called once per interviewer sentence as it arrives (for text-to-speech). */
  onSentence?: (sentence: string) => void;
};

export function useInterview({ initial, onSentence }: UseInterviewOptions) {
  const { interviewId } = initial;
  const [state, dispatch] = useReducer(reduce, initial, initialUiState);

  const onSentenceRef = useRef(onSentence);
  useEffect(() => {
    onSentenceRef.current = onSentence;
  });
  const turnAbort = useRef<AbortController | null>(null);
  // Latest flags for the events loop, which must not restart when they change.
  const finished = useRef(false);
  useEffect(() => {
    finished.current = state.cardReady || state.cardProblem !== null;
  }, [state.cardReady, state.cardProblem]);

  /* The background events stream, with replay and reconnect. */
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      let attempt = 0;
      while (!abort.signal.aborted && !finished.current) {
        try {
          const res = await fetch(`/api/interview/${interviewId}/events`, { signal: abort.signal });
          dispatch({ type: "reconnecting", value: false });
          attempt = 0;
          await readSse(res, (event) => dispatch({ type: "event", event }), abort.signal);
        } catch {
          if (abort.signal.aborted) return;
        }
        if (abort.signal.aborted || finished.current) return;
        dispatch({ type: "reconnecting", value: true });
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt++, RECONNECT_MAX_MS);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    })();
    return () => abort.abort();
  }, [interviewId]);

  /* A turn: the answer goes up, the reply streams back. A retry reuses the same key. */
  const send = useCallback(
    async (text: string, inputMode: "text" | "voice" = "text") => {
      const trimmed = text.trim();
      if (!trimmed) return false;
      turnAbort.current?.abort(); // barge-in: the earlier reply stops arriving
      const abort = new AbortController();
      turnAbort.current = abort;
      dispatch({ type: "interrupt" });
      dispatch({ type: "participant", text: trimmed });
      dispatch({ type: "sending", value: true });
      const key = crypto.randomUUID();
      let delivered = false;
      for (let attempt = 0; attempt < MAX_SEND_ATTEMPTS && !abort.signal.aborted && !delivered; attempt++) {
        try {
          const res = await fetch(`/api/interview/${interviewId}/turn`, {
            method: "POST",
            headers: { "content-type": "application/json", "idempotency-key": key },
            body: JSON.stringify({ text: trimmed, inputMode }),
            signal: abort.signal,
          });
          if (res.status === 409) {
            delivered = true; // the interview has ended; nothing to retry
            dispatch({ type: "event", event: { type: "interview.completed", interviewId, talentId: "" } });
            break;
          }
          await readSse(
            res,
            (event) => {
              if (event.type === "turn.delta") onSentenceRef.current?.(event.text);
              if (event.type === "turn.done") delivered = true;
              dispatch({ type: "event", event });
            },
            abort.signal,
          );
        } catch {
          if (abort.signal.aborted) break;
        }
      }
      if (turnAbort.current === abort) {
        dispatch({ type: "sending", value: false });
        if (!delivered && !abort.signal.aborted) dispatch({ type: "sendFailed", value: true });
      }
      return delivered;
    },
    [interviewId],
  );

  /** The Stop button. The closing line arrives on the events stream. */
  const stop = useCallback(async () => {
    try {
      await fetch(`/api/interview/${interviewId}/stop`, { method: "POST" });
    } catch {
      dispatch({ type: "sendFailed", value: true });
    }
  }, [interviewId]);

  const interviewerLine =
    state.streaming ?? [...state.transcript].reverse().find((l) => l.role === "interviewer")?.text ?? "";

  return { ...state, interviewerLine, send, stop };
}
