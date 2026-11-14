import { STT_SAMPLE_RATE } from "@/contracts/voice";

/**
 * Plain arithmetic on audio samples for the `server` voice adapter: bring the microphone's audio
 * to 16 kHz, find a pause at which the speech so far can be sent, and pack it as 16-bit PCM.
 *
 * Nothing here looks at who is speaking or how: no pitch, tone, emotion or speaker features. The
 * only thing measured is loudness, to draw the level meter and to find a pause to cut at. No
 * sample is stored or logged; every buffer is handed on and forgotten.
 *
 * No browser API is used, so everything is testable with plain arrays.
 */

/** Turns audio at the microphone's rate into 16 kHz, a chunk at a time, keeping state between chunks. */
export interface Resampler {
  /** Returns the 16 kHz samples that are ready (possibly none). The input is not kept or changed. */
  push(chunk: Float32Array): Float32Array;
  /** The last samples the filter still holds back, at the end of a recording. Resets the resampler. */
  flush(): Float32Array;
}

/**
 * A streaming resampler with a low-pass filter in front of the rate change, so that sound above
 * 8 kHz does not fold down into the speech band. `fromRate` is whatever the audio context runs at
 * (44 100 or 48 000 on most devices; 16 000 passes through untouched).
 *
 * A windowed-sinc kernel is evaluated at each output position. Positions are kept as exact
 * fractions (`n * fromRate / toRate`), so the result does not depend on how the input is chunked.
 */
export function createResampler(fromRate: number, toRate: number = STT_SAMPLE_RATE): Resampler {
  const from = Math.round(fromRate);
  const to = Math.round(toRate);
  if (!(from > 0) || !(to > 0)) throw new RangeError("sample rates must be positive");
  if (from === to) {
    return {
      push: (chunk) => new Float32Array(chunk),
      flush: () => new Float32Array(0),
    };
  }

  // Cut-off a little under half of the lower rate, in cycles per input sample.
  const cutoff = (0.45 * Math.min(from, to)) / from;
  const half = Math.ceil(16 / (2 * cutoff)); // 16 lobes each side of the centre
  const taps = 2 * half;
  const kernels = new Map<number, Float32Array>();

  const kernelFor = (rem: number): Float32Array => {
    const cached = kernels.get(rem);
    if (cached) return cached;
    const frac = rem / to; // position of the output between input samples floor and floor + 1
    const w = new Float32Array(taps);
    let sum = 0;
    for (let k = 0; k < taps; k++) {
      const t = k - half + 1 - frac; // input index minus output position
      const x = 2 * cutoff * t;
      const sinc = Math.abs(x) < 1e-12 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const a = (Math.PI * t) / half;
      const win = 0.42 + 0.5 * Math.cos(a) + 0.08 * Math.cos(2 * a);
      const v = 2 * cutoff * sinc * win;
      w[k] = v;
      sum += v;
    }
    for (let k = 0; k < taps; k++) w[k] /= sum;
    kernels.set(rem, w);
    return w;
  };

  let held = new Float32Array(0); // input from absolute index `base`
  let base = 0;
  let total = 0; // input samples seen
  let n = 0; // next output index

  const run = (final: boolean): Float32Array => {
    const out: number[] = [];
    for (;;) {
      const num = n * from;
      const idx = Math.floor(num / to);
      const rem = num - idx * to;
      if (final ? idx >= total : idx + half >= total) break;
      const w = kernelFor(rem);
      let acc = 0;
      const start = idx - half + 1;
      for (let k = 0; k < taps; k++) {
        const i = start + k;
        if (i < 0 || i >= total) continue;
        acc += w[k] * held[i - base];
      }
      out.push(acc);
      n++;
    }
    // Drop input no later output needs.
    const keepFrom = Math.max(base, Math.floor((n * from) / to) - half + 1);
    if (keepFrom > base) {
      held = held.slice(keepFrom - base);
      base = keepFrom;
    }
    return Float32Array.from(out);
  };

  return {
    push(chunk) {
      if (chunk.length === 0) return new Float32Array(0);
      const next = new Float32Array(held.length + chunk.length);
      next.set(held);
      next.set(chunk, held.length);
      held = next;
      total += chunk.length;
      return run(false);
    },
    flush() {
      const out = run(true);
      held = new Float32Array(0);
      base = 0;
      total = 0;
      n = 0;
      return out;
    },
  };
}

/** Samples in [-1, 1] as signed 16-bit PCM. Values outside the range are clipped; NaN becomes 0. */
export function toPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    if (!(v === v)) continue;
    const c = v > 1 ? 1 : v < -1 ? -1 : v;
    out[i] = Math.round(c < 0 ? c * 32768 : c * 32767);
  }
  return out;
}

/**
 * Loudness of a chunk from 0 to 1 for the level meter: root mean square times three, capped at 1
 * (the same scale `micMeter.ts` uses). An empty chunk is 0.
 */
export function levelOf(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.min(1, Math.sqrt(sum / samples.length) * 3);
}

export interface SegmenterOptions {
  /** Rate of the samples fed in. Default 16 000. */
  sampleRate?: number;
  /** No cut is made before a segment holds this much audio. Default 3 seconds. */
  minSeconds?: number;
  /** A quiet stretch this long counts as a pause. Default 0.45 seconds. */
  pauseSeconds?: number;
  /** A segment is cut here even when no pause was found. Default 14 seconds. */
  maxSeconds?: number;
}

/**
 * Cuts one press of the talk button into segments that can be sent while the person is still
 * speaking. Every sample fed in comes out exactly once, in order: the segments returned by `push`
 * followed by `flush()` are the input, nothing lost and nothing repeated.
 */
export interface Segmenter {
  /** Feed 16 kHz samples. Returns the segments that are finished: usually none, sometimes one. */
  push(samples: Float32Array): Float32Array[];
  /** Everything not yet returned, at the end of the press. May be empty. Resets the segmenter. */
  flush(): Float32Array;
}

/**
 * - Once a segment holds `minSeconds` and a pause of `pauseSeconds` is seen, the segment is cut in
 *   the middle of that pause.
 * - With no pause (a noisy hall, or someone who does not stop), the segment is cut when it reaches
 *   `maxSeconds`, at the quietest tenth of a second of its last three seconds, so a word is split
 *   as rarely as possible.
 * - "Quiet" is relative to the loudest speech heard in this press, never an absolute level, so a
 *   quiet microphone and a loud one behave alike.
 */
export function createSegmenter(options: SegmenterOptions = {}): Segmenter {
  const rate = options.sampleRate ?? STT_SAMPLE_RATE;
  const minSamples = Math.round((options.minSeconds ?? 3) * rate);
  const pauseSamples = Math.round((options.pauseSeconds ?? 0.45) * rate);
  const maxSamples = Math.round((options.maxSeconds ?? 14) * rate);
  const F = Math.max(1, Math.round(rate * 0.02)); // 20 ms frame
  const searchFrames = Math.round(3 / 0.02); // last three seconds
  const dipFrames = 5; // a tenth of a second
  const LOUD_DECAY = 0.997; // per frame: the bar falls slowly, so one cough does not set it for good
  const LOUD_FLOOR = 0.002; // below this nothing counts as speech yet

  let seg = new Float32Array(Math.max(maxSamples + F, 1024));
  let len = 0;
  let framed = 0; // frames measured in the current segment
  let rms: number[] = [];
  let runLen = 0; // consecutive quiet frames ending at the last frame
  let tracked = 0; // samples of the current segment already counted in `loud`
  let loud = 0;

  const reset = () => {
    len = 0;
    framed = 0;
    rms = [];
    runLen = 0;
    tracked = 0;
    loud = 0;
  };

  const cutAt = (c: number, out: Float32Array[]) => {
    out.push(seg.slice(0, c));
    seg.copyWithin(0, c, len);
    len -= c;
    tracked = Math.max(0, tracked - c);
    framed = 0;
    rms = [];
    runLen = 0;
  };

  const quietestCentre = (): number => {
    const first = Math.max(0, framed - searchFrames);
    let best = Infinity;
    let bestStart = first;
    for (let a = first; a + dipFrames <= framed; a++) {
      let e = 0;
      for (let k = 0; k < dipFrames; k++) e += rms[a + k] * rms[a + k];
      if (e < best) {
        best = e;
        bestStart = a;
      }
    }
    return Math.round(((bestStart + dipFrames / 2) * F));
  };

  const process = (out: Float32Array[]) => {
    while ((framed + 1) * F <= len) {
      const f = framed;
      let sum = 0;
      for (let i = f * F; i < (f + 1) * F; i++) sum += seg[i] * seg[i];
      const r = Math.sqrt(sum / F);
      rms.push(r);
      framed++;
      if ((f + 1) * F > tracked) {
        loud = Math.max(r, loud * LOUD_DECAY);
        tracked = (f + 1) * F;
      }
      const quiet = loud >= LOUD_FLOOR && r < loud / 8;
      runLen = quiet ? runLen + 1 : 0;

      if (runLen * F >= pauseSamples) {
        const startS = (framed - runLen) * F;
        const c = Math.round((startS + framed * F) / 2);
        if (c >= minSamples && c > 0) {
          cutAt(c, out);
          continue;
        }
      }
      if (framed * F >= maxSamples) {
        const c = quietestCentre();
        cutAt(Math.min(Math.max(c, 1), len), out);
      }
    }
  };

  return {
    push(samples) {
      const out: Float32Array[] = [];
      let pos = 0;
      // Feed in slices so the buffer never holds much more than a segment before it is examined.
      while (pos < samples.length) {
        const room = seg.length - len;
        if (room <= 0) {
          const bigger = new Float32Array(seg.length * 2);
          bigger.set(seg.subarray(0, len));
          seg = bigger;
          continue;
        }
        const k = Math.min(room, samples.length - pos);
        seg.set(samples.subarray(pos, pos + k), len);
        len += k;
        pos += k;
        process(out);
      }
      return out;
    },
    flush() {
      const rest = seg.slice(0, len);
      reset();
      return rest;
    },
  };
}
