# Voice that needs no vendor key: speech synthesis on our own server

## Why

The interviewer should speak. Today it can only do so through ElevenLabs (no key yet) or through the browser's built-in `speechSynthesis`, which is robotic everywhere and close to unusable on Linux, where the demo laptop runs. Piper is an open-source neural text-to-speech engine that runs faster than real time on a plain CPU and has Finnish, Swedish and English voices. With it the interviewer speaks all three languages from our own server in Helsinki, and no text leaves it. Speech recognition stays in the browser (Chrome's speech service), as today.

## Yours

`src/features/voice/**`, `src/app/api/voice/**`, `src/app/dev/voice/**`, `src/contracts/voice.ts` (one optional field, see item 4), `Dockerfile`, the `web` service's `mem_limit` in `compose.yaml`, the voice lines of `.env.example`, and a note in `docs/research/voice-piper.md`. `Dockerfile`, `compose.yaml` and the contract are lead-owned and handed to you for this task; change nothing else in them.

## Build

1. **Find out first** (write what you find in `docs/research/voice-piper.md`, with the sources): which Piper release to use (the standalone Linux x86_64 binary from the project's GitHub releases is the simplest: one tarball with its libraries), and one voice each for `en`, `fi` and `sv` from the project's voice collection, medium quality. Check each voice's licence in its model card and choose voices that may be used freely; say which licence each has. Download them to a scratch directory on this machine, run the binary for one sentence per language, and record: seconds to load the model, seconds to synthesise a 12-word sentence, sample rate, memory used. Confirm the audio is not silent (measure it; you cannot listen). If Piper cannot do this on a CPU within about a second per sentence, stop and report.
2. **In the image**: the `Dockerfile` downloads the pinned binary and the three voices, checks each file's SHA-256, and puts them under `/opt/piper`. Keep the layer order so a code change does not download them again. `PIPER_DIR` (default `/opt/piper`) tells the app where they are. The image must still build when run as the `node` user, as it does now.
3. **On the server side of the app** (`src/features/voice/server/piper.ts`): one long-lived Piper process per language, started on first use and stopped after five idle minutes, fed one sentence at a time; `synthesise(text, lang, signal)` resolves with a complete WAV. Unknown languages use English. At most two syntheses at once; a third waits briefly and then gets the same 429 the route gives today. A process that dies is replaced on the next request. The text is never logged. The process factory is injected so tests use a fake.
4. **The route and the config**: `POST /api/voice/tts` uses ElevenLabs when its key is set, otherwise Piper when the binary and the voices are present, otherwise 503 as today. `GET /api/voice/config` gains an optional field in the contract, `tts: "browser" | "server"`: with Piper available and no ElevenLabs key it answers `{ adapter: "browser", processor: <as today>, tts: "server" }`. The `processor` text names only the speech-recognition service, because only the person's audio goes there.
5. **In the browser**: when the config says `tts: "server"`, the browser adapter recognises speech as today but speaks through the existing `PlaybackQueue` and `/api/voice/tts` instead of `speechSynthesis`, with the same cancel and barge-in behaviour as the ElevenLabs adapter. `speechSynthesis` remains the fallback when the server answers 503.
6. `/dev/voice` shows which engine speaks (ElevenLabs, our server, the browser) and the time from request to first sound.
7. Raise the `web` service's memory limit to what your measurements say it needs (the server has 3.7 GB for everything; say what you measured).

## Tests

Unit tests with a fake process: the pool starts one process per language, reuses it, replaces a dead one, stops idle ones (inject the clock); the concurrency limit; the route's choice between ElevenLabs, Piper and 503; the config answer; the browser adapter speaking through the queue when told to; text never appears in a log call. No test runs the real binary or downloads anything.

## Watch out for

- Rule 9 in `CLAUDE.md`: no voice, tone or emotion analysis, and audio is never stored. Synthesised audio is streamed to the browser and not kept.
- The download in the `Dockerfile` must fail the build on a checksum mismatch, not continue.
- Do not add an npm dependency. Do not try to deploy; the lead deploys.
