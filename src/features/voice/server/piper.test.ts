import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PiperBusyError,
  PiperFailedError,
  PiperPool,
  piperFilesPresent,
  piperLang,
  wavFile,
  type PiperChild,
} from "./piper";

class FakeChild implements PiperChild {
  readonly events = new EventEmitter();
  readonly out = new EventEmitter();
  readonly err = new EventEmitter();
  readonly lines: string[] = [];
  killed = false;
  constructor(
    readonly command: string,
    readonly args: string[],
  ) {}
  stdin = { write: (chunk: string) => this.lines.push(chunk) };
  stdout = { on: (e: "data", l: (c: Buffer) => void) => this.out.on(e, l) };
  stderr = { on: (e: "data", l: (c: Buffer | string) => void) => this.err.on(e, l) };
  on(event: "exit" | "error", listener: (...args: unknown[]) => void) {
    this.events.on(event, listener);
    return this;
  }
  kill() {
    this.killed = true;
    this.events.emit("exit", null, "SIGTERM");
  }
  /** Answer the oldest unanswered sentence the way Piper does: audio, then the log line. */
  answer(bytes: number[]) {
    this.out.emit("data", Buffer.from(bytes));
    this.err.emit("data", "[piper] [info] Real-time factor: 0.2 (infer=0.1 sec, audio=0.5 sec)\n");
  }
  crash() {
    this.events.emit("exit", 1, null);
  }
  get texts() {
    return this.lines.map((l) => (JSON.parse(l) as { text: string }).text);
  }
}

function setup(overrides: Partial<ConstructorParameters<typeof PiperPool>[0]> = {}) {
  const children: FakeChild[] = [];
  let clock = 1_000;
  const pool = new PiperPool({
    dir: "/opt/piper",
    spawn: (command, args) => {
      const c = new FakeChild(command, args);
      children.push(c);
      return c;
    },
    now: () => clock,
    settleMs: 1,
    ...overrides,
  });
  return {
    pool,
    children,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

/** Wait until the fake has received `n` sentences. */
async function received(child: FakeChild | undefined, n: number) {
  for (let i = 0; i < 100 && (child?.lines.length ?? 0) < n; i += 1) await tick(1);
}

async function until(cond: () => boolean) {
  for (let i = 0; i < 100 && !cond(); i += 1) await tick(1);
}

describe("piperLang", () => {
  it("maps tags to the three voices and anything else to English", () => {
    expect(piperLang("fi")).toBe("fi");
    expect(piperLang("sv-SE")).toBe("sv");
    expect(piperLang("EN-us")).toBe("en");
    expect(piperLang("de")).toBe("en");
    expect(piperLang("et")).toBe("en");
  });
});

describe("wavFile", () => {
  it("wraps PCM in a 44-byte mono 16-bit header with the sizes filled in", () => {
    const wav = wavFile(Buffer.from([1, 0, 2, 0]), 22050);
    expect(wav.length).toBe(48);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(4)).toBe(40);
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(22050);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(4);
    expect([...wav.subarray(44)]).toEqual([1, 0, 2, 0]);
  });
});

describe("piperFilesPresent", () => {
  let dir = "";
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });
  it("needs the binary and every voice with its config", () => {
    dir = mkdtempSync(path.join(tmpdir(), "piper-"));
    expect(piperFilesPresent(dir)).toBe(false);
    mkdirSync(path.join(dir, "piper"));
    mkdirSync(path.join(dir, "voices"));
    writeFileSync(path.join(dir, "piper", "piper"), "");
    for (const m of ["en_GB-cori-medium", "fi_FI-harri-medium", "sv_SE-nst-medium"]) {
      writeFileSync(path.join(dir, "voices", `${m}.onnx`), "");
    }
    expect(piperFilesPresent(dir)).toBe(false);
    for (const m of ["en_GB-cori-medium", "fi_FI-harri-medium", "sv_SE-nst-medium"]) {
      writeFileSync(path.join(dir, "voices", `${m}.onnx.json`), "{}");
    }
    expect(piperFilesPresent(dir)).toBe(true);
  });
});

describe("PiperPool", () => {
  it("starts one process per language with the right voice and returns a complete WAV", async () => {
    const { pool, children } = setup();
    const p = pool.synthesise("Hello there.", "en");
    await received(children[0], 1);
    expect(children).toHaveLength(1);
    expect(children[0].command).toBe("/opt/piper/piper/piper");
    expect(children[0].args).toEqual([
      "--model",
      "/opt/piper/voices/en_GB-cori-medium.onnx",
      "--json-input",
      "--output_raw",
    ]);
    expect(children[0].texts).toEqual(["Hello there."]);
    children[0].answer([1, 0, 2, 0]);
    const wav = await p;
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(40)).toBe(4);
    expect([...wav.subarray(44)]).toEqual([1, 0, 2, 0]);

    const q = pool.synthesise("Hei.", "fi");
    await received(children[1], 1);
    expect(children).toHaveLength(2);
    expect(children[1].args[1]).toBe("/opt/piper/voices/fi_FI-harri-medium.onnx");
    children[1].answer([3, 0]);
    await q;
    expect(pool.running.sort()).toEqual(["en", "fi"]);
    pool.shutdown();
  });

  it("reuses the process for the next sentence of the same language", async () => {
    const { pool, children } = setup();
    const a = pool.synthesise("One.", "en");
    await received(children[0], 1);
    children[0].answer([1, 0]);
    await a;
    const b = pool.synthesise("Two.", "en-GB");
    await received(children[0], 2);
    children[0].answer([2, 0]);
    expect([...(await b).subarray(44)]).toEqual([2, 0]);
    expect(children).toHaveLength(1);
    expect(children[0].texts).toEqual(["One.", "Two."]);
  });

  it("uses English for an unknown language", async () => {
    const { pool, children } = setup();
    const p = pool.synthesise("Hallo.", "de");
    await received(children[0], 1);
    expect(children[0].args[1]).toContain("en_GB-cori-medium");
    children[0].answer([0, 0]);
    await p;
  });

  it("feeds one sentence at a time and keeps each sentence's audio apart", async () => {
    const { pool, children } = setup();
    const a = pool.synthesise("First.", "sv");
    const b = pool.synthesise("Second.", "sv");
    await received(children[0], 1);
    await tick();
    expect(children[0].texts).toEqual(["First."]); // the second waits for the first
    children[0].answer([1, 1]);
    await received(children[0], 2);
    children[0].answer([2, 2]);
    expect([...(await a).subarray(44)]).toEqual([1, 1]);
    expect([...(await b).subarray(44)]).toEqual([2, 2]);
  });

  it("collects audio that arrives in several chunks and after the end marker", async () => {
    const { pool, children } = setup({ settleMs: 15 });
    const p = pool.synthesise("Chunks.", "en");
    await received(children[0], 1);
    const c = children[0];
    c.out.emit("data", Buffer.from([1, 0]));
    c.err.emit("data", "[info] Real-time ");
    c.err.emit("data", "factor: 0.1 (infer=0.1 sec, audio=1 sec)\n");
    c.out.emit("data", Buffer.from([2, 0]));
    expect([...(await p).subarray(44)]).toEqual([1, 0, 2, 0]);
  });

  it("ignores the start-up log lines", async () => {
    const { pool, children } = setup();
    const p = pool.synthesise("Wait.", "en");
    await received(children[0], 1);
    let settled = false;
    void p.then(() => (settled = true));
    children[0].err.emit(
      "data",
      "[info] Loaded voice in 3.2 second(s)\n[info] Initialized piper\n",
    );
    await tick(10);
    expect(settled).toBe(false);
    children[0].answer([1, 0]);
    await p;
  });

  it("rejects the sentence when the process dies and replaces it on the next request", async () => {
    const { pool, children } = setup();
    const a = expect(pool.synthesise("Doomed.", "en")).rejects.toBeInstanceOf(PiperFailedError);
    await received(children[0], 1);
    children[0].crash();
    await a;
    expect(pool.running).toEqual([]);

    const b = pool.synthesise("Again.", "en");
    await received(children[1], 1);
    expect(children).toHaveLength(2);
    children[1].answer([5, 0]);
    expect([...(await b).subarray(44)]).toEqual([5, 0]);
  });

  it("rejects when the binary cannot be started", async () => {
    const { pool, children } = setup();
    const a = expect(pool.synthesise("Missing.", "en")).rejects.toBeInstanceOf(PiperFailedError);
    await received(children[0], 1);
    children[0].events.emit("error", new Error("spawn ENOENT"));
    await a;
  });

  it("kills a process that does not finish a sentence in time", async () => {
    const { pool, children } = setup({ sentenceTimeoutMs: 20 });
    const a = pool.synthesise("Stuck.", "en");
    await expect(a).rejects.toBeInstanceOf(PiperFailedError);
    expect(children[0].killed).toBe(true);
  });

  it("stops processes idle for five minutes, and only those", async () => {
    const { pool, children, advance } = setup();
    const a = pool.synthesise("Old.", "en");
    await received(children[0], 1);
    children[0].answer([1, 0]);
    await a;
    advance(3 * 60_000);
    const b = pool.synthesise("Newer.", "fi");
    await received(children[1], 1);
    children[1].answer([1, 0]);
    await b;

    advance(2 * 60_000 - 1);
    pool.sweepIdle();
    expect(children[0].killed).toBe(false);
    advance(1);
    pool.sweepIdle();
    expect(children[0].killed).toBe(true);
    expect(children[1].killed).toBe(false);
    expect(pool.running).toEqual(["fi"]);

    advance(3 * 60_000);
    pool.sweepIdle();
    expect(children[1].killed).toBe(true);
    expect(pool.running).toEqual([]);

    // The next English sentence starts a fresh process.
    const c = pool.synthesise("Back.", "en");
    await received(children[2], 1);
    children[2].answer([1, 0]);
    await c;
    expect(children).toHaveLength(3);
  });

  it("does not stop a process that is in the middle of a sentence", async () => {
    const { pool, children, advance } = setup();
    const a = pool.synthesise("Long.", "en");
    await received(children[0], 1);
    advance(10 * 60_000);
    pool.sweepIdle();
    expect(children[0].killed).toBe(false);
    children[0].answer([1, 0]);
    await a;
  });

  it("runs at most two syntheses at once; a third waits and then is turned away", async () => {
    const { pool, children } = setup({ slotWaitMs: 30 });
    const a = pool.synthesise("A.", "en");
    const b = pool.synthesise("B.", "fi");
    const c = expect(pool.synthesise("C.", "sv")).rejects.toBeInstanceOf(PiperBusyError);
    await received(children[1], 1);
    expect(pool.inFlight).toBe(2);
    expect(children).toHaveLength(2); // Swedish has not started
    await c;
    children[0].answer([1, 0]);
    children[1].answer([1, 0]);
    await Promise.all([a, b]);
    expect(pool.inFlight).toBe(0);
  });

  it("gives a freed slot to a waiting request", async () => {
    const { pool, children } = setup({ slotWaitMs: 1000 });
    const a = pool.synthesise("A.", "en");
    const b = pool.synthesise("B.", "fi");
    const c = pool.synthesise("C.", "sv");
    await received(children[1], 1);
    children[0].answer([1, 0]);
    await a;
    await until(() => children.length === 3);
    await received(children[2], 1);
    expect(children[2].texts).toEqual(["C."]);
    children[2].answer([1, 0]);
    children[1].answer([1, 0]);
    await Promise.all([b, c]);
    expect(pool.inFlight).toBe(0);
  });

  it("answers an abort at once and keeps the process in step", async () => {
    const { pool, children } = setup();
    const abort = new AbortController();
    const a = expect(pool.synthesise("Cancelled.", "en", abort.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    await received(children[0], 1);
    abort.abort();
    await a;
    const b = pool.synthesise("Next.", "en");
    children[0].answer([9, 9]); // the end of the cancelled sentence
    await received(children[0], 2);
    children[0].answer([7, 7]);
    expect([...(await b).subarray(44)]).toEqual([7, 7]);
    expect(pool.inFlight).toBe(0);
  });

  it("never writes an aborted sentence that was still queued", async () => {
    const { pool, children } = setup();
    const abort = new AbortController();
    const a = pool.synthesise("Running.", "en");
    await received(children[0], 1);
    const b = pool.synthesise("Queued.", "en", abort.signal);
    const bRejected = expect(b).rejects.toMatchObject({ name: "AbortError" });
    await tick();
    abort.abort();
    await bRejected;
    const c = pool.synthesise("Next.", "en");
    children[0].answer([1, 0]);
    await a;
    await received(children[0], 2);
    expect(children[0].texts).toEqual(["Running.", "Next."]);
    children[0].answer([2, 0]);
    await c;
  });

  it("keeps the slot of an aborted running sentence until Piper finishes it", async () => {
    const { pool, children } = setup({ slotWaitMs: 20 });
    const abort = new AbortController();
    const a = pool.synthesise("A.", "en", abort.signal);
    const aRejected = expect(a).rejects.toMatchObject({ name: "AbortError" });
    const b = pool.synthesise("B.", "fi");
    await received(children[0], 1);
    await received(children[1], 1);
    abort.abort();
    await aRejected;
    expect(pool.inFlight).toBe(2);
    await expect(pool.synthesise("C.", "sv")).rejects.toBeInstanceOf(PiperBusyError);
    children[0].answer([1, 0]);
    await until(() => pool.inFlight === 1);
    children[1].answer([1, 0]);
    await b;
    expect(pool.inFlight).toBe(0);
  });

  it("never logs the text", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    try {
      const { pool, children } = setup({ sentenceTimeoutMs: 300 });
      const secret = "My private sentence about Ruusu.";
      const ok = pool.synthesise(secret, "en");
      await received(children[0], 1);
      children[0].err.emit("data", `[debug] phonemes for ${secret}\n`);
      children[0].answer([1, 0]);
      await ok;
      await pool.synthesise(secret, "fi").catch(() => {}); // times out
      const a = pool.synthesise(secret, "sv").then(
        () => "resolved",
        (e: Error) => e.message,
      );
      await received(children[2], 1);
      children[2].crash();
      expect(await a).not.toContain("Ruusu");
      for (const spy of spies) {
        for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain("Ruusu");
      }
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});
