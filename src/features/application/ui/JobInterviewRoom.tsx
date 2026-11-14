"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AiDisclosure,
  Button,
  Dialog,
  HoldToTalk,
  InterviewControls,
  InterviewLayout,
  InterviewProgress,
  InterviewerLine,
  InterviewerMascot,
  Tag,
  Transcript,
  TypeAnswer,
  TypeInsteadButton,
  WordsBox,
  type MascotState,
  type TranscriptTurn,
} from "@/components/we";
import { fmt } from "@/lib/i18n";
import { useMessages } from "@/lib/i18n/client";
import { errorCopy, interviewCopy } from "@/lib/i18n/content";
import { splitSentences } from "@/lib/sentences";
import { useVoice } from "@/features/voice/useVoice";
import type { EvidenceRef, RequirementProgress } from "@/contracts";
import { applyMessages } from "../messages-talent";
import { useJobInterview, type JobInterviewInitial } from "./useJobInterview";
import "./apply.css";

/** After this long without a reply the line "This is taking longer than usual" appears. */
export const SLOW_REPLY_MS = 6000;

/**
 * The sentences of each answer that were noted for a requirement, by turn index, as the 0-based
 * positions the marks use. Only references: no text from a model is involved.
 */
export function notedSentences(noted: Record<string, readonly EvidenceRef[]>): Map<number, number[]> {
  const byTurn = new Map<number, Set<number>>();
  for (const refs of Object.values(noted)) {
    for (const ref of refs) {
      const set = byTurn.get(ref.turnIndex) ?? new Set<number>();
      for (let n = ref.sentenceFrom; n <= ref.sentenceTo; n++) set.add(n - 1);
      byTurn.set(ref.turnIndex, set);
    }
  }
  return new Map([...byTurn].map(([turn, set]) => [turn, [...set].sort((a, b) => a - b)]));
}

/** Which of the interviewer's looks the room shows. It shows what the AI is doing, never a feeling. */
export function jobMascotState(p: { ended: boolean; listening: boolean; speaking: boolean; waiting: boolean }): MascotState {
  if (p.ended) return "idle";
  if (p.listening) return "listening";
  if (p.speaking) return "speaking";
  if (p.waiting) return "thinking";
  return "idle";
}

/** "Question 2 of 5": which question the interviewer is on, never above the total. */
export function questionNumber(cursor: number, total: number): number {
  return Math.max(1, Math.min(cursor + 1, Math.max(1, total)));
}

/* ------------------------------------------------------------------------------------------
 * The room's top bar: progress and Stop, filled from the page's shell through a tiny store
 * ---------------------------------------------------------------------------------------- */

type ChromeState = { current: number; total: number; finished: boolean; stoppable: boolean; stop: (() => void) | null };
type Store = { get: () => ChromeState; set: (patch: Partial<ChromeState>) => void; subscribe: (l: () => void) => () => void };

function createStore(initial: ChromeState): Store {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      const next = { ...state, ...patch };
      if ((Object.keys(next) as (keyof ChromeState)[]).every((k) => next[k] === state[k])) return;
      state = next;
      for (const l of listeners) l();
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

const ChromeContext = createContext<Store | null>(null);

export function JobRoomChromeProvider(props: { total: number; initialCurrent: number; initialFinished: boolean; children: ReactNode }) {
  const [store] = useState(() =>
    createStore({ current: props.initialCurrent, total: props.total, finished: props.initialFinished, stoppable: !props.initialFinished, stop: null }),
  );
  return <ChromeContext.Provider value={store}>{props.children}</ChromeContext.Provider>;
}

function useChrome(): ChromeState | null {
  const store = useContext(ChromeContext);
  return useSyncExternalStore(
    (cb) => (store ? store.subscribe(cb) : () => {}),
    () => (store ? store.get() : null),
    () => (store ? store.get() : null),
  );
}

/** "Question 2 of 5" and the dashes. */
export function JobRoomProgress() {
  const chrome = useChrome();
  const m = useMessages(applyMessages);
  if (!chrome) return null;
  const label = chrome.finished ? m.roomBadgeFinished : fmt(m.roomProgress, { n: chrome.current, total: chrome.total });
  return <InterviewProgress label={label} step={Math.max(0, chrome.current - 1)} total={Math.max(1, chrome.total)} finished={chrome.finished} />;
}

/** Stop in the top bar, with its question. Hidden once the conversation is over. */
export function JobRoomStopButton() {
  const chrome = useChrome();
  const m = useMessages(applyMessages);
  const [open, setOpen] = useState(false);
  if (!chrome || !chrome.stoppable || chrome.finished) return null;
  const close = () => setOpen(false);
  return (
    <>
      <Button icon="stop" className="we-iv-stop-link" data-testid="apply-stop" onClick={() => setOpen(true)}>
        {m.roomStop}
      </Button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <Dialog
              title={m.roomStopTitle}
              testId="apply-stop-dialog"
              onClose={close}
              initialFocus="[data-keep]"
              actions={
                <>
                  <Button data-keep="" onClick={close}>
                    {m.roomStopKeep}
                  </Button>
                  <Button
                    variant="primary"
                    data-testid="apply-stop-confirm"
                    onClick={() => {
                      close();
                      chrome.stop?.();
                    }}
                  >
                    {m.roomStopConfirm}
                  </Button>
                </>
              }
            >
              <p>{m.roomStopBody}</p>
            </Dialog>,
            document.body,
          )
        : null}
    </>
  );
}

function usePublishChrome(): (patch: Partial<ChromeState>) => void {
  const store = useContext(ChromeContext);
  return useCallback((patch) => store?.set(patch), [store]);
}

/* ------------------------------------------------------------------------------------------
 * The room
 * ---------------------------------------------------------------------------------------- */

const STATE_KEYS = {
  waiting: "roomStateWaiting",
  asked: "roomStateAsked",
  answered: "roomStateAnswered",
  skipped: "roomStateSkipped",
} as const satisfies Record<RequirementProgress, string>;

/**
 * The job interview. Everything stateful lives in `useJobInterview` and the voice hook; this
 * file composes the kit: the conversation, the interviewer with the person's own words under
 * it, and on the right what the ad asks for. No level, no points and no hint of a rating is
 * shown here.
 */
export function JobInterviewRoom(props: { initial: JobInterviewInitial; voiceConsented: boolean; voiceOwnServer?: boolean }) {
  const { initial, voiceConsented } = props;
  const m = useMessages(applyMessages);
  const c = useMessages(interviewCopy);
  const e = useMessages(errorCopy);
  const router = useRouter();
  const lang = initial.plan.lang;
  const voice = useVoice({ lang, only: props.voiceOwnServer ? "server" : undefined });
  const voiceOn = voiceConsented && voice.status !== "unavailable";
  const [micBlocked, setMicBlocked] = useState(false);
  if (voice.error?.code === "mic-denied" && !micBlocked) setMicBlocked(true);
  const talkShown = voiceOn && !micBlocked;

  /* A phone plays the interviewer's voice only after one touch or key press has unlocked it. */
  const prepareVoice = voice.prepare;
  const ownRecogniser = voice.adapterId === "server";
  useEffect(() => {
    if (!voiceOn || !ownRecogniser) return;
    const unlock = () => void prepareVoice();
    window.addEventListener("pointerdown", unlock, { once: true, capture: true });
    window.addEventListener("keydown", unlock, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
    };
  }, [voiceOn, ownRecogniser, prepareVoice]);

  const interview = useJobInterview({
    initial,
    onSentence: (sentence) => {
      if (!voiceOn) return;
      // Each sentence joins the end of the reply being spoken, so the whole reply is heard.
      void voice.speakSentences([sentence], lang, { append: true });
    },
  });
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const total = interview.order.length;
  const canAnswer = !interview.ended;
  const waiting = interview.sending && interview.streaming === null;
  const speaking = voiceOn && voice.status === "speaking";
  const listening = voiceOn && voice.status === "listening";
  const transcribing = voiceOn && voice.status === "transcribing";

  /* what the top bar shows, and what its Stop button does */
  const publish = usePublishChrome();
  const { stop: stopInterview } = interview;
  const cancelSpeech = voice.cancelSpeech;
  const stop = useCallback(() => {
    cancelSpeech();
    void stopInterview();
  }, [cancelSpeech, stopInterview]);
  const current = questionNumber(interview.cursor, total);
  useEffect(() => {
    publish({ current, total, finished: interview.ended, stoppable: canAnswer, stop });
  }, [publish, current, total, interview.ended, canAnswer, stop]);

  /* "This is taking longer than usual" after a few seconds of waiting for the reply */
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const id = window.setTimeout(() => setSlow(true), SLOW_REPLY_MS);
    return () => {
      window.clearTimeout(id);
      setSlow(false);
    };
  }, [waiting]);

  function sendAnswer(text: string, inputMode: "text" | "voice") {
    voice.clearError();
    cancelSpeech();
    return interview.send(text, inputMode);
  }
  function submit() {
    const text = draft.trim();
    if (!text || !canAnswer) return;
    setDraft("");
    void sendAnswer(text, "text");
  }

  /* The conversation: stored turns, and the answer being sent */
  const visible = interview.turns.filter((t) => t.removedAt === null && t.text !== "");
  type Line = { key: string; index: number; role: "interviewer" | "participant"; sentences: string[] };
  const lines: Line[] = visible.map((t) => ({
    key: `t${t.index}`,
    index: t.index,
    role: t.role === "participant" ? "participant" : "interviewer",
    sentences: t.sentences.length > 0 ? t.sentences : splitSentences(t.text),
  }));
  // The answer being sent is shown at once; the server's answer.stored replaces it.
  if (interview.pending) lines.push({ key: "pending", index: -1, role: "participant", sentences: splitSentences(interview.pending.text) });
  const answers = lines.filter((l) => l.role === "participant");
  const lastAnswer = answers.at(-1) ?? null;
  const cited = notedSentences(interview.noted);
  const turns: TranscriptTurn[] = lines.map((l) => ({
    speaker: l.role === "interviewer" ? "ai" : "person",
    sentences: l.sentences,
    label: l.role === "interviewer" ? m.roomInterviewer : fmt(m.roomYou, { n: answers.indexOf(l) + 1 }),
    index: l.index,
    removable: l.index > 0 && !interview.ended,
  }));
  const citedByPosition: Record<number, number[]> = {};
  lines.forEach((l, pos) => {
    const marks = l.role === "participant" && l.index >= 0 ? cited.get(l.index) : undefined;
    if (marks) citedByPosition[pos] = marks;
  });

  const mascotState = jobMascotState({ ended: interview.ended, listening, speaking, waiting: waiting || transcribing });
  const badge = interview.ended
    ? m.roomBadgeFinished
    : { idle: m.roomBadgeIdle, listening: m.roomBadgeListening, thinking: m.roomBadgeThinking, speaking: m.roomBadgeSpeaking }[mascotState];
  const talkState = interview.ended ? "done" : listening ? "listening" : mascotState === "thinking" ? "disabled" : "ready";
  const typedLive = canAnswer && draft.trim() !== "";
  const voiceProblem = interview.ended
    ? null
    : micBlocked
      ? e.micDenied
      : voice.error?.code === "unsupported"
        ? e.micUnsupported
        : voice.error && voice.status === "error"
          ? e.voiceFailed
          : null;

  return (
    <div>
      <InterviewLayout
        stageLabel={m.roomInterviewer}
        convo={
          <Transcript
            turns={turns}
            cited={citedByPosition}
            onRemoveTurn={(index) => void interview.removeTurn(index)}
            text={{
              title: m.roomTranscriptTitle,
              onlyYou: m.roomTranscriptNote,
              empty: m.roomTranscriptEmpty,
              remove: m.roomRemoveAnswer,
              legendMarked: m.roomLegendMarked,
              legendRest: m.roomLegendRest,
            }}
          />
        }
        stage={
          <>
            <h1 className="we-sr-only">{m.roomHeading}</h1>
            <AiDisclosure tag={m.roomAiTag}>{m.roomAi}</AiDisclosure>
            <InterviewerMascot state={mascotState} level={voice.inputLevel} badgeLabel={badge} finished={interview.ended} />
            <InterviewerLine label={m.roomInterviewer} text={interview.interviewerLine} />
            {slow ? (
              <p className="we-iv-slow" role="status">
                {e.modelSlow}
              </p>
            ) : null}
            {listening || transcribing || typedLive ? (
              <WordsBox mode="live" label={m.roomWordsLive} text={listening || transcribing ? voice.partial || "…" : draft} />
            ) : lastAnswer ? (
              <WordsBox
                mode="said"
                label={fmt(m.roomWordsSaid, { n: answers.length })}
                hint={m.roomWordsHint}
                answerNumber={answers.length}
                sentences={lastAnswer.sentences}
                cited={lastAnswer.index >= 0 ? (cited.get(lastAnswer.index) ?? []) : []}
                sweep
              />
            ) : (
              <WordsBox mode="empty" emptyText={m.roomWordsEmpty} />
            )}
            {voiceProblem ? (
              <p className="we-inline-error we-iv-alert" role="alert">
                {voiceProblem}
              </p>
            ) : null}
            {interview.actionFailed ? (
              <p className="we-inline-error we-iv-alert" role="alert" data-testid="apply-action-failed">
                {m.roomActionFailed}
              </p>
            ) : null}
            {voiceOn ? (
              <>
                <span className="we-sr-only" aria-hidden="true" data-testid="voice-status">
                  {voice.status}
                </span>
                <span className="we-sr-only" aria-hidden="true" data-testid="voice-final">
                  {voice.finalTranscript}
                </span>
              </>
            ) : null}
            {interview.ended ? (
              // The interviewer's closing line above already says what comes next: the button is enough.
              <div className="we-ap-to-review" data-testid="apply-ended">
                <Button variant="primary" size="lg" data-testid="apply-to-review" onClick={() => router.refresh()}>
                  {m.roomToReview}
                </Button>
              </div>
            ) : (
              <InterviewControls
                typing={typing}
                talk={
                  talkShown ? (
                    <HoldToTalk
                      state={talkState}
                      level={voice.inputLevel}
                      label={talkState === "listening" ? c.release : c.hold}
                      describedBy="ap-noisy-hint"
                      onStart={() => void voice.pressTalk()}
                      onRelease={() =>
                        void voice.releaseTalk().then((transcript) => {
                          if (transcript.trim()) void sendAnswer(transcript, "voice");
                        })
                      }
                    />
                  ) : undefined
                }
                orLabel={m.roomOr}
                typeBox={
                  <TypeAnswer
                    value={draft}
                    onChange={setDraft}
                    onSend={submit}
                    sending={interview.sending}
                    placeholder={c.textPlaceholder}
                    sendLabel={c.send}
                    sendingLabel={m.roomSending}
                    error={interview.sendFailed ? m.roomSendFailed : undefined}
                    retryLabel={e.retry}
                    onRetry={() => void interview.retry()}
                  />
                }
                typeButton={talkShown ? <TypeInsteadButton label={c.switchText} pressed={typing} onClick={() => setTyping((v) => !v)} /> : undefined}
                hints={
                  <>
                    {talkShown ? <span id="ap-noisy-hint">{c.hintNoisy}</span> : <span />}
                    <button type="button" data-testid="apply-skip" disabled={waiting || interview.sending} onClick={() => void interview.skip()}>
                      {m.roomSkip}
                    </button>
                  </>
                }
              />
            )}
          </>
        }
        notes={
          <section className="we-box we-ap-ad" aria-labelledby="ap-ad-title">
            <h3 id="ap-ad-title">{m.roomAdTitle}</h3>
            <p>{m.roomAdHelp}</p>
            <ol className="we-ap-reqs">
              {initial.plan.requirements.map((r, i) => {
                const progress = interview.progress[r.requirementId] ?? "waiting";
                const isNow = !interview.ended && i === interview.cursor;
                return (
                  <li
                    key={r.requirementId}
                    className="we-ap-req"
                    data-testid="apply-requirement"
                    data-requirement-id={r.requirementId}
                    data-progress={progress}
                    aria-current={isNow ? "step" : undefined}
                    data-now={isNow ? "true" : undefined}
                  >
                    <span className="we-ap-req-text">{r.text}</span>
                    <span className="we-ap-req-meta">
                      <Tag>{r.kind === "must" ? m.tagMust : m.tagNice}</Tag>
                      <span className="we-ap-req-state">{m[STATE_KEYS[progress]]}</span>
                      {isNow ? <span className="we-ap-req-now">{m.roomNow}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        }
      />
    </div>
  );
}
