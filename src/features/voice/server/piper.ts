import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Piper speech synthesis on our own server (docs/research/voice-piper.md).
 *
 * One long-lived Piper process per language, started on first use and stopped after five
 * idle minutes, fed one sentence at a time. Piper writes raw 16-bit mono PCM to stdout and
 * then logs a "Real-time factor" line on stderr; that line marks the end of the sentence.
 *
 * The text is never logged, and the audio is never written to disk: it is returned to the
 * caller, which streams it to the browser.
 */

/** One voice per language. All three are 22 050 Hz (measured; see the research note). */
export const PIPER_VOICES = {
  en: { model: "en_GB-cori-medium", sampleRate: 22050 },
  fi: { model: "fi_FI-harri-medium", sampleRate: 22050 },
  sv: { model: "sv_SE-nst-medium", sampleRate: 22050 },
} as const;
export type PiperLang = keyof typeof PIPER_VOICES;

export const DEFAULT_PIPER_DIR = "/opt/piper";
const IDLE_MS = 5 * 60_000;
const MAX_CONCURRENT = 2;
/** How long a request waits for one of the two slots before it is turned away. */
const SLOT_WAIT_MS = 1500;
/** A sentence that takes longer than this means the process is stuck: it is killed. */
const SENTENCE_TIMEOUT_MS = 20_000;
/** After the end-of-sentence log line, wait this long for the last stdout bytes. */
const SETTLE_MS = 25;
const END_MARKER = "Real-time factor";

/** Thrown when two syntheses are already running and a third has waited long enough. */
export class PiperBusyError extends Error {
  constructor() {
    super("speech synthesis busy");
    this.name = "PiperBusyError";
  }
}

/** Thrown when the Piper process fails or stops mid-sentence. The message never holds text. */
export class PiperFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PiperFailedError";
  }
}

/** The parts of a child process the pool uses, so tests can hand in a fake. */
export interface PiperChild {
  stdin: { write(chunk: string): unknown };
  stdout: { on(event: "data", listener: (chunk: Buffer) => void): unknown };
  stderr: { on(event: "data", listener: (chunk: Buffer | string) => void): unknown };
  on(event: "exit" | "error", listener: (...args: unknown[]) => void): unknown;
  kill(): unknown;
}

export type PiperSpawn = (command: string, args: string[]) => PiperChild;

export interface PiperPoolOptions {
  /** Directory holding `piper/piper` and `voices/<model>.onnx(.json)`. */
  dir: string;
  spawn?: PiperSpawn;
  now?: () => number;
  idleMs?: number;
  maxConcurrent?: number;
  slotWaitMs?: number;
  sentenceTimeoutMs?: number;
  settleMs?: number;
  /** Starts the periodic idle sweep. Off in tests, which call `sweepIdle()` themselves. */
  autoSweep?: boolean;
}

export function piperLang(lang: string): PiperLang {
  const base = lang.slice(0, 2).toLowerCase();
  return base in PIPER_VOICES ? (base as PiperLang) : "en";
}

export function piperBinary(dir: string): string {
  return path.join(dir, "piper", "piper");
}

function voiceFile(dir: string, lang: PiperLang): string {
  return path.join(dir, "voices", `${PIPER_VOICES[lang].model}.onnx`);
}

/** True when the binary and all three voices (model and config) are present. */
export function piperFilesPresent(dir: string): boolean {
  if (!existsSync(piperBinary(dir))) return false;
  return (Object.keys(PIPER_VOICES) as PiperLang[]).every(
    (lang) => existsSync(voiceFile(dir, lang)) && existsSync(`${voiceFile(dir, lang)}.json`),
  );
}

/** A complete 16-bit mono PCM WAV file around the given samples. */
export function wavFile(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function abortError(): Error {
  const e = new Error("aborted");
  e.name = "AbortError";
  return e;
}

interface Job {
  line: string;
  resolve(pcm: Buffer): void;
  reject(error: Error): void;
}

/** One Piper process for one language, doing one sentence at a time. */
class PiperWorker {
  private readonly child: PiperChild;
  private readonly queue: Job[] = [];
  private current: Job | null = null;
  private chunks: Buffer[] = [];
  private stderrLine = "";
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  dead = false;
  lastUsed: number;

  constructor(
    spawnFn: PiperSpawn,
    dir: string,
    lang: PiperLang,
    private readonly opts: { now: () => number; sentenceTimeoutMs: number; settleMs: number },
  ) {
    this.lastUsed = opts.now();
    this.child = spawnFn(piperBinary(dir), [
      "--model",
      voiceFile(dir, lang),
      "--json-input",
      "--output_raw",
    ]);
    this.child.stdout.on("data", (chunk) => {
      if (!this.current) return;
      this.chunks.push(chunk);
      // More audio after the end marker: wait for it to stop arriving.
      if (this.settleTimer) this.armSettle();
    });
    this.child.stderr.on("data", (chunk) => this.onStderr(String(chunk)));
    // Piper's stderr is never logged: at higher log levels it can carry phonemes of the text.
    this.child.on("exit", () => this.die("Speech process stopped"));
    this.child.on("error", () => this.die("Speech process could not run"));
  }

  get busy(): boolean {
    return this.current !== null || this.queue.length > 0;
  }

  synthesise(text: string): Promise<Buffer> {
    if (this.dead) return Promise.reject(new PiperFailedError("Speech process stopped"));
    return new Promise<Buffer>((resolve, reject) => {
      this.queue.push({ line: `${JSON.stringify({ text })}\n`, resolve, reject });
      this.next();
    });
  }

  stop(): void {
    this.die("Speech process stopped");
  }

  private next(): void {
    if (this.current || this.dead) return;
    const job = this.queue.shift();
    if (!job) return;
    this.current = job;
    this.chunks = [];
    this.deadline = setTimeout(
      () => this.die("Speech process timed out"),
      this.opts.sentenceTimeoutMs,
    );
    try {
      this.child.stdin.write(job.line);
    } catch {
      this.die("Speech process could not be written to");
    }
  }

  private onStderr(text: string): void {
    this.stderrLine += text;
    const lines = this.stderrLine.split("\n");
    this.stderrLine = lines.pop() ?? "";
    if (lines.some((l) => l.includes(END_MARKER)) && this.current) this.armSettle();
  }

  private armSettle(): void {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => this.finish(), this.opts.settleMs);
  }

  private finish(): void {
    this.settleTimer = null;
    const job = this.current;
    if (!job) return;
    if (this.deadline) clearTimeout(this.deadline);
    this.deadline = null;
    this.current = null;
    const pcm = Buffer.concat(this.chunks);
    this.chunks = [];
    this.lastUsed = this.opts.now();
    job.resolve(pcm);
    this.next();
  }

  private die(reason: string): void {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    if (this.deadline) clearTimeout(this.deadline);
    this.settleTimer = null;
    this.deadline = null;
    const pending = [...(this.current ? [this.current] : []), ...this.queue.splice(0)];
    this.current = null;
    const wasDead = this.dead;
    this.dead = true;
    if (!wasDead) {
      try {
        this.child.kill();
      } catch {
        // already gone
      }
    }
    for (const job of pending) job.reject(new PiperFailedError(reason));
  }
}

const defaultSpawn: PiperSpawn = (command, args) =>
  spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });

export class PiperPool {
  private readonly dir: string;
  private readonly spawnFn: PiperSpawn;
  private readonly now: () => number;
  private readonly idleMs: number;
  private readonly maxConcurrent: number;
  private readonly slotWaitMs: number;
  private readonly workerOpts: { now: () => number; sentenceTimeoutMs: number; settleMs: number };
  private readonly workers = new Map<PiperLang, PiperWorker>();
  private active = 0;
  private readonly waiting: Array<() => void> = [];
  private sweeper: ReturnType<typeof setInterval> | null = null;
  private readonly autoSweep: boolean;

  constructor(options: PiperPoolOptions) {
    this.dir = options.dir;
    this.spawnFn = options.spawn ?? defaultSpawn;
    this.now = options.now ?? Date.now;
    this.idleMs = options.idleMs ?? IDLE_MS;
    this.maxConcurrent = options.maxConcurrent ?? MAX_CONCURRENT;
    this.slotWaitMs = options.slotWaitMs ?? SLOT_WAIT_MS;
    this.autoSweep = options.autoSweep ?? false;
    this.workerOpts = {
      now: this.now,
      sentenceTimeoutMs: options.sentenceTimeoutMs ?? SENTENCE_TIMEOUT_MS,
      settleMs: options.settleMs ?? SETTLE_MS,
    };
  }

  /** Resolves with a complete WAV. Rejects with PiperBusyError, PiperFailedError or an AbortError. */
  async synthesise(text: string, lang: string, signal?: AbortSignal): Promise<Buffer> {
    if (signal?.aborted) throw abortError();
    const release = await this.acquire(signal);
    try {
      const voice = piperLang(lang);
      const pcm = await this.raceAbort(this.worker(voice).synthesise(text), signal);
      return wavFile(pcm, PIPER_VOICES[voice].sampleRate);
    } finally {
      release();
    }
  }

  /** Stops every process that has had nothing to do for the idle time. */
  sweepIdle(): void {
    const now = this.now();
    for (const [lang, worker] of this.workers) {
      if (!worker.busy && now - worker.lastUsed >= this.idleMs) {
        worker.stop();
        this.workers.delete(lang);
      }
    }
    if (this.workers.size === 0) this.stopSweeper();
  }

  /** Languages with a live process, for tests and diagnostics. */
  get running(): PiperLang[] {
    return [...this.workers.entries()].filter(([, w]) => !w.dead).map(([lang]) => lang);
  }

  get inFlight(): number {
    return this.active;
  }

  shutdown(): void {
    this.stopSweeper();
    for (const worker of this.workers.values()) worker.stop();
    this.workers.clear();
  }

  private worker(lang: PiperLang): PiperWorker {
    let worker = this.workers.get(lang);
    if (!worker || worker.dead) {
      worker = new PiperWorker(this.spawnFn, this.dir, lang, this.workerOpts);
      this.workers.set(lang, worker);
      this.startSweeper();
    }
    return worker;
  }

  private startSweeper(): void {
    if (!this.autoSweep || this.sweeper) return;
    this.sweeper = setInterval(() => this.sweepIdle(), 60_000);
    this.sweeper.unref?.();
  }

  private stopSweeper(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
  }

  private acquire(signal?: AbortSignal): Promise<() => void> {
    const release = () => {
      const wake = this.waiting.shift();
      if (wake)
        wake(); // the slot passes straight to the next waiter
      else this.active -= 1;
    };
    const once = () => {
      let done = false;
      return () => {
        if (done) return;
        done = true;
        release();
      };
    };
    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return Promise.resolve(once());
    }
    return new Promise((resolve, reject) => {
      const wake = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve(once());
      };
      const drop = (error: Error) => {
        const i = this.waiting.indexOf(wake);
        if (i >= 0) this.waiting.splice(i, 1);
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      };
      const onAbort = () => drop(abortError());
      const timer = setTimeout(() => drop(new PiperBusyError()), this.slotWaitMs);
      signal?.addEventListener("abort", onAbort, { once: true });
      this.waiting.push(wake);
    });
  }

  /**
   * An abort answers the caller at once. The sentence already handed to Piper still runs to
   * its end marker, so the next sentence's audio is not mixed with this one's.
   */
  private raceAbort<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return work;
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(abortError());
      signal.addEventListener("abort", onAbort, { once: true });
      work.then(
        (v) => {
          signal.removeEventListener("abort", onAbort);
          resolve(v);
        },
        (e: unknown) => {
          signal.removeEventListener("abort", onAbort);
          reject(e);
        },
      );
    });
  }
}

/** Where Piper lives in this deployment. A blank PIPER_DIR means the image default. */
export function piperDir(): string {
  const v = process.env.PIPER_DIR;
  return v && v.trim() ? v.trim() : DEFAULT_PIPER_DIR;
}

/** True when this server can speak with Piper (binary and all voices present). */
export function piperAvailable(): boolean {
  return piperFilesPresent(piperDir());
}

let shared: { dir: string; pool: PiperPool } | null = null;

function defaultPool(): PiperPool {
  const dir = piperDir();
  if (!shared || shared.dir !== dir) {
    shared?.pool.shutdown();
    shared = { dir, pool: new PiperPool({ dir, autoSweep: true }) };
  }
  return shared.pool;
}

/** Synthesise one sentence with the deployment's shared pool. Resolves with a complete WAV. */
export function synthesise(text: string, lang: string, signal?: AbortSignal): Promise<Buffer> {
  return defaultPool().synthesise(text, lang, signal);
}
