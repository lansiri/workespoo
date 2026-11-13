"use client";

import { useState } from "react";
import { PushToTalkButton } from "@/features/voice/PushToTalkButton";
import { useVoice, type SpeakingEngine } from "@/features/voice/useVoice";
import type { AdapterOverride } from "@/features/voice/select";

const ENGINE_LABEL: Record<SpeakingEngine, string> = {
  elevenlabs: "ElevenLabs",
  server: "our server (Piper)",
  browser: "the browser (speechSynthesis)",
};

export default function VoiceDevPage() {
  const [lang, setLang] = useState("en");
  const voice = useVoice({ lang });
  const [text, setText] = useState("Hello. This is a voice test. How does it sound?");
  const [lastFinal, setLastFinal] = useState("");

  const fmt = (ms: number | null) => (ms === null ? "-" : `${Math.round(ms)} ms`);

  return (
    <main style={{ padding: 16, maxWidth: 640, fontFamily: "sans-serif" }}>
      <h1>Voice test</h1>
      <h2>Config</h2>
      <pre data-testid="voice-config">
        {JSON.stringify(
          { config: voice.config, configError: voice.configError, using: voice.adapterId },
          null,
          2,
        )}
      </pre>
      <label>
        Force adapter:{" "}
        <select
          value={voice.override}
          onChange={(e) => voice.setOverride(e.target.value as AdapterOverride)}
        >
          <option value="auto">auto (from server)</option>
          <option value="elevenlabs">elevenlabs</option>
          <option value="browser">browser</option>
        </select>
      </label>{" "}
      <label>
        Language:{" "}
        <select value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="en">en</option>
          <option value="fi">fi</option>
          <option value="sv">sv</option>
        </select>
      </label>
      <p>
        Speaks with:{" "}
        <b data-testid="voice-engine">
          {voice.speakingEngine ? ENGINE_LABEL[voice.speakingEngine] : "nothing (voice off)"}
        </b>
      </p>
      <h2>Talk</h2>
      <p>
        Status: <b data-testid="voice-status">{voice.status}</b>
      </p>
      <button type="button" onClick={() => void voice.prepare()}>
        Prepare (mic permission and audio unlock)
      </button>
      <p>
        <PushToTalkButton
          status={voice.status}
          onPress={() => void voice.pressTalk()}
          onRelease={() => void voice.releaseTalk().then(setLastFinal)}
        />
      </p>
      <p>
        Input level: <meter min={0} max={1} value={voice.inputLevel} />
      </p>
      <p>
        Partial: <i data-testid="voice-partial">{voice.partial}</i>
      </p>
      <p>
        Final: <b data-testid="voice-final">{lastFinal}</b>
      </p>
      <h2>Speak</h2>
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
          Speak this
        </button>{" "}
        <button type="button" onClick={voice.cancelSpeech}>
          Cancel speech
        </button>
      </p>
      <p>
        Output level: <meter min={0} max={1} value={voice.outputLevel} />
      </p>
      {voice.error && (
        <p role="alert">
          Error ({voice.error.code}): {voice.error.message}{" "}
          <button type="button" onClick={voice.clearError}>
            Dismiss
          </button>
        </p>
      )}
      <h2>Timings</h2>
      <ul>
        <li>Release to final transcript: {fmt(voice.timings.releaseToFinalMs)}</li>
        <li>
          Request to first sound
          {voice.speakingEngine ? ` (${ENGINE_LABEL[voice.speakingEngine]})` : ""}:{" "}
          <b data-testid="voice-first-sound">{fmt(voice.timings.requestToFirstAudioMs)}</b>
        </li>
      </ul>
    </main>
  );
}
