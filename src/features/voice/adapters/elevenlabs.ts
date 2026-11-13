"use client";

import { useEffect, useRef, useState } from "react";
import { CommitStrategy, useScribe } from "@elevenlabs/react";
import type { ListenHandlers, VoiceAdapter } from "@/contracts/voice";
import { toVoiceError, VoiceError } from "../errors";
import { requestMicPermission, startMicMeter, type MicMeter } from "../micMeter";
import { Latest } from "../latest";
import { PlaybackQueue } from "../playback";

/** Used only if /api/voice/token does not name a model. */
export const DEFAULT_STT_MODEL = "scribe_v3_live";
const READY_TIMEOUT_MS = 8000;
const COMMIT_TIMEOUT_MS = 5000;
/** Keep capturing briefly after release so the last syllable is not clipped. */
const RELEASE_TAIL_MS = 200;

export interface ElevenLabsAdapterOptions {
  /** Milliseconds from the first sentence request to the first sound. */
  onFirstAudio?: (ms: number) => void;
}

/** One press of the talk button, as seen by the Scribe callbacks. */
class Session {
  handlers: ListenHandlers | null = null;
  partial = "";
  committed: string[] = [];
  connected = false;
  stopping = false;
  ready: { resolve: () => void; reject: (e: Error) => void } | null = null;
  waiter: ((text: string) => void) | null = null;

  reset(handlers: ListenHandlers) {
    this.handlers = handlers;
    this.partial = "";
    this.committed = [];
    this.connected = false;
    this.stopping = false;
    this.ready = null;
    this.waiter = null;
  }

  best(): string {
    return (this.committed.length > 0 ? this.committed.join(" ") : this.partial).trim();
  }

  fail = (message: string) => {
    const error = new VoiceError("failed", message);
    if (this.ready) {
      this.ready.reject(error);
      this.ready = null;
    } else if (this.stopping) {
      // The person already let go; hand back whatever text we have instead of an error.
      this.waiter?.(this.best());
    } else {
      this.handlers?.onError(error);
    }
  };

  // Callbacks handed to useScribe. They are stable, so every connect() sees the same ones.
  callbacks = {
    onSessionStarted: () => {
      this.connected = true;
      this.ready?.resolve();
      this.ready = null;
    },
    onPartialTranscript: ({ text }: { text: string }) => {
      this.partial = text;
      this.handlers?.onPartial?.(text);
    },
    onCommittedTranscript: ({ text }: { text: string }) => {
      if (text.trim()) this.committed.push(text.trim());
      this.partial = "";
      if (this.stopping) this.waiter?.(this.best());
    },
    onError: (e: Error | Event) => this.fail(e instanceof Error ? e.message : "Speech connection error"),
    onAuthError: (d: { error: string }) => this.fail(d.error),
    onQuotaExceededError: (d: { error: string }) => this.fail(d.error),
    onRateLimitedError: (d: { error: string }) => this.fail(d.error),
    onTranscriberError: (d: { error: string }) => this.fail(d.error),
    onUnacceptedTermsError: (d: { error: string }) => this.fail(d.error),
    onSessionTimeLimitExceededError: (d: { error: string }) => this.fail(d.error),
    // Releasing with no speech in it is normal: an empty transcript, not an error.
    onInsufficientAudioActivityError: () => this.waiter?.(this.best()),
    onDisconnect: () => {
      this.connected = false;
      if (this.stopping) this.waiter?.(this.best());
    },
  };
}

async function fetchToken(): Promise<{ token: string; modelId: string }> {
  let res: Response;
  try {
    res = await fetch("/api/voice/token", { method: "POST" });
  } catch (e) {
    throw new VoiceError("unavailable", "Could not reach the voice service", { cause: e });
  }
  if (!res.ok) throw new VoiceError("unavailable", `Voice token request failed (${res.status})`);
  const body = (await res.json()) as { token?: unknown; modelId?: unknown };
  if (typeof body.token !== "string" || !body.token) {
    throw new VoiceError("unavailable", "Voice token response had no token");
  }
  return {
    token: body.token,
    modelId: typeof body.modelId === "string" && body.modelId ? body.modelId : DEFAULT_STT_MODEL,
  };
}

/**
 * ElevenLabs realtime speech-to-text plus proxied text-to-speech. Speech-to-text is only
 * offered as a React hook (`useScribe`), so the adapter is a hook-backed object: the
 * returned VoiceAdapter is stable across renders and implements the same interface.
 */
export function useElevenLabsAdapter(options: ElevenLabsAdapterOptions = {}): VoiceAdapter {
  const [session] = useState(() => new Session());
  const [firstAudio] = useState(() => new Latest<ElevenLabsAdapterOptions["onFirstAudio"]>(undefined));
  const scribe = useScribe({ commitStrategy: CommitStrategy.MANUAL, ...session.callbacks });
  const scribeRef = useRef(scribe);
  useEffect(() => {
    scribeRef.current = scribe;
    firstAudio.set(options.onFirstAudio);
  });

  const [adapter] = useState<VoiceAdapter>(() => {
    const playback = new PlaybackQueue({ onFirstAudio: (ms) => firstAudio.get()?.(ms) });
    let meter: MicMeter | null = null;
    const stopMeter = () => {
      meter?.stop();
      meter = null;
    };

    return {
      id: "elevenlabs",
      supportsPartials: true,

      async prepare() {
        const unlocked = playback.unlock(); // starts synchronously, inside the gesture
        try {
          await requestMicPermission();
        } catch (e) {
          throw toVoiceError(e);
        }
        await unlocked;
      },

      async startListening(handlers) {
        session.reset(handlers);
        // Single-use token, minted now and never on page load.
        const { token, modelId } = await fetchToken();
        const ready = new Promise<void>((resolve, reject) => {
          session.ready = { resolve, reject };
        });
        const timeout = setTimeout(
          () => session.ready?.reject(new VoiceError("unavailable", "Voice connection timed out")),
          READY_TIMEOUT_MS,
        );
        try {
          await scribeRef.current.connect({
            token,
            modelId,
            commitStrategy: CommitStrategy.MANUAL,
            microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          await ready;
        } catch (e) {
          scribeRef.current.disconnect();
          throw toVoiceError(e, "unavailable");
        } finally {
          clearTimeout(timeout);
        }
        if (handlers.onLevel) {
          startMicMeter(handlers.onLevel).then(
            (m) => {
              if (session.connected) meter = m;
              else m.stop();
            },
            () => {},
          );
        }
      },

      async stopListening() {
        stopMeter();
        if (!session.connected) {
          scribeRef.current.disconnect();
          return "";
        }
        await new Promise((r) => setTimeout(r, RELEASE_TAIL_MS));
        session.stopping = true;
        const text = await new Promise<string>((resolve) => {
          const timer = setTimeout(() => resolve(session.best()), COMMIT_TIMEOUT_MS);
          session.waiter = (t) => {
            clearTimeout(timer);
            resolve(t);
          };
          try {
            scribeRef.current.commit();
          } catch {
            clearTimeout(timer);
            resolve(session.best());
          }
        });
        session.waiter = null;
        scribeRef.current.disconnect();
        return text.trim();
      },

      speak: (text, { lang }) => playback.enqueue(text, lang),
      cancelSpeech: () => playback.cancel(),
      getOutputLevel: () => playback.getOutputLevel(),

      dispose() {
        stopMeter();
        scribeRef.current.disconnect();
        playback.dispose();
      },
    };
  });

  return adapter;
}
