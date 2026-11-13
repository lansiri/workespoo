import type { ListenHandlers, VoiceAdapter } from "@/contracts/voice";
import { toVoiceError, VoiceError } from "../errors";
import { requestMicPermission, startMicMeter, type MicMeter } from "../micMeter";
import { PlaybackQueue } from "../playback";

// The DOM lib does not ship these types everywhere, so describe only what we use.
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

export function getRecognitionCtor(win: unknown = globalThis): RecognitionCtor | null {
  const w = win as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface BrowserAdapterOptions {
  /** BCP 47 tag for recognition, read at each press. Defaults to the browser language. */
  recognitionLang?: () => string;
  /** Milliseconds from speak() to the first sound, once per call. */
  onFirstAudio?: (ms: number) => void;
  /**
   * Who speaks, read at each sentence: the browser's speechSynthesis, or our server through
   * `/api/voice/tts` and the playback queue (from the voice config's `tts`). Default browser.
   */
  speech?: () => SpeechEngine;
  /** Told which engine spoke each sentence, for the test page. */
  onSpeechEngine?: (engine: SpeechEngine) => void;
  /** Injected in tests. Created on first use otherwise. */
  playback?: PlaybackQueue;
}

export type SpeechEngine = "browser" | "server";

const STOP_TIMEOUT_MS = 3000;

/**
 * Zero-key adapter: the browser's own speech recognition, and speech either from our server
 * (Piper, when the config says `tts: "server"`) or from the browser's speechSynthesis. When the
 * server answers 503 the adapter falls back to speechSynthesis for the rest of the page's life.
 */
export function createBrowserAdapter(options: BrowserAdapterOptions = {}): VoiceAdapter {
  let recognition: Recognition | null = null;
  let meter: MicMeter | null = null;
  let finals: string[] = [];
  let interim = "";
  let ended: Promise<void> | null = null;
  let markEnded: (() => void) | null = null;
  let fatal: Error | null = null;
  let speaking = 0;
  let playback: PlaybackQueue | null = options.playback ?? null;
  let serverDown = false;

  const getPlayback = (): PlaybackQueue => {
    // Two fetches at a time: the server speaks one sentence at a time and turns away a third.
    playback ??= new PlaybackQueue({ onFirstAudio: options.onFirstAudio, maxConcurrentFetches: 2 });
    return playback;
  };
  const serverSpeech = () => !serverDown && options.speech?.() === "server";

  const synth = (): SpeechSynthesis | null =>
    typeof speechSynthesis === "undefined" ? null : speechSynthesis;

  const stopMeter = () => {
    meter?.stop();
    meter = null;
  };

  const collected = () => [...finals, interim].join(" ").replace(/\s+/g, " ").trim();

  const adapter: VoiceAdapter = {
    id: "browser",
    supportsPartials: true,

    async prepare() {
      // Starts synchronously, inside the gesture, before anything below awaits.
      const unlocked = serverSpeech() ? getPlayback().unlock() : null;
      if (!getRecognitionCtor()) {
        throw new VoiceError("unsupported", "This browser has no speech recognition");
      }
      // Unlock speech output inside the gesture (iOS and Safari need this).
      try {
        synth()?.speak(new SpeechSynthesisUtterance(""));
      } catch {
        // ignore
      }
      try {
        await requestMicPermission();
      } catch (e) {
        throw toVoiceError(e);
      }
      await unlocked;
    },

    async startListening(handlers: ListenHandlers) {
      const Ctor = getRecognitionCtor();
      if (!Ctor) throw new VoiceError("unsupported", "This browser has no speech recognition");
      adapter.cancelSpeech();
      finals = [];
      interim = "";
      fatal = null;

      const rec = new Ctor();
      rec.lang =
        options.recognitionLang?.() ??
        (typeof navigator !== "undefined" ? navigator.language : "en-US");
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      ended = new Promise<void>((resolve) => {
        markEnded = resolve;
      });
      rec.onresult = (e) => {
        let nextInterim = "";
        const nextFinals: string[] = [];
        for (let i = 0; i < e.results.length; i += 1) {
          const result = e.results[i];
          const text = result[0]?.transcript ?? "";
          if (result.isFinal) nextFinals.push(text.trim());
          else nextInterim += text;
        }
        finals = nextFinals;
        interim = nextInterim.trim();
        handlers.onPartial?.(collected());
      };
      rec.onerror = (e) => {
        // "no-speech" and "aborted" are ordinary outcomes of a press with nothing in it.
        if (e.error === "no-speech" || e.error === "aborted") return;
        const code =
          e.error === "not-allowed" || e.error === "service-not-allowed" ? "mic-denied" : "failed";
        fatal = new VoiceError(code, `Speech recognition error: ${e.error}`);
        handlers.onError(fatal);
      };
      rec.onend = () => {
        markEnded?.();
      };
      recognition = rec;
      rec.start();

      if (handlers.onLevel) {
        // Best effort; the level meter must never break capture.
        startMicMeter(handlers.onLevel).then(
          (m) => {
            if (recognition === rec) meter = m;
            else m.stop();
          },
          () => {},
        );
      }
    },

    async stopListening() {
      const rec = recognition;
      stopMeter();
      if (!rec) return "";
      recognition = null;
      const done = ended;
      try {
        rec.stop();
      } catch {
        // already stopped
      }
      await Promise.race([done, new Promise<void>((r) => setTimeout(r, STOP_TIMEOUT_MS))]);
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      if (fatal) throw fatal;
      return collected();
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

    cancelSpeech() {
      playback?.cancel();
      try {
        synth()?.cancel();
      } catch {
        // ignore
      }
    },

    getOutputLevel: () => (playback && serverSpeech() ? playback.getOutputLevel() : null),

    dispose() {
      adapter.cancelSpeech();
      playback?.dispose();
      stopMeter();
      try {
        recognition?.abort();
      } catch {
        // ignore
      }
      recognition = null;
    },
  };

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

  return adapter;
}
