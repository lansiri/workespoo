# Voice on our own server, part C: the adapter that listens through our server

Read first: `docs/research/voice-stt.md`, `src/contracts/voice.ts` (`VoiceAdapter`, the `server` id, `STT_*`, `SttResponse`), then `src/features/voice/adapters/browser.ts`, `controller.ts`, `useVoice.ts`, `select.ts`, `playback.ts`. Two files you build on are being written by other builders at this moment and exist as placeholders with binding signatures: `src/features/voice/pcm.ts` and `src/features/voice/capture.ts` (their bodies throw in your worktree). Import them as they are; in your tests replace them (`vi.mock`) or inject fakes.

Paths: `src/features/voice/speech.ts` (new), `src/features/voice/adapters/server.ts` (new) and its test, `src/features/voice/adapters/browser.ts` and its test, `src/features/voice/select.ts` and its test, `src/features/voice/useVoice.ts`, `src/features/voice/controller.ts` and its test, `src/features/voice/messages.ts`, `src/app/dev/voice/**`, and in `src/features/interview/InterviewRoom.tsx` only the change in step 6. Not `pcm.ts`, not `capture.ts`, not anything under `server/` or `src/app/api`. No new dependency.

## Build

1. **`speech.ts`: the speaking side, shared.** Move what `browser.ts` does to speak (our server through `PlaybackQueue`, the fall back to `speechSynthesis` for good after a 503, `speakWithSynth`, the unlock inside a gesture, `cancel`, `getOutputLevel`, `dispose`) into `createSpeechOutput(options)` and have `browser.ts` use it. Behaviour must not change: `browser.test.ts` keeps passing with at most mechanical edits.

2. **`adapters/server.ts`: `createServerAdapter(options)`**, a `VoiceAdapter` with `id: "server"` and `supportsPartials: true`. Options, all injectable for tests: `endpoint` (default `/api/voice/stt`), `fetch`, `startCapture` / `unlockCapture` / `captureSupported` (defaults from `../capture`), the speaking options that `speech.ts` takes, `releaseTailMs` (default 200), a sleep and a clock.
   - `prepare()`: synchronously, before any await: unlock the speech output and call `unlockCapture()`. Not supported: `VoiceError("unsupported")`. It does not open the microphone (the first press does, which is when the browser asks for permission).
   - `startListening(handlers)`: cancel speech, reset, `await startCapture(...)`. Each chunk: `handlers.onLevel?.(levelOf(chunk))`; resample to 16 kHz (create the resampler from the chunk's rate, again if the rate ever changes); feed the segmenter; send every finished segment.
   - Sending: one request at a time, in order: `POST` with the segment as `toPcm16(...)` bytes, `Content-Type: application/octet-stream`, answer parsed with `SttResponse`. A segment under `STT_MIN_SECONDS` is not sent. After each answer call `handlers.onPartial?.(text so far)`: the answers joined in order with single spaces.
   - Trying again: network failure, 5xx except 503, and 429 are tried again after 1.2 s and then after 3 s (a 429's `Retry-After`, capped at 3 s, replaces the wait). 400, 401, 403, 413 and 503 are not. A segment that fails for good marks the press as failed; nothing is reported while the button is still held.
   - `stopListening()`: keep capturing for `releaseTailMs` (the last syllable), stop the capture, flush the resampler and the segmenter, send what is left, wait for every answer (at most 25 s in all). A failed press rejects: `VoiceError("unavailable")` for a network failure or 503, `mic-denied` if the capture reported that, otherwise `failed`. Else resolve with the whole text. A press with no capture, or stopped before the capture started, resolves with `""`.
   - A capture error after the start (`onError`) goes to `handlers.onError`.
   - `speak`, `cancelSpeech`, `getOutputLevel`: from `speech.ts`. `dispose()`: stop the capture, abort requests in flight, dispose the speech output.
   - No audio and no text is kept after the press, logged, or put in storage.

3. **`controller.ts`**: partial text is also taken while the status is `transcribing` (the answers to the last segments arrive after the button is released), still only for the current press. Add the test.

4. **`select.ts` and `useVoice.ts`**: `server` is a runnable adapter. `selectAdapterId` returns it when the config says `server` (and for a manual override). `useVoice` creates the server adapter once, like the browser one, with the same speaking options; `speakingEngine` for it follows the same rule as for `browser`.

5. **`browser.ts`**, now the fallback: on Android (`/Android/i` on the user agent) do not start the level meter, because the second microphone stream is what silences the recogniser there. Add the test.

6. **`InterviewRoom.tsx`**: the live words box (`WordsBox mode="live"`) is also shown while voice is on and the status is `transcribing`, with `voice.partial`, so the words do not vanish between letting go and the answer being sent. Nothing else changes there.

7. **`/dev/voice`**: add `server` to the forced-adapter choices and say which engine listens (`messages.ts`, three languages: "our server (Parakeet)", "oma palvelimemme (Parakeet)", "vår server (Parakeet)").

8. **Tests** for `server.ts` with a fake capture, fake `fetch`, fake timers: chunks become ordered requests whose bodies are the PCM bytes; partials grow in order; the tail after release is captured and sent; a short last piece is not sent; the retry rules status by status, including `Retry-After`; a press that failed rejects and one that recovered on the second try does not; the 25 s limit; stop before start; a capture error; `dispose` aborts; `prepare` does its unlocking before the first await and throws `unsupported` when capture is not supported; speech still goes through the shared output. Plus the controller, select and browser tests named above.

## Watch out for

- Order matters: an answer must never be placed before an earlier segment's answer.
- The person may release at any moment: during `startCapture`, between chunks, while a request is in flight. Every such case ends in a resolved or rejected `stopListening`, never a hang.
- The existing behaviour of the `browser` and `elevenlabs` adapters stays as it is, apart from step 5.
