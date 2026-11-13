"use client";

import { useState } from "react";
import { PushToTalkButton } from "@/features/voice/PushToTalkButton";
import { useVoice, type SpeakingEngine } from "@/features/voice/useVoice";
import type { AdapterOverride } from "@/features/voice/select";

import type { VoiceDevMessages } from "@/features/voice/messages";

export default function VoiceDevClient({ m }: { m: VoiceDevMessages }) {
  const ENGINE_LABEL: Record<SpeakingEngine, string> = {
    elevenlabs: m.engineElevenlabs,
    server: m.engineServer,
    browser: m.engineBrowser,
  };
  const [lang, setLang] = useState("en");
  const voice = useVoice({ lang });
  const [text, setText] = useState("Hello. This is a voice test. How does it sound?");
  const [lastFinal, setLastFinal] = useState("");

  const fmt = (ms: number | null) => (ms === null ? "-" : `${Math.round(ms)} ms`);

  return (
    <main style={{ padding: 16, maxWidth: 640, fontFamily: "sans-serif" }}>
      <h1>{m.heading}</h1>
      <h2>{m.config}</h2>
      <pre data-testid="voice-config">
        {JSON.stringify(
          { config: voice.config, configError: voice.configError, using: voice.adapterId },
          null,
          2,
        )}
      </pre>
      <label>
        {m.forceAdapter}:{" "}
        <select
          value={voice.override}
          onChange={(e) => voice.setOverride(e.target.value as AdapterOverride)}
        >
          <option value="auto">{m.autoFromServer}</option>
          <option value="elevenlabs">elevenlabs</option>
          <option value="browser">browser</option>
        </select>
      </label>{" "}
      <label>
        {m.language}:{" "}
        <select value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="en">en</option>
          <option value="fi">fi</option>
          <option value="sv">sv</option>
        </select>
      </label>
      <p>
        {m.speaksWith}:{" "}
        <b data-testid="voice-engine">
          {voice.speakingEngine ? ENGINE_LABEL[voice.speakingEngine] : m.voiceOff}
        </b>
      </p>
      <h2>{m.talk}</h2>
      <p>
        {m.status}: <b data-testid="voice-status">{voice.status}</b>
      </p>
      <button type="button" onClick={() => void voice.prepare()}>
        {m.prepare}
      </button>
      <p>
        <PushToTalkButton
          status={voice.status}
          onPress={() => void voice.pressTalk()}
          onRelease={() => void voice.releaseTalk().then(setLastFinal)}
        />
      </p>
      <p>
        {m.inputLevel}: <meter min={0} max={1} value={voice.inputLevel} />
      </p>
      <p>
        {m.partial}: <i data-testid="voice-partial">{voice.partial}</i>
      </p>
      <p>
        {m.final}: <b data-testid="voice-final">{lastFinal}</b>
      </p>
      <h2>{m.speak}</h2>
      <textarea
        rows={3}
        style={{ width: "100%" }}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p>
        <button
          type="button"
          onClick={() => {
            // The same sentence splitter the interview will use is not needed here: one call, one clip per line.
            const lines = text.split(/(?<=[.!?])\s+/).filter(Boolean);
            void voice.prepare().then(() => voice.speakSentences(lines, lang));
          }}
        >
          {m.speakThis}
        </button>{" "}
        <button type="button" onClick={voice.cancelSpeech}>
          {m.cancelSpeech}
        </button>
      </p>
      <p>
        {m.outputLevel}: <meter min={0} max={1} value={voice.outputLevel} />
      </p>
      {voice.error && (
        <p role="alert">
          {m.error} ({voice.error.code}): {voice.error.message}{" "}
          <button type="button" onClick={voice.clearError}>
            {m.dismiss}
          </button>
        </p>
      )}
      <h2>{m.timings}</h2>
      <ul>
        <li>
          {m.releaseToFinal}: {fmt(voice.timings.releaseToFinalMs)}
        </li>
        <li>
          {m.requestToFirstSound}
          {voice.speakingEngine ? ` (${ENGINE_LABEL[voice.speakingEngine]})` : ""}:{" "}
          <b data-testid="voice-first-sound">{fmt(voice.timings.requestToFirstAudioMs)}</b>
        </li>
      </ul>
    </main>
  );
}
