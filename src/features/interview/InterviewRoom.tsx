"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fmt } from "@/lib/i18n";
import { useMessages, useUiLang } from "@/lib/i18n/client";
import { interviewCopy } from "@/lib/i18n/content";
import { PushToTalkButton } from "@/features/voice/PushToTalkButton";
import { useVoice } from "@/features/voice/useVoice";
import type { InterviewMode } from "@/contracts";
import { preCheck } from "./commands";
import { detectLang, isUiLang } from "./lang";
import { interviewMessages } from "./messages";
import { useInterview, type InterviewInitial } from "./useInterview";

/**
 * The live interview page, unstyled. Everything stateful lives in `useInterview`; this file
 * only lays the pieces out. Voice is used only when the person ticked the voice consent box.
 */
export function InterviewRoom(props: { initial: InterviewInitial; mode: InterviewMode; voiceConsented: boolean }) {
  const { initial, mode, voiceConsented } = props;
  const m = useMessages(interviewMessages);
  const c = useMessages(interviewCopy);
  const uiLang = useUiLang();
  const voice = useVoice({ lang: uiLang });
  const voiceOn = voiceConsented && voice.status !== "unavailable";

  const interview = useInterview({
    initial,
    onSentence: (sentence) => {
      if (!voiceOn) return;
      const detected = detectLang(sentence);
      void voice.speakSentences([sentence], isUiLang(detected) ? detected : uiLang);
    },
  });
  const [draft, setDraft] = useState("");

  const asked = interview.transcript.filter((l) => l.role === "interviewer" && l.index >= 0).length;
  const total = mode === "express" ? m.progressTotalExpress : m.progressTotalFull;
  const areas = Object.values(interview.coverage);
  const touched = areas.filter((s) => s !== "open").length;
  const canAnswer = !interview.ended;

  function submit() {
    const text = draft.trim();
    if (!text || !canAnswer) return;
    setDraft("");
    void interview.send(text, "text");
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{m.roomHeading}</h1>
      <p className="text-sm">{c.aiDisclosure}</p>

      <section aria-live="polite" className="space-y-1">
        <h2 className="text-sm font-medium">{m.interviewerSays}</h2>
        <p data-testid="interviewer-text" className="text-lg">
          {interview.interviewerLine}
          {interview.sending && interview.streaming === null ? ` ${c.thinking}` : ""}
        </p>
      </section>

      {canAnswer ? (
        <section className="space-y-2">
          <label htmlFor="answer" className="text-sm font-medium">
            {m.answerLabel}
          </label>
          <Textarea
            id="answer"
            data-testid="answer-input"
            value={draft}
            placeholder={c.textPlaceholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" data-testid="send-answer" disabled={draft.trim() === ""} onClick={submit}>
              {c.send}
            </Button>
            {voiceOn ? (
              <PushToTalkButton
                status={voice.status}
                onPress={() => void voice.pressTalk()}
                onRelease={() =>
                  void voice.releaseTalk().then((transcript) => {
                    if (transcript.trim()) void interview.send(transcript, "voice");
                  })
                }
              />
            ) : null}
            <Button type="button" variant="outline" data-testid="skip-question" onClick={() => void interview.send("skip", "text")}>
              {c.skip}
            </Button>
            <Button
              type="button"
              variant="outline"
              data-testid="stop-interview"
              onClick={() => {
                if (window.confirm(c.stopConfirm)) void interview.stop();
              }}
            >
              {c.stop}
            </Button>
          </div>
          {voiceOn && voice.partial ? <p className="text-sm">{voice.partial}</p> : null}
          {interview.sendFailed ? (
            <p role="alert" data-testid="send-failed">
              {m.sendFailed}
            </p>
          ) : null}
        </section>
      ) : null}

      {interview.reconnecting ? <p role="status">{m.connectionLost}</p> : null}

      {interview.ended ? (
        <section data-testid="interview-done" className="space-y-2">
          <p className="font-medium">{m.doneTitle}</p>
          {interview.cardReady ? (
            <Link href="/card" data-testid="go-to-card">
              {m.goToCard}
            </Link>
          ) : interview.cardProblem === "retry" ? (
            <p>
              {m.notesFailed} <Link href="/card">{m.goToCard}</Link>
            </p>
          ) : interview.cardProblem === "none" ? (
            <p>{m.noNotes}</p>
          ) : (
            <p role="status">{c.preparing}</p>
          )}
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-medium">{c.notesTitle}</h2>
        <p className="text-sm">{c.notesHelp}</p>
        {interview.signals.length === 0 ? (
          <p className="text-sm">{m.noSignalsYet}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {interview.signals.map((s) => (
              <li key={s.id} data-testid="signal-chip" data-signal-id={s.id} className="rounded-full border px-3 py-1 text-sm">
                {s.phrase}
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm" data-testid="jobs-lit-count">
          {fmt(c.jobsLit, { count: interview.jobsLit.count })}
        </p>
        <p className="text-sm" data-testid="coverage-hint">
          {fmt(c.progress, { n: Math.min(asked, 99), total })} · {fmt(m.coverageHint, { done: touched, total: areas.length || 7 })}
        </p>
        <progress value={touched} max={areas.length || 7} aria-hidden="true" />
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">{m.transcriptTitle}</h2>
        <ol data-testid="transcript" className="space-y-2">
          {interview.transcript.map((line, i) => (
            <li key={`${line.role}-${line.index}-${i}`} data-role={line.role}>
              <strong>{line.role === "interviewer" ? m.interviewer : m.you}:</strong> {line.text}
              {line.role === "participant" && line.index > 0 && canAnswer && preCheck(line.text) !== "delete" ? (
                <>
                  {" "}
                  <button
                    type="button"
                    data-testid="turn-remove"
                    data-turn-index={line.index}
                    className="text-sm underline"
                    onClick={() => void interview.removeTurn(line.index)}
                  >
                    {c.removeAnswer}
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
