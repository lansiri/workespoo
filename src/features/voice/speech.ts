import { VoiceError } from "./errors";
import { PlaybackQueue } from "./playback";

export type SpeechEngine = "browser" | "server";

export interface SpeechOutputOptions {
  /** Milliseconds from speak() to the first sound, once per call. */
  onFirstAudio?: (ms: number) => void;
  /**
   * Who speaks, read at each sentence: the browser's speechSynthesis, or our server through
   * `/api/voice/tts` and the playback queue. Default browser.
   */
  speech?: () => SpeechEngine;
  /** Told which engine spoke each sentence, for the test page. */
  onSpeechEngine?: (engine: SpeechEngine) => void;
  /** Injected in tests. Created on first use otherwise. */
  playback?: PlaybackQueue;
}

export interface SpeechOutput {
  /** Call synchronously inside a gesture. Starts unlocking audio output; the promise may be awaited. */
  unlock(): Promise<void> | null;
  speak(text: string, options: { lang: string }): Promise<void>;
  cancel(): void;
  getOutputLevel(): number | null;
  dispose(): void;
}

const synth = (): SpeechSynthesis | null =>
  typeof speechSynthesis === "undefined" ? null : speechSynthesis;

/**
 * The speaking side shared by the adapters that listen themselves: our server (Piper) through
 * the playback queue, or the browser's speechSynthesis. When the server answers 503 the output
 * moves to speechSynthesis for the rest of the page's life.
 */
export function createSpeechOutput(options: SpeechOutputOptions = {}): SpeechOutput {
  let playback: PlaybackQueue | null = options.playback ?? null;
  let serverDown = false;
  let speaking = 0;

  const getPlayback = (): PlaybackQueue => {
    // Two fetches at a time: the server speaks one sentence at a time and turns away a third.
    playback ??= new PlaybackQueue({ onFirstAudio: options.onFirstAudio, maxConcurrentFetches: 2 });
    return playback;
  };
  const serverSpeech = () => !serverDown && options.speech?.() === "server";

  function speakWithSynth(text: string, lang: string): Promise<void> {
    const s = synth();
    if (!s) return Promise.reject(new VoiceError("unsupported", "No speech synthesis"));
    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      const voice = s
        .getVoices()
        .find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
      if (voice) utterance.voice = voice;
      const requestedAt = performance.now();
      let first = speaking === 0;
      speaking += 1;
      utterance.onstart = () => {
        if (first) {
          first = false;
          options.onFirstAudio?.(performance.now() - requestedAt);
        }
      };
      utterance.onend = () => {
        speaking = Math.max(0, speaking - 1);
        resolve();
      };
      utterance.onerror = (e) => {
        speaking = Math.max(0, speaking - 1);
        // Cancelling is not a failure.
        if (e.error === "canceled" || e.error === "interrupted") resolve();
        else reject(new VoiceError("failed", `Speech synthesis error: ${e.error}`));
      };
      options.onSpeechEngine?.("browser");
      s.speak(utterance);
    });
  }

  const output: SpeechOutput = {
    unlock() {
      // Starts synchronously, inside the gesture.
      const unlocked = serverSpeech() ? getPlayback().unlock() : null;
      // Unlock speech output inside the gesture (iOS and Safari need this).
      try {
        synth()?.speak(new SpeechSynthesisUtterance(""));
      } catch {
        // ignore
      }
      return unlocked;
    },

    speak(text, { lang }) {
      if (!serverSpeech()) return speakWithSynth(text, lang);
      return getPlayback()
        .enqueue(text, lang)
        .then(
          () => options.onSpeechEngine?.("server"),
          (e: unknown) => {
            if (!(e instanceof VoiceError && e.status === 503)) throw e;
            // Our server cannot speak (no voices): the browser speaks from now on.
            serverDown = true;
            return speakWithSynth(text, lang);
          },
        );
    },

    cancel() {
      playback?.cancel();
      try {
        synth()?.cancel();
      } catch {
        // ignore
      }
    },

    getOutputLevel: () => (playback && serverSpeech() ? playback.getOutputLevel() : null),

    dispose() {
      output.cancel();
      playback?.dispose();
    },
  };
  return output;
}
