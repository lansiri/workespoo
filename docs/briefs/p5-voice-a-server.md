# Voice on our own server, part A: the endpoint that turns audio into text

Read first: `docs/research/voice-stt.md` (the measurements, the websocket protocol, what kills the recogniser), `src/contracts/voice.ts` (the new `server` adapter id, `STT_*` constants, `SttResponse`), `src/features/voice/server/piper.ts` (the pattern to follow for slots, aborts, injection for tests).

Paths: `src/features/voice/server/stt.ts` (a placeholder with the binding signatures is there: keep the exported names and types), `src/features/voice/server/stt.test.ts`, `src/features/voice/server/config.ts`, `src/app/api/voice/stt/route.ts` (new), `src/app/api/voice/config/route.ts`, `src/app/api/voice/voice-routes.test.ts`. Nothing else. No new dependency.

## Build

1. **`stt.ts`: the client of the recogniser.**
   - `sttUrl()`: `STT_URL` from `process.env`, read at the point of use, blank means unset (as `config.ts` does for the ElevenLabs variables).
   - `transcribe(pcm, { signal })`: follows the protocol in the research note exactly. 16-bit samples become 32-bit floats (`value / 32768`); header of two little-endian int32 (16000, byte length); frames of at most 64 KiB; the first text frame is the answer (JSON, take `text`); then send `Done`. One websocket per recording.
   - Fewer samples than `STT_MIN_SECONDS` resolves with `""` **without opening a connection** (an empty recording kills the recogniser). More than `STT_MAX_SECONDS` rejects with `SttFailedError` without opening one.
   - Text clean-up: remove `<unk>`, collapse whitespace, trim.
   - At most two recordings in flight to the recogniser (it takes them one after another); a third waits up to 4 s for a slot and is then rejected with `SttBusyError`. The slot is held until the websocket has really closed.
   - 20 s limit per recording once it has a slot. A connection that fails or closes before the answer: wait 1.5 s and try once more (the container takes 3 s to restart), then `SttFailedError`. An abort closes the socket and rejects with an `AbortError` at once.
   - `sttAvailable()`: false with no URL or no `globalThis.WebSocket`. Otherwise open a connection (1.5 s limit), send `Done`, true if it opened. Remember true for 15 s and false for 3 s; callers at the same moment share one probe; a recording that succeeded counts as a fresh true, a failed connection as a fresh false.
   - Make it testable the way `PiperPool` is: a class that takes `{ url, WebSocket, now, timers… }`, and a module-level default instance behind the three exported functions.
   - The audio and the text are never logged, and no error message holds either.

2. **`POST /api/voice/stt`** (`export const dynamic = "force-dynamic"`):
   - Who may call it: a talent session whose person has an active `voice_vendor` consent (`getSession()` from `src/lib/session`, `hasConsent` from `src/lib/consent`, `getDb()`), or an organiser session (for the test page). No session: 401 `{ error: "unauthenticated" }`. No consent: 403 `{ error: "voice_consent_missing" }`. Remember a yes for a talent id for 60 s (bounded map), never a no.
   - `VOICE_ADAPTER=none` or no `STT_URL`: 503 `{ error: "voice_unavailable" }`.
   - Body: raw PCM as the contract says. `Content-Length` above `STT_MAX_SECONDS * STT_SAMPLE_RATE * 2` bytes: 413 without reading. Read the stream with the same cap (a missing or false length must not get more in): 413. Empty or an odd number of bytes: 400 `{ error: "invalid_request" }`. Copy into an aligned `Int16Array` (a `Buffer` slice can sit at an odd offset), little-endian.
   - Per caller (the talent id, or `organiser`): at most 90 s of audio in any 60 s, in memory, bounded. Over it: 429 `{ error: "voice_rate_limited" }` with `Retry-After`.
   - `transcribe(samples, { signal: request.signal })`. 200 with `SttResponse`. `SttBusyError`: 429 `{ error: "voice_busy" }` with `Retry-After: 1`. Aborted: 499. Anything else: 502 `{ error: "voice_upstream_failed" }`. Every answer `Cache-Control: no-store` (use `json()` from `config.ts`).
   - Nothing about the audio or the text is logged or audited.

3. **`GET /api/voice/config`**: after the `none` and ElevenLabs cases and unless `VOICE_ADAPTER` is `browser`, when `await sttAvailable()` answer `{ adapter: "server", processor: "WorkEspoo's own server", tts: piperAvailable() ? "server" : "browser" }`. Otherwise the browser answer as today. `VOICE_ADAPTER=browser` keeps forcing the browser's recogniser.

4. **Tests** (never a real socket, never a real model):
   - `stt.test.ts` with a fake WebSocket class: the header and the float values on the wire (-32768 is -1, 16384 is 0.5), frames no larger than 64 KiB adding up to the announced length, `Done` after the answer, the short recording that opens nothing, `<unk>` and whitespace clean-up, an answer that is not JSON, the time limit, the retry after a connection that dies and the failure after the second one, the third caller turned away after the wait and let in when a slot frees, abort before and during, the slot released only after close, the availability memory (15 s, 3 s, one shared probe, no WebSocket in the runtime).
   - Route tests in `voice-routes.test.ts` in the style already there (mock the session, consent and `stt` modules): every status above, the exact samples handed to `transcribe`, the consent memory (a second call does not ask the database again; a refusal is asked again), the rate limit across two callers, and the three config answers (`server`, `browser` when the probe says no, `browser` when forced).

## Watch out for

- The recogniser must never get an empty recording: guard in `transcribe` itself, not only in the route.
- Do not hold a recording longer than its request: no caches, no retries that keep a copy after the answer.
- `globalThis.WebSocket` exists on Node 22 (the image) and not on the Node 20 that runs the tests here: inject it.
- `src/lib/env.ts` is not yours; read `STT_URL` from `process.env` in `config.ts`.
