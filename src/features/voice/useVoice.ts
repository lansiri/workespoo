"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { VoiceConfig } from "@/contracts/voice";
import { createBrowserAdapter, type SpeechEngine } from "./adapters/browser";
import { createServerAdapter } from "./adapters/server";
import { useElevenLabsAdapter } from "./adapters/elevenlabs";
import { Latest } from "./latest";
import { VoiceController, type VoiceState } from "./controller";
import { selectAdapterId, type AdapterOverride, type RunnableAdapterId } from "./select";

export interface UseVoiceOptions {
  /** Interview language: "en", "fi" or "sv". Used for recognition and speech. */
  lang?: string;
  /** Initial manual override (the test page changes it with `setOverride`). */
  override?: AdapterOverride;
  /** The one adapter this person's consent allows (see `selectAdapterId`). Nothing else is ever used. */
  only?: RunnableAdapterId;
}

const OFF: VoiceState = {
  status: "unavailable",
  partial: "",
  finalTranscript: "",
  error: null,
  inputLevel: 0,
  timings: { releaseToFinalMs: null, requestToFirstAudioMs: null },
};

const RECOGNITION_TAGS: Record<string, string> = { en: "en-US", fi: "fi-FI", sv: "sv-SE" };

/** Who speaks the interviewer's replies: ElevenLabs, our server (Piper) or the browser. */
export type SpeakingEngine = "elevenlabs" | SpeechEngine;

/**
 * Owns the adapter choice and the voice state machine for one page.
 * Status is `unavailable` until the server config has loaded, and whenever voice is off or
 * the browser cannot do it: in every case the page keeps working with text input.
 */
export function useVoice(options: UseVoiceOptions = {}) {
  const lang = options.lang ?? "en";
  const [override, setOverride] = useState<AdapterOverride>(options.override ?? "auto");
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [lastEngine, setLastEngine] = useState<SpeechEngine | null>(null);

  const [liveLang] = useState(() => new Latest(lang));
  const [liveConfig] = useState(() => new Latest<VoiceConfig | null>(null));
  const [liveController] = useState(() => new Latest<VoiceController | null>(null));
  useEffect(() => {
    liveLang.set(lang);
    liveConfig.set(config);
  });

  const onFirstAudio = useCallback(
    (ms: number) => liveController.get()?.recordFirstAudio(ms),
    [liveController],
  );
  const elevenlabs = useElevenLabsAdapter({ onFirstAudio });
  const [browser] = useState(() =>
    createBrowserAdapter({
      recognitionLang: () => RECOGNITION_TAGS[liveLang.get()] ?? liveLang.get(),
      onFirstAudio,
      speech: () => (liveConfig.get()?.tts === "server" ? "server" : "browser"),
      onSpeechEngine: setLastEngine,
    }),
  );
  const [server] = useState(() =>
    createServerAdapter({
      onFirstAudio,
      speech: () => (liveConfig.get()?.tts === "server" ? "server" : "browser"),
      onSpeechEngine: setLastEngine,
    }),
  );

  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/voice/config", { signal: abort.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`config ${r.status}`))))
      .then((json) => {
        setConfig(VoiceConfig.parse(json));
        setConfigLoaded(true);
      })
      .catch((e: unknown) => {
        if (abort.signal.aborted) return;
        setConfigError(e instanceof Error ? e.message : "config failed");
        setConfigLoaded(true);
      });
    return () => abort.abort();
  }, []);

  const adapterId = selectAdapterId(config, override, options.only);
  // The browser adapter starts on our server when the config says so and moves to
  // speechSynthesis for good if the server answers 503; `lastEngine` shows which one spoke.
  const speakingEngine: SpeakingEngine | null =
    adapterId === "elevenlabs"
      ? "elevenlabs"
      : adapterId === "browser" || adapterId === "server"
        ? (lastEngine ?? (config?.tts === "server" ? "server" : "browser"))
        : null;

  const [controller, setController] = useState<VoiceController | null>(null);
  useEffect(() => {
    if (!configLoaded) return;
    const adapter =
      adapterId === "elevenlabs"
        ? elevenlabs
        : adapterId === "browser"
          ? browser
          : adapterId === "server"
            ? server
            : null;
    const next = new VoiceController({ adapter });
    liveController.set(next);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the controller is created from loaded config
    setController(next);
    return () => {
      next.dispose();
      if (liveController.get() === next) liveController.set(null);
    };
  }, [configLoaded, adapterId, elevenlabs, browser, server, liveController]);

  const subscribe = useCallback(
    (cb: () => void) => (controller ? controller.subscribe(cb) : () => {}),
    [controller],
  );
  const getSnapshot = useCallback(() => (controller ? controller.getState() : OFF), [controller]);
  const state = useSyncExternalStore(subscribe, getSnapshot, () => OFF);

  const [outputLevel, setOutputLevel] = useState(0);
  const speaking = state.status === "speaking";
  useEffect(() => {
    if (!speaking || !controller) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the meter when speech stops
      setOutputLevel(0);
      return;
    }
    let raf = 0;
    const tick = () => {
      setOutputLevel(controller.getOutputLevel() ?? 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speaking, controller]);

  const prepare = useCallback(async () => {
    await controller?.prepare().catch(() => {});
  }, [controller]);
  const pressTalk = useCallback(() => controller?.pressTalk() ?? Promise.resolve(), [controller]);
  const releaseTalk = useCallback(
    () => controller?.releaseTalk() ?? Promise.resolve(""),
    [controller],
  );
  const speakSentences = useCallback(
    (texts: string[], speakLang?: string, speakOptions?: { append?: boolean }) =>
      controller?.speakSentences(texts, speakLang ?? lang, speakOptions) ?? Promise.resolve(),
    [controller, lang],
  );
  const cancelSpeech = useCallback(() => controller?.cancelSpeech(), [controller]);
  const clearError = useCallback(() => controller?.clearError(), [controller]);

  return {
    config,
    configError,
    adapterId,
    speakingEngine,
    override,
    setOverride,
    status: state.status,
    partial: state.partial,
    finalTranscript: state.finalTranscript,
    error: state.error,
    inputLevel: state.inputLevel,
    outputLevel,
    timings: state.timings,
    prepare,
    pressTalk,
    releaseTalk,
    speakSentences,
    cancelSpeech,
    clearError,
  };
}

export type UseVoice = ReturnType<typeof useVoice>;
