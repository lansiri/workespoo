"use client";

/**
 * The assembled interview room, built only from kit components, so screen builders can copy the composition.
 * Hold the talk button (or press Space on it), release, and watch: the person's words are marked, each note
 * flies from its marked sentence round the interviewer into the notes list, and the jobs count rises.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AiDisclosure, Button, Dialog, HoldToTalk, InterviewControls, InterviewLayout, InterviewProgress, InterviewerLine, InterviewerMascot, JobsLit, JobsMini,
  NotesList, PageShell, Transcript, TypeAnswer, TypeInsteadButton, WordsBox, flyNote, type MascotState, type NoteItem, type TranscriptTurn,
} from "@/components/we";
import { answers, jobTiles, jobsText, noteSamples, questions } from "./samples";

const JOBS = [0, 12, 31, 31, 44, 52];
const TILES_AT = [0, 2, 4, 4, 5, 5];
const badge: Record<MascotState, string> = { idle: "Your turn", listening: "Listening…", thinking: "Writing a question…", speaking: "Speaking" };
const shell = {
  logoLabel: "WorkEspoo", wordmark: "WorkEspoo", navLabel: "Main", languageLabel: "Language", menuLabel: "Menu",
  languages: [
    { code: "en" as const, label: "English", href: "#", current: true },
    { code: "fi" as const, label: "Suomi", href: "#", current: false },
    { code: "sv" as const, label: "Svenska", href: "#", current: false },
  ],
};

export function InterviewDemo({ presenter }: { presenter?: boolean }) {
  const [step, setStep] = useState(0); // answers given
  const [state, setState] = useState<MascotState>("speaking");
  const [spoken, setSpoken] = useState(3);
  const [liveWords, setLiveWords] = useState(0);
  const [level, setLevel] = useState(0.3);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [catchKey, setCatchKey] = useState(0);
  const [typed, setTyped] = useState("");
  const [typing, setTyping] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [sweep, setSweep] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const chipEls = useRef<Record<string, HTMLElement | null>>({});
  const timers = useRef<number[]>([]);
  const finished = step >= answers.length;
  const q = questions[Math.min(step, questions.length - 1)];
  const qWords = q.split(" ").length;

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((id) => window.clearTimeout(id));
  }, []);

  // opening line is spoken word by word, then it is the person's turn
  useEffect(() => {
    if (state !== "speaking") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      const id = window.setTimeout(() => {
        setSpoken(qWords);
        setState("idle");
      }, 600);
      return () => window.clearTimeout(id);
    }
    const id = window.setInterval(() => {
      setSpoken((n) => {
        if (n >= qWords) {
          window.clearInterval(id);
          window.setTimeout(() => setState("idle"), 500);
          return n;
        }
        return n + 1;
      });
    }, 230);
    return () => window.clearInterval(id);
  }, [state, qWords, step]);

  // microphone level and live caption while listening
  useEffect(() => {
    if (state !== "listening") return;
    const id = window.setInterval(() => {
      const t = performance.now() / 1000;
      setLevel(Math.max(0, Math.min(1, 0.45 + 0.28 * Math.sin(t * 5.1) + 0.18 * Math.sin(t * 11.7 + 1))));
      setLiveWords((n) => n + 1);
    }, 140);
    return () => window.clearInterval(id);
  }, [state]);

  const current = answers[Math.min(step, answers.length - 1)];
  const liveText = current.sentences.join(" ").split(" ").slice(0, liveWords).join(" ");

  function start() {
    if (finished) return;
    setLiveWords(0);
    setSweep(false);
    setState("listening");
  }

  function send() {
    if (finished) return;
    const n = step;
    const a = answers[n];
    setStep(n + 1);
    setTyped("");
    setState("thinking");
    setSweep(true);
    const arriving = a.notes.map((id) => noteSamples.find((s) => s.id === id)).filter((x): x is NoteItem => Boolean(x));
    setNotes((prev) => [...prev.map((x) => ({ ...x, fresh: false })), ...arriving.map((x) => ({ ...x, refLabel: `answer ${n + 1}`, fresh: true, pending: true }))]);
    later(() => {
      const marks = Array.from(stageRef.current?.querySelectorAll(".we-words .we-mk") ?? []);
      const flights = arriving.map((note, i) => flyNote(marks[Math.min(i, marks.length - 1)] ?? null, chipEls.current[note.id] ?? null, 450 + i * 450, { onCatch: () => setCatchKey((k) => k + 1) }).then(() => setNotes((prev) => prev.map((x) => (x.id === note.id ? { ...x, pending: false } : x)))));
      if (flights.length === 0) setNotes((prev) => prev.map((x) => ({ ...x, pending: false })));
    }, 120);
    later(() => {
      if (n + 1 < answers.length) {
        setSpoken(0);
        setState("speaking");
      } else setState("idle");
    }, 2800);
  }

  const turns: TranscriptTurn[] = [];
  const cited: Record<number, number[]> = {};
  for (let i = 0; i <= Math.min(step, questions.length - 1); i++) {
    turns.push({ speaker: "ai", sentences: [questions[i]], label: "Interviewer · AI" });
    if (i < step) {
      cited[turns.length] = answers[i].cited;
      turns.push({ speaker: "person", sentences: answers[i].sentences, label: `You · answer ${i + 1}` });
    }
  }
  const lastAnswer = step > 0 ? answers[step - 1] : null;
  const jobsStep = Math.min(step, JOBS.length - 1);
  const tiles = jobTiles.slice(0, TILES_AT[jobsStep]).reverse();
  const delta = jobsStep > 0 && JOBS[jobsStep] > JOBS[jobsStep - 1] ? JOBS[jobsStep] - JOBS[jobsStep - 1] : undefined;
  const mascotState: MascotState = finished && state === "idle" ? "idle" : state;
  const talkState = finished && state === "idle" ? "done" : state === "listening" ? "listening" : state === "thinking" || state === "speaking" ? "disabled" : "ready";
  const talkLabel = talkState === "done" ? "Check my notes" : talkState === "listening" ? "Release to send" : "Hold to talk";

  return (
    <div className="we-frame" ref={stageRef}>
      <PageShell
        audience="talent"
        {...shell}
        headerSlot={<InterviewProgress label={finished ? "Interview finished" : `Question ${step + 1} of 5`} step={step} finished={finished} />}
        actions={
          <Button icon="stop" onClick={() => setStopOpen(true)} data-testid="stop-interview">
            Stop
          </Button>
        }
      >
        <InterviewLayout
          presenter={presenter}
          height="860px"
          stageLabel="Interviewer"
          convo={
            <Transcript
              turns={turns}
              cited={cited}
              onRemoveTurn={() => {}}
              text={{ title: "Conversation", onlyYou: "Only you see your own words.", empty: "Nothing yet. When you answer, your words appear here.", remove: "Remove this answer", legendMarked: "Marked words", legendRest: "became notes." }}
            />
          }
          stage={
            <>
              <AiDisclosure tag="AI">You&apos;re talking with an AI. It takes notes; you review and approve them at the end.</AiDisclosure>
              <InterviewerMascot state={mascotState} level={level} badgeLabel={finished && state === "idle" ? "Interview finished" : badge[mascotState]} finished={finished && state === "idle"} catchKey={catchKey} />
              <InterviewerLine label="Interviewer · AI" text={finished ? "Thank you. That is all I needed. Let's look at your notes." : q} spokenWords={state === "speaking" ? spoken : undefined} />
              {state === "listening" ? (
                <WordsBox mode="live" label="You, live" text={liveText || "…"} />
              ) : lastAnswer ? (
                <WordsBox mode="said" label={`You said · answer ${step}`} hint="marked words became notes" answerNumber={step} sentences={lastAnswer.sentences} cited={lastAnswer.cited} sweep={sweep} />
              ) : (
                <WordsBox mode="empty" emptyText="Your words will show here as you speak. The sentences that become notes get marked." />
              )}
              <InterviewControls
                done={talkState === "done"}
                typing={typing}
                jobsMini={<JobsMini count={JOBS[jobsStep] || undefined} delta={delta} deltaLabel={delta ? `+${delta} new` : undefined} text={jobsText} />}
                talk={<HoldToTalk state={talkState} label={talkLabel} level={level} onStart={start} onRelease={send} doneHref="#card" describedBy="we-noisy-hint" />}
                orLabel="or"
                typeBox={<TypeAnswer value={typed} onChange={setTyped} onSend={send} placeholder="Write your answer" sendLabel="Send" sendingLabel="Sending…" />}
                typeButton={<TypeInsteadButton label="Type instead" pressed={typing} onClick={() => setTyping((v) => !v)} />}
                hints={
                  <>
                    <span id="we-noisy-hint">In a noisy place, hold the button only while you speak.</span>
                    <button type="button" data-testid="skip-question" onClick={() => {}}>
                      Skip question
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
                text={{ title: "Notes so far", help: "You'll check and edit these at the end.", empty: "Skills you mention appear here, in your own words. Nothing is scored: they are notes, and you decide what stays.", newLabel: "NEW", noted: "Noted: {phrase}" }}
                chipRef={(id, el) => {
                  chipEls.current[id] = el;
                }}
              />
              <JobsLit count={JOBS[jobsStep] || undefined} delta={delta} deltaLabel={delta ? `+${delta} new` : undefined} tiles={tiles} text={jobsText} />
            </>
          }
        />
      </PageShell>
      {stopOpen ? (
        <Dialog
          title="Stop the interview?"
          onClose={() => setStopOpen(false)}
          actions={
            <>
              <Button onClick={() => setStopOpen(false)}>Keep talking</Button>
              <Button variant="primary" onClick={() => setStopOpen(false)}>
                Stop and review my notes
              </Button>
            </>
          }
        >
          <p>You can still review the notes made so far.</p>
        </Dialog>
      ) : null}
    </div>
  );
}
