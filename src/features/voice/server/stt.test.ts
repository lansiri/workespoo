import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SttBusyError,
  SttClient,
  SttFailedError,
  cleanText,
  type SttSocket,
} from "./stt";

type Listener = (event: { data?: unknown }) => void;

class FakeSocket implements SttSocket {
  static all: FakeSocket[] = [];
  static autoOpen = true;
  binaryType = "";
  sent: Array<string | Uint8Array> = [];
  closeCalls = 0;
  autoClose = true;
  private listeners = new Map<string, Listener[]>();
  constructor(public url: string) {
    FakeSocket.all.push(this);
    if (FakeSocket.autoOpen) queueMicrotask(() => this.emit("open"));
  }
  addEventListener(type: string, l: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), l]);
  }
  send(data: string | Uint8Array) {
    this.sent.push(data);
  }
  close() {
    this.closeCalls++;
    if (this.autoClose) queueMicrotask(() => this.emit("close"));
  }
  emit(type: string, data?: unknown) {
    for (const l of this.listeners.get(type) ?? []) l({ data });
  }
  get frames(): Uint8Array[] {
    return this.sent.filter((x): x is Uint8Array => typeof x !== "string");
  }
  get texts(): string[] {
    return this.sent.filter((x): x is string => typeof x === "string");
  }
  answer(text: string) {
    this.emit("message", JSON.stringify({ text }));
  }
}

const Ctor = FakeSocket as unknown as new (url: string) => SttSocket;
const speech = (seconds = 1, value = 100) => new Int16Array(Math.round(seconds * 16000)).fill(value);
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
const client = (o: ConstructorParameters<typeof SttClient>[0] = {}) =>
  new SttClient({ url: "ws://stt:6006", WebSocket: Ctor, ...o });

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.all = [];
  FakeSocket.autoOpen = true;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("transcribe", () => {
  it("sends the header and float samples, then Done after the answer", async () => {
    const c = client();
    const pcm = new Int16Array(4000).fill(0);
    pcm[0] = -32768;
    pcm[1] = 16384;
    const p = c.transcribe(pcm);
    await flush();
    const ws = FakeSocket.all[0];
    const bytes = Buffer.concat(ws.frames);
    expect(bytes.readInt32LE(0)).toBe(16000);
    expect(bytes.readInt32LE(4)).toBe(16000);
    expect(bytes.length).toBe(8 + 16000);
    expect(bytes.readFloatLE(8)).toBe(-1);
    expect(bytes.readFloatLE(12)).toBe(0.5);
    expect(ws.texts).toEqual([]);
    ws.answer("Hello");
    await expect(p).resolves.toBe("Hello");
    expect(ws.texts).toEqual(["Done"]);
    ws.emit("close");
  });

  it("splits into frames of at most 64 KiB that add up to the announced length", async () => {
    const c = client();
    const p = c.transcribe(speech(10));
    await flush();
    const ws = FakeSocket.all[0];
    expect(ws.frames.length).toBeGreaterThan(1);
    for (const f of ws.frames) expect(f.length).toBeLessThanOrEqual(64 * 1024);
    const total = ws.frames.reduce((n, f) => n + f.length, 0);
    expect(total).toBe(8 + Buffer.concat(ws.frames).readInt32LE(4));
    ws.answer("x");
    await p;
    ws.emit("close");
  });

  it("opens nothing for a recording that is too short", async () => {
    const c = client();
    await expect(c.transcribe(new Int16Array(0))).resolves.toBe("");
    await expect(c.transcribe(new Int16Array(1))).resolves.toBe("");
    await expect(c.transcribe(new Int16Array(3999))).resolves.toBe("");
    expect(FakeSocket.all).toHaveLength(0);
  });

  it("rejects a recording that is too long without opening", async () => {
    const c = client();
    await expect(c.transcribe(new Int16Array(30 * 16000 + 1))).rejects.toBeInstanceOf(
      SttFailedError,
    );
    expect(FakeSocket.all).toHaveLength(0);
  });

  it("cleans <unk> and whitespace", async () => {
    expect(cleanText("  hello <unk>  <unk> world \n")).toBe("hello world");
    const c = client();
    const p = c.transcribe(speech());
    await flush();
    FakeSocket.all[0].answer(" a  <unk>b ");
    await expect(p).resolves.toBe("a b");
  });

  it("fails on an answer that is not JSON, without a retry", async () => {
    const c = client();
    const p = c.transcribe(speech());
    const seen = expect(p).rejects.toBeInstanceOf(SttFailedError);
    await flush();
    FakeSocket.all[0].emit("message", "not json");
    await seen;
    expect(FakeSocket.all).toHaveLength(1);
  });

  it("gives up after 20 seconds", async () => {
    const c = client();
    const p = c.transcribe(speech());
    const seen = expect(p).rejects.toThrow(/timed out/);
    await flush();
    await vi.advanceTimersByTimeAsync(20_000);
    await seen;
    expect(FakeSocket.all[0].closeCalls).toBe(1);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it("retries once after a connection that dies, then fails", async () => {
    const c = client();
    const p = c.transcribe(speech());
    const seen = expect(p).rejects.toBeInstanceOf(SttFailedError);
    await flush();
    FakeSocket.all[0].emit("close");
    await flush();
    expect(FakeSocket.all).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(FakeSocket.all).toHaveLength(2);
    FakeSocket.all[1].emit("error");
    await seen;
    expect(FakeSocket.all).toHaveLength(2);
  });

  it("answers from the second connection", async () => {
    const c = client();
    const p = c.transcribe(speech());
    await flush();
    FakeSocket.all[0].emit("error");
    await vi.advanceTimersByTimeAsync(1500);
    FakeSocket.all[1].answer("again");
    await expect(p).resolves.toBe("again");
    // the recording was sent again in full
    expect(FakeSocket.all[1].frames.length).toBeGreaterThan(0);
  });

  it("turns the third caller away after 4 s, and lets it in when a slot frees", async () => {
    const c = client();
    const a = c.transcribe(speech());
    const b = c.transcribe(speech());
    const third = c.transcribe(speech());
    const rejected = expect(third).rejects.toBeInstanceOf(SttBusyError);
    await flush();
    expect(FakeSocket.all).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(4000);
    await rejected;

    const fourth = c.transcribe(speech());
    await flush();
    expect(FakeSocket.all).toHaveLength(2);
    FakeSocket.all[0].answer("one");
    await a;
    FakeSocket.all[0].emit("close");
    await flush();
    expect(FakeSocket.all).toHaveLength(3);
    FakeSocket.all[2].answer("four");
    await expect(fourth).resolves.toBe("four");
    FakeSocket.all[1].answer("two");
    await b;
  });

  it("holds the slot until the socket has really closed", async () => {
    const c = client({ maxConcurrent: 1 });
    const a = c.transcribe(speech());
    await flush();
    FakeSocket.all[0].answer("one");
    await a;
    const b = c.transcribe(speech());
    await flush();
    expect(c.inFlight).toBe(1);
    expect(FakeSocket.all).toHaveLength(1);
    FakeSocket.all[0].emit("close");
    await flush();
    expect(FakeSocket.all).toHaveLength(2);
    FakeSocket.all[1].answer("two");
    await expect(b).resolves.toBe("two");
  });

  it("rejects at once when aborted before", async () => {
    const c = client();
    const ctl = new AbortController();
    ctl.abort();
    await expect(c.transcribe(speech(), { signal: ctl.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(FakeSocket.all).toHaveLength(0);
  });

  it("closes the socket and rejects at once when aborted during, freeing the slot after close", async () => {
    const c = client({ maxConcurrent: 1 });
    const ctl = new AbortController();
    const p = c.transcribe(speech(), { signal: ctl.signal });
    const seen = expect(p).rejects.toMatchObject({ name: "AbortError" });
    await flush();
    FakeSocket.all[0].autoClose = false;
    ctl.abort();
    await seen;
    expect(FakeSocket.all[0].closeCalls).toBe(1);
    expect(c.inFlight).toBe(1);
    FakeSocket.all[0].emit("close");
    await flush();
    expect(c.inFlight).toBe(0);
  });
});

describe("available", () => {
  it("is false with no URL or no WebSocket, without a connection", async () => {
    expect(await client({ url: "  " }).available()).toBe(false);
    expect(await client({ WebSocket: null }).available()).toBe(false);
    expect(FakeSocket.all).toHaveLength(0);
  });

  it("probes, sends Done, remembers true for 15 s", async () => {
    let t = 0;
    const c = client({ now: () => t });
    expect(await c.available()).toBe(true);
    expect(FakeSocket.all[0].texts).toEqual(["Done"]);
    t = 14_999;
    expect(await c.available()).toBe(true);
    expect(FakeSocket.all).toHaveLength(1);
    t = 15_000;
    expect(await c.available()).toBe(true);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it("remembers false for 3 s and shares one probe", async () => {
    let t = 0;
    FakeSocket.autoOpen = false;
    const c = client({ now: () => t });
    const [a, b] = [c.available(), c.available()];
    await flush();
    expect(FakeSocket.all).toHaveLength(1);
    FakeSocket.all[0].emit("error");
    expect([await a, await b]).toEqual([false, false]);
    t = 2999;
    expect(await c.available()).toBe(false);
    expect(FakeSocket.all).toHaveLength(1);
    t = 3000;
    const next = c.available();
    await flush();
    expect(FakeSocket.all).toHaveLength(2);
    FakeSocket.all[1].emit("open");
    expect(await next).toBe(true);
  });

  it("gives up on a probe after 1.5 s", async () => {
    FakeSocket.autoOpen = false;
    const c = client();
    const p = c.available();
    await vi.advanceTimersByTimeAsync(1500);
    expect(await p).toBe(false);
  });

  it("counts a successful recording as a fresh true", async () => {
    let t = 0;
    FakeSocket.autoOpen = true;
    const c = client({ now: () => t });
    const p = c.transcribe(speech());
    await flush();
    FakeSocket.all[0].answer("x");
    await p;
    t = 100;
    expect(await c.available()).toBe(true);
    expect(FakeSocket.all).toHaveLength(1);
  });
});
