import type { ListenHandlers, VoiceAdapter } from "@/contracts/voice";
import { toVoiceError, VoiceError } from "./errors";

export type VoiceStatus =
  | "unavailable" // no adapter, or the browser cannot do voice: use text
  | "idle"
  | "listening" // button held
  | "transcribing" // released, waiting for the final transcript
  | "speaking"
  | "error";

export interface VoiceState {
  status: VoiceStatus;
  /** Live partial transcript while listening. Cleared when the press ends. */
  partial: string;
  /** The last final transcript. */
  finalTranscript: string;
  error: VoiceError | null;
  inputLevel: number;
  timings: { releaseToFinalMs: number | null; requestToFirstAudioMs: number | null };
}

type Listener = (state: VoiceState) => void;

export interface VoiceControllerOptions {
  /** Null means voice is off for this deployment or browser. */
  adapter: VoiceAdapter | null;
  now?: () => number;
}

/**
 * The voice state machine, free of React and of the browser so it can be tested with a
 * fake adapter. One press at a time; speech and capture never overlap.
 */
export class VoiceController {
  private adapter: VoiceAdapter | null;
  private readonly now: () => number;
  private state: VoiceState;
  private readonly listeners = new Set<Listener>();
  private prepared: Promise<void> | null = null;
  /** Bumped whenever speech is cancelled or replaced, so stale completions are ignored. */
  private speechRun = 0;
  /** Sentences handed to the adapter in the current speech run that have not finished yet. */
  private speechPending = 0;
  /** Bumped per press, so a late start or stop from an older press is ignored. */
  private pressRun = 0;
  private starting: Promise<void> | null = null;

  constructor(options: VoiceControllerOptions) {
    this.adapter = options.adapter;
    this.now = options.now ?? (() => performance.now());
    this.state = {
      status: options.adapter ? "idle" : "unavailable",
      partial: "",
      finalTranscript: "",
      error: null,
      inputLevel: 0,
      timings: { releaseToFinalMs: null, requestToFirstAudioMs: null },
    };
  }

  getState = (): VoiceState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getOutputLevel(): number | null {
    return this.adapter?.getOutputLevel() ?? null;
  }

  /** Adapters report "request to first audio" here. */
  recordFirstAudio(ms: number): void {
    this.set({ timings: { ...this.state.timings, requestToFirstAudioMs: ms } });
  }

  /** Call from a user gesture. Failures move to `unavailable` (cannot ever work) or `error`. */
  prepare(): Promise<void> {
    const adapter = this.adapter;
    if (!adapter) return Promise.resolve();
    if (!this.prepared) {
      this.prepared = adapter.prepare().catch((e: unknown) => {
        this.prepared = null;
        const error = toVoiceError(e);
        this.set({
          status: error.code === "unsupported" ? "unavailable" : "error",
          error,
        });
        throw error;
      });
    }
    return this.prepared;
  }

  /** Button down. Cancels speech first if the interviewer is talking. */
  async pressTalk(): Promise<void> {
    const adapter = this.adapter;
    if (!adapter) return;
    const { status } = this.state;
    if (status === "listening" || status === "transcribing" || status === "unavailable") return;
    if (status === "speaking") this.cancelSpeech();

    const run = ++this.pressRun;
    this.set({ status: "listening", partial: "", error: null, inputLevel: 0 });

    const handlers: ListenHandlers = {
      onPartial: (text) => {
        if (run === this.pressRun && this.state.status === "listening") this.set({ partial: text });
      },
      onLevel: (level) => {
        if (run === this.pressRun) this.set({ inputLevel: level });
      },
      onError: (e) => {
        if (run !== this.pressRun) return;
        this.set({ status: "error", error: toVoiceError(e), partial: "", inputLevel: 0 });
      },
    };

    const start = (async () => {
      await this.prepare();
      if (run !== this.pressRun) return;
      await adapter.startListening(handlers);
    })();
    this.starting = start;
    try {
      await start;
    } catch (e) {
      if (run === this.pressRun) {
        const error = toVoiceError(e);
        this.set({
          status: error.code === "unsupported" ? "unavailable" : "error",
          error,
          partial: "",
          inputLevel: 0,
        });
      }
    }
  }

  /** Button up. Resolves with the final transcript, or "" when nothing was heard or it failed. */
  async releaseTalk(): Promise<string> {
    const adapter = this.adapter;
    if (!adapter || this.state.status !== "listening") return "";
    const run = this.pressRun;
    const releasedAt = this.now();
    this.set({ status: "transcribing", inputLevel: 0 });

    try {
      await this.starting?.catch(() => {});
      if (run !== this.pressRun || this.getState().status !== "transcribing") return "";
      const text = (await adapter.stopListening()).trim();
      if (run !== this.pressRun) return "";
      this.set({
        status: "idle",
        partial: "",
        finalTranscript: text,
        timings: { ...this.state.timings, releaseToFinalMs: this.now() - releasedAt },
      });
      return text;
    } catch (e) {
      if (run === this.pressRun) this.set({ status: "error", error: toVoiceError(e), partial: "" });
      return "";
    }
  }

  /**
   * Queue sentences for speech. Ignored while capturing; returns when speech ends or is cancelled.
   * By default the sentences replace whatever is still playing. With `append` they join the end of
   * a reply that is already being spoken (the interviewer's reply arrives sentence by sentence, and
   * each one must not cut off the one before); when nothing is playing they simply start.
   * `cancelSpeech`, a talk press, or a call without `append` silences everything queued at once.
   */
  async speakSentences(texts: string[], lang: string, options: { append?: boolean } = {}): Promise<void> {
    const adapter = this.adapter;
    const clean = texts.map((t) => t.trim()).filter(Boolean);
    if (!adapter || clean.length === 0) return;
    const { status } = this.state;
    if (status === "listening" || status === "transcribing" || status === "unavailable") return;

    const appending = options.append === true && status === "speaking" && this.speechPending > 0;
    if (!appending) {
      this.speechRun += 1;
      this.speechPending = 0;
      adapter.cancelSpeech(); // a new reply replaces whatever is still playing
    }
    const run = this.speechRun;
    this.speechPending += clean.length;
    this.set({ status: "speaking", error: null });

    const results = await Promise.allSettled(clean.map((t) => adapter.speak(t, { lang })));
    if (run !== this.speechRun) return; // cancelled or replaced meanwhile
    this.speechPending = Math.max(0, this.speechPending - clean.length);
    const failed = results.find((r) => r.status === "rejected");
    if (failed) {
      this.speechRun += 1; // sentences still queued behind the failed one are stale now
      this.speechPending = 0;
      adapter.cancelSpeech();
      this.set({ status: "error", error: toVoiceError((failed as PromiseRejectedResult).reason) });
    } else if (this.speechPending === 0) {
      this.set({ status: "idle" });
    }
  }

  cancelSpeech(): void {
    if (!this.adapter) return;
    this.speechRun += 1;
    this.speechPending = 0;
    this.adapter.cancelSpeech();
    if (this.state.status === "speaking") this.set({ status: "idle" });
  }

  /** Clear an error and return to idle (text input keeps working in every state). */
  clearError(): void {
    if (this.state.status === "error") this.set({ status: "idle", error: null });
  }

  dispose(): void {
    this.pressRun += 1;
    this.speechRun += 1;
    this.listeners.clear();
    try {
      this.adapter?.cancelSpeech();
      this.adapter?.dispose();
    } catch {
      // ignore
    }
    this.adapter = null;
  }

  private set(patch: Partial<VoiceState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }
}
