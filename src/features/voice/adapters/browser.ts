import type { ListenHandlers, VoiceAdapter } from "@/contracts/voice";
import { toVoiceError, VoiceError } from "../errors";
import { requestMicPermission, startMicMeter, type MicMeter } from "../micMeter";
import { createSpeechOutput, type SpeechEngine, type SpeechOutputOptions } from "../speech";

export type { SpeechEngine };

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

export interface BrowserAdapterOptions extends SpeechOutputOptions {
  /** BCP 47 tag for recognition, read at each press. Defaults to the browser language. */
  recognitionLang?: () => string;
}

const STOP_TIMEOUT_MS = 3000;

/**
 * On Android a second microphone stream (the level meter) silences the recogniser, so the meter
 * is left out there.
 */
const isAndroid = (): boolean => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

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
  const speech = createSpeechOutput(options);

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
      const unlocked = speech.unlock();
      if (!getRecognitionCtor()) {
        throw new VoiceError("unsupported", "This browser has no speech recognition");
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

      if (handlers.onLevel && !isAndroid()) {
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

    speak: (text, opts) => speech.speak(text, opts),

    cancelSpeech() {
      speech.cancel();
    },

    getOutputLevel: () => speech.getOutputLevel(),

    dispose() {
      speech.dispose();
      stopMeter();
      try {
        recognition?.abort();
      } catch {
        // ignore
      }
      recognition = null;
    },
  };

  return adapter;
}
