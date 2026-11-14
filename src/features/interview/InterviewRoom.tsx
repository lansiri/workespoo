"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AiDisclosure,
  HoldToTalk,
  InterviewControls,
  InterviewLayout,
  InterviewerLine,
  InterviewerMascot,
  JobsLit,
  JobsMini,
  NotesList,
  Transcript,
  TypeAnswer,
  TypeInsteadButton,
  WordsBox,
  flyNote,
  type JobsLitText,
  type MascotState,
  type NoteItem,
  type TranscriptTurn,
} from "@/components/we";
import { fmt } from "@/lib/i18n";
import { useMessages, useUiLang } from "@/lib/i18n/client";
import { errorCopy, interviewCopy } from "@/lib/i18n/content";
import { splitSentences } from "@/lib/sentences";
import { useVoice } from "@/features/voice/useVoice";
import type { InterviewMode, SignalPublic } from "@/contracts";
import { preCheck } from "./commands";
import { detectLang, isUiLang } from "./lang";
import { interviewMessages } from "./messages";
import { useRoomChromePublisher } from "./RoomChrome";
import { useInterview, type InterviewInitial } from "./useInterview";
import type { TranscriptLine } from "./views";

/** After this long without a reply the line "This is taking longer than usual" appears. */
export const SLOW_REPLY_MS = 6000;

/**
 * The sentences of each of the person's answers that became notes, by turn index. Notes carry
 * their evidence as references (turn index, sentence numbers from 1); code turns them into the
 * 0-based sentence positions the marks use. No text from the model is involved.
 */
export function citedSentences(signals: readonly Pick<SignalPublic, "evidence">[]): Map<number, number[]> {
  const byTurn = new Map<number, Set<number>>();
  for (const s of signals) {
    for (const ref of s.evidence) {
      const set = byTurn.get(ref.turnIndex) ?? new Set<number>();
      for (let n = ref.sentenceFrom; n <= ref.sentenceTo; n++) set.add(n - 1);
      byTurn.set(ref.turnIndex, set);
    }
  }
  return new Map([...byTurn].map(([turn, set]) => [turn, [...set].sort((a, b) => a - b)]));
}

/** Which of the room's four looks the interviewer has. It shows what the AI is doing, never a feeling. */
export function mascotStateOf(p: { ended: boolean; listening: boolean; speaking: boolean; waiting: boolean }): MascotState {
  if (p.ended) return "idle";
  if (p.listening) return "listening";
  if (p.speaking) return "speaking";
  if (p.waiting) return "thinking";
  return "idle";
}

/**
 * The live interview. Everything stateful lives in `useInterview` (and the voice hook); this file
 * composes the kit's pieces: the transcript, the interviewer with the person's own words under
 * it, the notes and the jobs. Voice is used only when the person ticked the voice consent box.
 */
export function InterviewRoom(props: {
  initial: InterviewInitial;
  mode: InterviewMode;
  voiceConsented: boolean;
  /** The person agreed to the own-server voice wording: their speech goes to our server or nowhere. */
  voiceOwnServer?: boolean;
}) {
  const { initial, voiceConsented } = props;
  const m = useMessages(interviewMessages);
  const c = useMessages(interviewCopy);
  const e = useMessages(errorCopy);
  const uiLang = useUiLang();
  const voice = useVoice({ lang: uiLang, only: props.voiceOwnServer ? "server" : undefined });
  const voiceOn = voiceConsented && voice.status !== "unavailable";
  // Once the microphone has been refused, the rest of the session stays in text mode.
  const [micBlocked, setMicBlocked] = useState(false);
  if (voice.error?.code === "mic-denied" && !micBlocked) setMicBlocked(true);
  const talkShown = voiceOn && !micBlocked;

  /* A phone plays the interviewer's voice only after one touch or key press has unlocked it. With
     our own recogniser, preparing asks for nothing (the microphone is opened by the talk button,
     never here), so it is done at the first touch anywhere in the room: a person who types their
     first answer still hears the reply to it. */
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
  const [failedAction, setFailedAction] = useState<"send" | "other">("send");

  const interview = useInterview({
    initial,
    onSentence: (sentence) => {
      if (!voiceOn) return;
      const detected = detectLang(sentence);
      // Each sentence joins the end of the reply being spoken, so the whole reply is heard.
      void voice.speakSentences([sentence], isUiLang(detected) ? detected : uiLang, { append: true });
    },
  });
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [catchKey, setCatchKey] = useState(0);
  const [highlight, setHighlight] = useState<{ turnIndex: number; sentences: number[] } | null>(null);
  const lastText = useRef<{ text: string; mode: "text" | "voice" } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const chipEls = useRef<Record<string, HTMLElement | null>>({});

  const canAnswer = !interview.ended;
  const waiting = interview.sending && interview.streaming === null;
  const speaking = voiceOn && voice.status === "speaking";
  const listening = voiceOn && voice.status === "listening";
  const transcribing = voiceOn && voice.status === "transcribing";
  // While the talk button is held (and until the recogniser is done), the input field shows the words heard.
  const hearing = listening || transcribing;

  /* what the top bar shows, and what its Stop button does */
  const asked = interview.transcript.filter((l) => l.role === "interviewer" && l.index >= 0).length;
  const publish = useRoomChromePublisher();
  const { stop: stopInterview } = interview;
  const cancelSpeech = voice.cancelSpeech;
  const stop = useCallback(() => {
    cancelSpeech();
    setFailedAction("other");
    void stopInterview();
  }, [cancelSpeech, stopInterview]);
  useEffect(() => {
    publish({ asked, finished: interview.ended, stoppable: canAnswer, stop });
  }, [publish, asked, interview.ended, canAnswer, stop]);

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

  /* A new answer silences the interviewer at once; the reply's sentences then queue up in full. */
  async function sendAnswer(text: string, inputMode: "text" | "voice") {
    lastText.current = { text, mode: inputMode };
    setFailedAction("send");
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

  /* The person's answers, their sentences and which of them became notes */
  const lines = interview.transcript;
  const answers = lines.filter((l): l is TranscriptLine => l.role === "participant");
  const cited = citedSentences(interview.signals);
  const answerNumber = (turnIndex: number) => answers.findIndex((l) => l.index === turnIndex) + 1;
  const lastAnswer = answers.at(-1) ?? null;

  const turns: TranscriptTurn[] = lines.map((l) => ({
    speaker: l.role === "interviewer" ? "ai" : "person",
    sentences: splitSentences(l.text),
    label: l.role === "interviewer" ? m.interviewerAi : fmt(m.turnYou, { n: answers.indexOf(l) + 1 }),
    index: l.index,
    removable: canAnswer && l.index > 0 && preCheck(l.text) !== "delete",
  }));
  const citedByPosition: Record<number, number[]> = {};
  lines.forEach((l, pos) => {
    const marks = l.role === "participant" ? cited.get(l.index) : undefined;
    if (marks) citedByPosition[pos] = marks;
  });
  const highlightPosition = highlight ? lines.findIndex((l) => l.role === "participant" && l.index === highlight.turnIndex) : -1;

  /* Notes: where they came from, which are from the latest answer, and their arrival */
  const freshTurn = lastAnswer && lastAnswer.index >= 0 ? lastAnswer.index : null;
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set(initial.signals.map((s) => s.id)));
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const arrived = interview.signals.filter((s) => !seenIds.has(s.id)).map((s) => s.id);
  if (arrived.length > 0) {
    setSeenIds(new Set([...seenIds, ...arrived]));
    setPendingIds((p) => [...p, ...arrived]);
  }
  const launched = useRef(new Set<string>());
  useEffect(() => {
    const todo = pendingIds.filter((id) => !launched.current.has(id));
    todo.forEach((id, i) => {
      launched.current.add(id);
      const ref = interview.signals.find((s) => s.id === id)?.evidence[0];
      const mark = ref ? stageRef.current?.querySelector(`.we-words .we-mk[data-sentence="${ref.sentenceFrom - 1}"]`) : null;
      void flyNote(mark ?? null, chipEls.current[id] ?? null, 150 + i * 450, { onCatch: () => setCatchKey((k) => k + 1) }).then(() =>
        setPendingIds((p) => p.filter((x) => x !== id)),
      );
    });
  }, [pendingIds, interview.signals]);

  const notes: NoteItem[] = interview.signals.map((s) => {
    const from = s.evidence[0]?.turnIndex;
    const n = from === undefined ? 0 : answerNumber(from);
    return {
      id: s.id,
      label: s.phrase,
      group: s.kind,
      refLabel: n > 0 ? fmt(m.noteRef, { n }) : undefined,
      fresh: freshTurn !== null && s.evidence.some((r) => r.turnIndex === freshTurn),
      pending: pendingIds.includes(s.id),
    };
  });

  /* Jobs: the count, and the neutral "+N new" for the last rise */
  const jobCount = interview.jobsLit.count;
  const [jobsSeen, setJobsSeen] = useState<{ count: number; delta?: number }>({ count: jobCount });
  if (jobsSeen.count !== jobCount) setJobsSeen({ count: jobCount, delta: jobCount > jobsSeen.count ? jobCount - jobsSeen.count : undefined });
  const delta = jobsSeen.delta;
  const deltaLabel = delta ? fmt(m.jobsDelta, { n: delta }) : undefined;
  const jobsText: JobsLitText = {
    sticker: m.jobsSticker,
    countLabel: m.jobsCountLabel,
    emptyLine: m.jobsEmptyLine,
    source: m.jobsSource,
    mentionsLabel: m.jobsMentions,
    more: m.jobsMore,
    error: "",
    mini: m.jobsMini,
    miniEmpty: m.jobsEmptyLine,
  };
  const tiles = interview.jobsLit.sample.map((j) => ({ id: j.id, title: j.title, employer: j.employerName, place: j.municipality, mentions: j.mention ?? undefined }));

  /* The interviewer */
  const mascotState = mascotStateOf({ ended: interview.ended, listening, speaking, waiting: waiting || (voiceOn && voice.status === "transcribing") });
  const badge = interview.ended
    ? m.badgeFinished
    : { idle: m.badgeIdle, listening: m.badgeListening, thinking: m.badgeThinking, speaking: m.badgeSpeaking }[mascotState];
  const talkState = interview.ended ? "done" : listening ? "listening" : mascotState === "thinking" ? "disabled" : "ready";

  const voiceProblem = interview.ended
    ? null
    : micBlocked
      ? e.micDenied
      : voice.error?.code === "unsupported"
        ? e.micUnsupported
        : voice.error && voice.status === "error"
          ? e.voiceFailed
          : null;

  const doneTalk = interview.cardReady ? (
    <HoldToTalk state="done" label={m.checkNotes} doneHref="/card" />
  ) : interview.cardProblem === "retry" ? (
    <p className="we-iv-done-note">
      {m.notesFailed} <Link href="/card">{m.checkNotes}</Link>
    </p>
  ) : interview.cardProblem === "none" ? (
    <p className="we-iv-done-note">{m.noNotes}</p>
  ) : (
    <p className="we-iv-done-note" role="status">
      {c.preparing} <Link href="/card">{m.checkNotes}</Link>
    </p>
  );

  return (
    <div ref={stageRef}>
      <InterviewLayout
        stageLabel={m.interviewer}
        convo={
          <Transcript
            turns={turns}
            cited={citedByPosition}
            highlightTurn={highlightPosition >= 0 ? highlightPosition : null}
            highlightSentences={highlight?.sentences ?? []}
            onRemoveTurn={(index) => {
              setFailedAction("other");
              void interview.removeTurn(index);
            }}
            text={{ title: m.transcriptTitle, onlyYou: m.transcriptOnlyYou, empty: m.transcriptEmpty, remove: c.removeAnswer, legendMarked: m.legendMarked, legendRest: m.legendRest }}
          />
        }
        stage={
          <>
            <h1 className="we-sr-only">{m.roomHeading}</h1>
            <AiDisclosure tag={m.aiTag}>{c.aiDisclosure}</AiDisclosure>
            <InterviewerMascot
              state={mascotState}
              level={voice.inputLevel}
              badgeLabel={badge}
              finished={interview.ended}
              catchKey={catchKey}
            />
            <InterviewerLine label={m.interviewerAi} text={interview.interviewerLine} />
            {slow ? (
              <p className="we-iv-slow" role="status">
                {e.modelSlow}
              </p>
            ) : null}
            {/* The middle shows an answer once it is sent; typing and speaking stay in the input field. */}
            {lastAnswer ? (
              <WordsBox
                key={answers.length}
                mode="said"
                label={fmt(m.wordsSaid, { n: answers.length })}
                hint={m.wordsHint}
                answerNumber={answers.length}
                sentences={splitSentences(lastAnswer.text)}
                cited={cited.get(lastAnswer.index) ?? []}
                highlight={highlight && highlight.turnIndex === lastAnswer.index ? highlight.sentences : undefined}
                sweep
              />
            ) : (
              <WordsBox mode="empty" emptyText={m.wordsEmpty} />
            )}
            {voiceProblem ? (
              <p className="we-inline-error we-iv-alert" role="alert">
                {voiceProblem}
              </p>
            ) : null}
            {interview.reconnecting ? (
              <p className="we-inline-error we-iv-alert" role="status">
                {e.network}
              </p>
            ) : null}
            {voiceOn ? (
              <>
                <span className="we-sr-only" aria-hidden="true" data-testid="voice-status">
                  {voice.status}
                </span>
                <span className="we-sr-only" aria-hidden="true" data-testid="voice-partial">
                  {voice.partial}
                </span>
                <span className="we-sr-only" aria-hidden="true" data-testid="voice-final">
                  {voice.finalTranscript}
                </span>
              </>
            ) : null}
            <InterviewControls
              done={interview.ended}
              typing={typing || hearing}
              jobsMini={<JobsMini count={jobCount || undefined} delta={delta} deltaLabel={deltaLabel} text={jobsText} locale={uiLang} />}
              talk={
                interview.ended ? (
                  doneTalk
                ) : talkShown ? (
                  <HoldToTalk
                    state={talkState}
                    level={voice.inputLevel}
                    label={talkState === "listening" ? c.release : c.hold}
                    describedBy="iv-noisy-hint"
                    onStart={() => void voice.pressTalk()}
                    onRelease={() =>
                      void voice.releaseTalk().then((transcript) => {
                        if (transcript.trim()) void sendAnswer(transcript, "voice");
                      })
                    }
                  />
                ) : undefined
              }
              orLabel={m.orLabel}
              typeBox={
                <TypeAnswer
                  value={hearing ? voice.partial : draft}
                  onChange={setDraft}
                  onSend={submit}
                  sending={interview.sending}
                  listening={hearing}
                  listeningPlaceholder={m.badgeListening}
                  placeholder={c.textPlaceholder}
                  sendLabel={c.send}
                  sendingLabel={m.sending}
                  error={interview.sendFailed ? (failedAction === "send" ? m.sendFailed : e.save) : undefined}
                  retryLabel={failedAction === "send" ? e.retry : undefined}
                  onRetry={
                    failedAction === "send"
                      ? () => {
                          const last = lastText.current;
                          if (last) void sendAnswer(last.text, last.mode);
                        }
                      : undefined
                  }
                />
              }
              typeButton={talkShown ? <TypeInsteadButton label={c.switchText} pressed={typing} onClick={() => setTyping((v) => !v)} /> : undefined}
              hints={
                <>
                  {talkShown ? <span id="iv-noisy-hint">{c.hintNoisy}</span> : <span />}
                  <button type="button" data-testid="skip-question" disabled={waiting} onClick={() => void sendAnswer("skip", "text")}>
                    {c.skip}
                  </button>
                </>
              }
            />
          </>
        }
        notes={
          <>
            <NotesList
              notes={notes}
              text={{ title: c.notesTitle, help: c.notesHelp, empty: m.notesEmpty, newLabel: m.notesNew, noted: m.notesNoted }}
              chipRef={(id, el) => {
                chipEls.current[id] = el;
              }}
              onHover={(note, on) => {
                const ref = interview.signals.find((s) => s.id === note.id)?.evidence[0];
                setHighlight(on && ref ? { turnIndex: ref.turnIndex, sentences: range(ref.sentenceFrom - 1, ref.sentenceTo - 1) } : null);
              }}
            />
            <JobsLit count={jobCount || undefined} delta={delta} deltaLabel={deltaLabel} tiles={tiles} text={jobsText} locale={uiLang} />
          </>
        }
      />
    </div>
  );
}

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
}
