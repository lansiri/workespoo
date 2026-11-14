# Voice on our own server, part B: capturing the microphone and preparing the audio

Read first: `docs/research/voice-stt.md` ("Why the browser's recognition had to go", "How the browser sends speech"), then the two placeholder files, whose doc comments are the specification: `src/features/voice/pcm.ts` and `src/features/voice/capture.ts`. Keep every exported name and type exactly: another builder is writing the adapter against them at the same moment. Look at `src/features/voice/micMeter.ts` and `errors.ts` for the existing style.

Paths: `src/features/voice/pcm.ts`, `pcm.test.ts`, `capture.ts`, `capture.test.ts`. Nothing else. No new dependency.

## Build

1. **`pcm.ts`** (plain arithmetic, no browser API).
   - `createResampler(fromRate, toRate = 16000)`: a windowed-sinc low-pass evaluated at each output position (this handles 44 100 to 16 000 as well as 48 000 to 16 000), cut-off a little under half the lower rate, with enough taps to hold a 12 kHz tone at least 30 dB down while a 1 kHz tone keeps its level within 1 dB. It keeps the tail it needs between chunks: pushing a signal in pieces of any size gives the same samples as pushing it whole (to 1e-4). `flush()` returns what is still held and resets. Equal rates pass through as a copy. Output length is the input length times `toRate / fromRate`, give or take a sample or two over the whole recording.
   - `toPcm16`, `levelOf`: as their comments say.
   - `createSegmenter`: as its comment says. The invariant that matters most: every sample comes out exactly once and in order. Work on frames of 20 ms. "Quiet" means a frame's root mean square is below about an eighth of the loudest frames of this press (track that loudness with a slow decay so one cough does not set the bar for good); with nothing loud yet, nothing is cut before `maxSeconds`.

2. **`capture.ts`** (browser).
   - One capture `AudioContext` for the page, made lazily (`AudioContext` or `webkitAudioContext`), never given a `sampleRate` (iOS is unreliable at anything but its own rate). `unlockCapture()` creates and resumes it and must be callable synchronously in a gesture; `startMicCapture` also resumes it. A context in the `interrupted` state (iOS after a call) is resumed the same way.
   - `startMicCapture`: `getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`, one stream per call. Then source → capture node → a gain node at 0 → destination (the silent connection keeps every browser pulling the graph).
   - Capture node: an `AudioWorkletNode` when `audioWorklet` exists. The processor's source is a string in this file, loaded once per context from a Blob URL; it copies channel 0, gathers about 2048 frames and posts them (transferring the buffer), and on a `stop` message posts what is left and then a done marker. If anything on that path fails (no `audioWorklet`, `addModule` rejects, the constructor throws), fall back to `createScriptProcessor(4096, 1, 1)` and copy `inputBuffer.getChannelData(0)` in `onaudioprocess`.
   - Every chunk goes to `onChunk(samples, ctx.sampleRate)` with the rate read at that moment.
   - `stop()`: ask the worklet for the rest and wait for the done marker (at most 200 ms), disconnect, stop the stream's tracks, suspend the context. Idempotent; after it no chunk is delivered.
   - A track that ends by itself (`ended`), or a worklet error, calls `onError` once with a `VoiceError("failed")`.
   - Errors from `getUserMedia` go through `toVoiceError` (refusal is `mic-denied`, no device is `unsupported`). No `getUserMedia` or no audio context: `VoiceError("unsupported")`.
   - Take the browser pieces through an optional second argument with defaults (`getUserMedia`, the context constructor, `URL.createObjectURL`), so the tests can hand in fakes.

3. **Tests.**
   - `pcm.test.ts`: the tone tests above at 48 000 and 44 100; chunk-size independence; length; pass-through; `toPcm16` clipping and NaN; `levelOf` against `micMeter`'s scale; the segmenter on synthetic "speech" (bursts of tone with silences between): cuts fall inside the silences, never before `minSeconds`, never a segment over `maxSeconds`, a steady tone is cut at `maxSeconds`, speech over steady background noise at a fifth of its level still cuts at the pauses or at `maxSeconds`, and in every case the pieces concatenated with `flush()` equal the input sample for sample.
   - `capture.test.ts` with fake context, nodes and stream: the worklet path delivers what the processor posts, in order; `stop` waits for the done marker and then stops the tracks; the fallback is taken when `addModule` rejects and when there is no `audioWorklet`; refusal maps to `mic-denied`; a track ending calls `onError`; `stop` twice is safe; nothing is delivered after `stop`; `unlockCapture` never throws without an audio context.

## Watch out for

- Nothing in these files may keep audio after it has been handed on: no module-level buffers, no logging.
- The only thing measured is loudness. No pitch, spectrum, speaker or emotion features, here or in a comment that suggests them.
- The worklet runs in its own global scope: its source must be self-contained plain JavaScript (no imports, no TypeScript).
