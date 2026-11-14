import { describe, expect, it } from "vitest";
import { createResampler, createSegmenter, levelOf, toPcm16 } from "./pcm";

function tone(freq: number, rate: number, seconds: number, amp = 0.5): Float32Array {
  const out = new Float32Array(Math.round(rate * seconds));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}

function rms(x: Float32Array, from = 0, to = x.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / (to - from));
}

function resampleWhole(x: Float32Array, rate: number): Float32Array {
  const r = createResampler(rate);
  return concat([r.push(x), r.flush()]);
}

function concat(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function db(ratio: number): number {
  return 20 * Math.log10(ratio);
}

describe("createResampler", () => {
  for (const rate of [48000, 44100]) {
    it(`keeps a 1 kHz tone and removes a 12 kHz tone at ${rate}`, () => {
      const pass = resampleWhole(tone(1000, rate, 1), rate);
      const a = Math.floor(pass.length * 0.2);
      const b = Math.floor(pass.length * 0.8);
      expect(Math.abs(db(rms(pass, a, b) / rms(tone(1000, rate, 1))))).toBeLessThan(1);

      const stop = resampleWhole(tone(12000, rate, 1), rate);
      expect(db(rms(stop, a, b) / rms(tone(12000, rate, 1)))).toBeLessThan(-30);
    });
  }

  it("gives the same samples whatever the chunk size", () => {
    for (const rate of [48000, 44100]) {
      const x = tone(700, rate, 0.5);
      const whole = resampleWhole(x, rate);
      for (const size of [1, 7, 128, 1000, 4096]) {
        const r = createResampler(rate);
        const parts: Float32Array[] = [];
        for (let i = 0; i < x.length; i += size) parts.push(r.push(x.subarray(i, i + size)));
        parts.push(r.flush());
        const got = concat(parts);
        expect(got.length).toBe(whole.length);
        let worst = 0;
        for (let i = 0; i < got.length; i++) worst = Math.max(worst, Math.abs(got[i] - whole[i]));
        expect(worst).toBeLessThan(1e-4);
      }
    }
  });

  it("produces about input length times the ratio", () => {
    for (const rate of [48000, 44100]) {
      const out = resampleWhole(tone(300, rate, 2), rate);
      expect(Math.abs(out.length - (2 * rate * 16000) / rate)).toBeLessThanOrEqual(2);
    }
  });

  it("passes equal rates through as a copy", () => {
    const x = tone(440, 16000, 0.1);
    const r = createResampler(16000);
    const y = r.push(x);
    expect(y).not.toBe(x);
    expect(Array.from(y)).toEqual(Array.from(x));
    expect(r.flush().length).toBe(0);
  });

  it("starts afresh after flush", () => {
    const x = tone(500, 48000, 0.2);
    const r = createResampler(48000);
    const first = concat([r.push(x), r.flush()]);
    const second = concat([r.push(x), r.flush()]);
    expect(Array.from(second)).toEqual(Array.from(first));
  });
});

describe("toPcm16", () => {
  it("scales, clips and zeroes NaN", () => {
    const out = toPcm16(new Float32Array([0, 0.5, -0.5, 1, -1, 2, -3, NaN]));
    expect(Array.from(out)).toEqual([0, 16384, -16384, 32767, -32768, 32767, -32768, 0]);
  });
});

describe("levelOf", () => {
  it("uses the micMeter scale", () => {
    expect(levelOf(new Float32Array(0))).toBe(0);
    expect(levelOf(new Float32Array(100).fill(0.1))).toBeCloseTo(0.3, 5);
    expect(levelOf(new Float32Array(100).fill(0.9))).toBe(1);
  });
});

const RATE = 16000;

function burst(seconds: number, amp = 0.3): Float32Array {
  return tone(220, RATE, seconds, amp);
}
function silence(seconds: number): Float32Array {
  return new Float32Array(Math.round(seconds * RATE));
}
function noise(seconds: number, amp: number, seed = 1): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  let s = seed;
  for (let i = 0; i < out.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = amp * ((s / 2 ** 32) * 2 - 1);
  }
  return out;
}
function mix(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
  return out;
}

function runSegmenter(input: Float32Array, chunk = 1600) {
  const seg = createSegmenter();
  const pieces: Float32Array[] = [];
  for (let i = 0; i < input.length; i += chunk) pieces.push(...seg.push(input.subarray(i, i + chunk)));
  const cuts = pieces.length;
  pieces.push(seg.flush());
  return { pieces, cuts };
}

function expectLossless(input: Float32Array, pieces: Float32Array[]) {
  const all = concat(pieces);
  expect(all.length).toBe(input.length);
  for (let i = 0; i < input.length; i++) {
    if (all[i] !== input[i]) throw new Error(`sample ${i} differs`);
  }
}

describe("createSegmenter", () => {
  it("cuts inside the pauses of speech-like audio", () => {
    const parts: Float32Array[] = [];
    const pauses: Array<[number, number]> = [];
    let t = 0;
    for (let i = 0; i < 5; i++) {
      const b = burst(2.2 + i * 0.3);
      parts.push(b);
      t += b.length;
      const s = silence(0.8);
      pauses.push([t, t + s.length]);
      parts.push(s);
      t += s.length;
    }
    const input = concat(parts);
    const { pieces, cuts } = runSegmenter(input);
    expect(cuts).toBeGreaterThan(0);
    expectLossless(input, pieces);
    let at = 0;
    for (let i = 0; i < cuts; i++) {
      at += pieces[i].length;
      expect(pieces[i].length).toBeGreaterThanOrEqual(3 * RATE);
      expect(pieces[i].length).toBeLessThanOrEqual(14 * RATE);
      expect(pauses.some(([a, b]) => at >= a && at <= b)).toBe(true);
    }
  });

  it("does not cut before minSeconds", () => {
    const input = concat([burst(1), silence(1), burst(1), silence(1.5)]);
    const { pieces, cuts } = runSegmenter(input);
    for (let i = 0; i < cuts; i++) expect(pieces[i].length).toBeGreaterThanOrEqual(3 * RATE);
    expectLossless(input, pieces);
  });

  it("cuts a steady tone at maxSeconds", () => {
    const input = burst(35);
    const { pieces, cuts } = runSegmenter(input);
    expect(cuts).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < cuts; i++) {
      expect(pieces[i].length).toBeLessThanOrEqual(14 * RATE);
      expect(pieces[i].length).toBeGreaterThan(10 * RATE);
    }
    expectLossless(input, pieces);
  });

  it("copes with speech over background noise at a fifth of its level", () => {
    const parts: Float32Array[] = [];
    for (let i = 0; i < 6; i++) parts.push(burst(3), silence(0.8));
    const speech = concat(parts);
    const input = mix(speech, noise(speech.length / RATE, 0.3 * 0.7 * 0.2));
    const { pieces, cuts } = runSegmenter(input, 777);
    for (let i = 0; i < cuts; i++) expect(pieces[i].length).toBeLessThanOrEqual(14 * RATE);
    expectLossless(input, pieces);
  });

  it("is lossless for odd chunk sizes and silence only", () => {
    const input = concat([burst(4), silence(1), burst(5), silence(0.6), burst(20)]);
    for (const size of [1, 333, 5000, 100000]) {
      const { pieces } = runSegmenter(input, size);
      expectLossless(input, pieces);
    }
    const quiet = silence(20);
    const { pieces, cuts } = runSegmenter(quiet);
    expect(cuts).toBeGreaterThanOrEqual(1);
    expectLossless(quiet, pieces);
  });

  it("flush on nothing is empty and resets", () => {
    const seg = createSegmenter();
    expect(seg.flush().length).toBe(0);
    seg.push(burst(1));
    expect(seg.flush().length).toBe(RATE);
    expect(seg.flush().length).toBe(0);
  });
});
