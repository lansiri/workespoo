"use client";

/**
 * Owns the job interview room's state: the turns, the interviewer's line while it arrives, the
 * words noted for each requirement, and the requirements' progress. Posting an answer, skipping,
 * stopping and removing all go through here. The reducer is pure (no browser needed to test it);
 * the hook only wires it to `fetch`. Client-safe: nothing here imports server code.
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import { ApplicationEvent, ApplicationTurn } from "@/contracts/application";
import type { OwnApplication } from "../engine";
import { preCheck } from "@/lib/commands";
import type { EvidenceRef, InputMode, RequirementProgress } from "@/contracts";

export type JobInterviewInitial = Pick<OwnApplication, "id" | "plan" | "state" | "turns" | "status">;

export type JobInterviewState = {
  /** Stored turns in order. A removed answer has empty text. */
  turns: ApplicationTurn[];
  /** The answer just sent, until the server has stored it. A failed send stays here for a retry. */
  pending: { text: string; inputMode: InputMode; clientTurnId: string } | null;
  /** The interviewer's next line while it is still arriving. */
  streaming: string | null;
  /** Requirement ids in the plan's order. */
  order: string[];
  /** Position of the requirement being asked about; the length when all are done. */
  cursor: number;
  progress: Record<string, RequirementProgress>;
  /** Sentences of the person's answers noted for a requirement, by requirement id. */
  noted: Record<string, EvidenceRef[]>;
  sending: boolean;
  sendFailed: boolean;
  /** Skip, stop or remove did not go through. */
  actionFailed: boolean;
  /** The closing line has been stored: the application is in review. */
  ended: boolean;
};

export type JobInterviewAction =
  | { type: "event"; event: ApplicationEvent }
  | { type: "pending"; pending: { text: string; inputMode: InputMode; clientTurnId: string } }
  | { type: "sending"; value: boolean }
  | { type: "sendFailed"; value: boolean }
  | { type: "actionFailed"; value: boolean }
  /** A new answer or a skip: the interviewer's earlier, unfinished line stops arriving. */
  | { type: "interrupt" }
  /** "Skip question": the requirement being asked about is marked at once. */
  | { type: "skipping" }
  /** The server says the interview is over (409): nothing more is accepted. */
  | { type: "closed" }
  /** The server's own picture after a removal. */
  | { type: "synced"; application: Pick<OwnApplication, "turns" | "state" | "status"> };

export function initialJobState(initial: JobInterviewInitial): JobInterviewState {
  return {
    turns: initial.turns,
    pending: null,
    streaming: null,
    order: initial.plan.requirements.map((r) => r.requirementId),
    cursor: initial.state.cursor,
    progress: initial.state.progress,
    noted: initial.state.noted,
    sending: false,
    sendFailed: false,
    actionFailed: false,
    ended: initial.status !== "interviewing",
  };
}

function upsertTurn(turns: ApplicationTurn[], turn: ApplicationTurn): ApplicationTurn[] {
  const at = turns.findIndex((t) => t.index === turn.index);
  if (at < 0) return [...turns, turn].sort((a, b) => a.index - b.index);
  const next = [...turns];
  next[at] = turn;
  return next;
}

function sameRef(a: EvidenceRef, b: EvidenceRef): boolean {
  return a.turnIndex === b.turnIndex && a.sentenceFrom === b.sentenceFrom && a.sentenceTo === b.sentenceTo;
}

/** Everything asked before the one now being asked, and not skipped, counts as answered. */
function settleBefore(progress: Record<string, RequirementProgress>, order: string[], upTo: number): Record<string, RequirementProgress> {
  const next = { ...progress };
  order.forEach((id, i) => {
    if (i < upTo && next[id] === "asked") next[id] = "answered";
  });
  return next;
}

/** The requirement the interviewer last asked about. */
export function currentRequirementId(state: Pick<JobInterviewState, "turns">): string | null {
  const last = [...state.turns].reverse().find((t) => t.role === "interviewer" && t.requirementId !== null);
  return last?.requirementId ?? null;
}

/** Events are applied idempotently, so a replayed stream does not change the picture. */
export function reduceJob(state: JobInterviewState, action: JobInterviewAction): JobInterviewState {
  switch (action.type) {
    case "pending":
      return { ...state, pending: action.pending, sendFailed: false };
    case "sending":
      return { ...state, sending: action.value };
    case "sendFailed":
      return { ...state, sendFailed: action.value };
    case "actionFailed":
      return { ...state, actionFailed: action.value };
    case "interrupt":
      return { ...state, streaming: null };
    case "skipping": {
      const id = currentRequirementId(state);
      if (!id || state.progress[id] === "answered" || state.progress[id] === "skipped") return { ...state, actionFailed: false };
      return { ...state, progress: { ...state.progress, [id]: "skipped" }, actionFailed: false };
    }
    case "closed":
      return { ...state, ended: true, pending: null, sending: false, sendFailed: false };
    case "synced": {
      const { application } = action;
      return {
        ...state,
        turns: application.turns,
        cursor: application.state.cursor,
        progress: application.state.progress,
        noted: application.state.noted,
        ended: state.ended || application.status !== "interviewing",
        actionFailed: false,
      };
    }
    case "event":
      return applyEvent(state, action.event);
  }
}

function applyEvent(state: JobInterviewState, event: ApplicationEvent): JobInterviewState {
  switch (event.type) {
    case "turn.delta":
      return { ...state, streaming: state.streaming ? `${state.streaming} ${event.text}` : event.text };
    case "answer.stored":
      return { ...state, turns: upsertTurn(state.turns, event.turn), pending: null, sendFailed: false };
    case "requirement.noted": {
      const before = state.noted[event.requirementId] ?? [];
      const merged = [...before];
      for (const ref of event.evidence) if (!merged.some((r) => sameRef(r, ref))) merged.push(ref);
      return {
        ...state,
        noted: { ...state.noted, [event.requirementId]: merged },
        progress: { ...state.progress, [event.requirementId]: event.progress },
      };
    }
    case "turn.done": {
      const turns = upsertTurn(state.turns, event.turn);
      let progress = state.progress;
      let cursor = state.cursor;
      if (event.ended) {
        progress = settleBefore(progress, state.order, state.order.length);
        cursor = state.order.length;
      } else if (event.turn.role === "interviewer" && event.turn.requirementId !== null) {
        const at = state.order.indexOf(event.turn.requirementId);
        if (at >= 0) {
          progress = settleBefore(progress, state.order, at);
          if (progress[event.turn.requirementId] === "waiting" || progress[event.turn.requirementId] === undefined) {
            progress = { ...progress, [event.turn.requirementId]: "asked" };
          }
          cursor = at;
        }
      }
      return { ...state, turns, streaming: null, progress, cursor, ended: state.ended || event.ended };
    }
    case "error":
      return { ...state, sendFailed: true };
  }
}

/* ------------------------------------------------------------------------------------------
 * The event stream
 * ---------------------------------------------------------------------------------------- */

function parseFrame(frame: string): ApplicationEvent | null {
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    if (field !== "data") continue;
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    data.push(value);
  }
  if (data.length === 0) return null;
  try {
    const parsed = ApplicationEvent.safeParse(JSON.parse(data.join("\n")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Reads a server-sent event response of `ApplicationEvent`s. Throws when the response is not ok. */
export async function readApplicationSse(response: Response, onEvent: (event: ApplicationEvent) => void, signal?: AbortSignal): Promise<void> {
  if (!response.ok) throw new Error(`Event stream request failed with status ${response.status}`);
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const onAbort = () => void reader.cancel().catch(() => {});
  if (signal?.aborted) {
    onAbort();
    return;
  }
  signal?.addEventListener("abort", onAbort, { once: true });
  let buffer = "";
  const flush = (final: boolean) => {
    buffer = buffer.replace(/\r\n?/g, "\n");
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const event = parseFrame(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 2);
      if (event) onEvent(event);
    }
    if (final && buffer.trim()) {
      const event = parseFrame(buffer);
      buffer = "";
      if (event) onEvent(event);
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      flush(false);
    }
    buffer += decoder.decode();
    flush(true);
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

/* ------------------------------------------------------------------------------------------
 * The hook
 * ---------------------------------------------------------------------------------------- */

const MAX_SEND_ATTEMPTS = 3;

/** The server's own picture of the interview. Throws when it cannot be read. */
export async function fetchOwnApplication(applicationId: string): Promise<Pick<OwnApplication, "turns" | "state" | "status">> {
  const own = await fetch(`/api/application/${applicationId}`, { cache: "no-store" });
  if (!own.ok) throw new Error(String(own.status));
  return (await own.json()) as Pick<OwnApplication, "turns" | "state" | "status">;
}

export type UseJobInterviewOptions = {
  initial: JobInterviewInitial;
  /** Called once per sentence of the interviewer's next line as it arrives (for text-to-speech). */
  onSentence?: (sentence: string) => void;
};

function newClientTurnId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `t-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useJobInterview({ initial, onSentence }: UseJobInterviewOptions) {
  const applicationId = initial.id;
  const [state, dispatch] = useReducer(reduceJob, initial, initialJobState);

  const onSentenceRef = useRef(onSentence);
  useEffect(() => {
    onSentenceRef.current = onSentence;
  });
  /** The question now on screen, for a skip to name. */
  const currentRef = useRef<string | null>(null);
  useEffect(() => {
    currentRef.current = currentRequirementId(state);
  }, [state]);
  const turnAbort = useRef<AbortController | null>(null);
  const lastAttempt = useRef<{ text: string; inputMode: InputMode; clientTurnId: string } | null>(null);

  /** Reads one stream of events into the reducer. Returns true when the interviewer's line was stored. */
  const consume = useCallback(async (res: Response, abort: AbortController): Promise<boolean> => {
    let delivered = false;
    await readApplicationSse(
      res,
      (event) => {
        if (event.type === "turn.delta") onSentenceRef.current?.(event.text);
        if (event.type === "turn.done") delivered = true;
        dispatch({ type: "event", event });
      },
      abort.signal,
    );
    return delivered;
  }, []);

  /** Posts one answer, again with the same id on a network error. */
  const post = useCallback(
    async (attempt: { text: string; inputMode: InputMode; clientTurnId: string }) => {
      turnAbort.current?.abort(); // barge-in: the earlier reply stops arriving
      const abort = new AbortController();
      turnAbort.current = abort;
      dispatch({ type: "interrupt" });
      dispatch({ type: "sending", value: true });
      let delivered = false;
      for (let i = 0; i < MAX_SEND_ATTEMPTS && !abort.signal.aborted && !delivered; i++) {
        try {
          const res = await fetch(`/api/application/${applicationId}/turn`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text: attempt.text, inputMode: attempt.inputMode, clientTurnId: attempt.clientTurnId }),
            signal: abort.signal,
          });
          if (res.status === 409) {
            // Not interviewing any more: the page moves on to the review.
            delivered = true;
            dispatch({ type: "closed" });
            break;
          }
          delivered = await consume(res, abort);
        } catch {
          if (abort.signal.aborted) break;
        }
      }
      if (delivered && !abort.signal.aborted && preCheck(attempt.text) === "delete") {
        // "Delete that": the server removed the previous answer, but no event says so. Take its picture.
        try {
          dispatch({ type: "synced", application: await fetchOwnApplication(applicationId) });
        } catch {
          /* the next reload shows the server's picture */
        }
      }
      if (turnAbort.current === abort) {
        dispatch({ type: "sending", value: false });
        if (!delivered && !abort.signal.aborted) dispatch({ type: "sendFailed", value: true });
      }
      return delivered;
    },
    [applicationId, consume],
  );

  /** A new answer, with a fresh id. */
  const send = useCallback(
    async (text: string, inputMode: InputMode = "text") => {
      const trimmed = text.trim();
      if (!trimmed) return false;
      const attempt = { text: trimmed, inputMode, clientTurnId: newClientTurnId() };
      lastAttempt.current = attempt;
      dispatch({ type: "pending", pending: attempt });
      return post(attempt);
    },
    [post],
  );

  /** The failed answer again, with the same id, so it is stored once. */
  const retry = useCallback(async () => {
    const attempt = lastAttempt.current;
    if (!attempt) return false;
    dispatch({ type: "pending", pending: attempt });
    return post(attempt);
  }, [post]);

  /** "Skip question". The next line arrives as it does after an answer. */
  const skip = useCallback(async () => {
    turnAbort.current?.abort();
    const abort = new AbortController();
    turnAbort.current = abort;
    const skipped = currentRef.current;
    dispatch({ type: "interrupt" });
    dispatch({ type: "skipping" });
    dispatch({ type: "sending", value: true });
    let ok = false;
    try {
      // The question on screen goes along, so a skip that arrives late cannot skip the next one.
      const res = await fetch(`/api/application/${applicationId}/skip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(skipped ? { requirementId: skipped } : {}),
        signal: abort.signal,
      });
      ok = await consume(res, abort);
    } catch {
      ok = false;
    }
    if (turnAbort.current === abort) {
      dispatch({ type: "sending", value: false });
      if (!ok && !abort.signal.aborted) dispatch({ type: "actionFailed", value: true });
    }
    return ok;
  }, [applicationId, consume]);

  /** The Stop button: the closing line comes back and the application is in review. */
  const stop = useCallback(async () => {
    turnAbort.current?.abort();
    dispatch({ type: "interrupt" });
    try {
      const res = await fetch(`/api/application/${applicationId}/stop`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      // The route answers `{ turn }`.
      const body = (await res.json()) as { turn?: unknown };
      const turn = ApplicationTurn.parse(body.turn ?? body);
      dispatch({ type: "event", event: { type: "turn.done", turn, ended: true } });
      return true;
    } catch {
      dispatch({ type: "actionFailed", value: true });
      return false;
    }
  }, [applicationId]);

  /** "Remove this answer": then ask the server for its picture of the interview. */
  const removeTurn = useCallback(
    async (turnIndex: number) => {
      try {
        const res = await fetch(`/api/application/${applicationId}/remove`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ turnIndex }),
        });
        if (!res.ok) throw new Error(String(res.status));
        dispatch({ type: "synced", application: await fetchOwnApplication(applicationId) });
        return true;
      } catch {
        dispatch({ type: "actionFailed", value: true });
        return false;
      }
    },
    [applicationId],
  );

  const interviewerLine = state.streaming ?? [...state.turns].reverse().find((t) => t.role === "interviewer" && t.text !== "")?.text ?? "";

  return { ...state, interviewerLine, send, retry, skip, stop, removeTurn };
}
