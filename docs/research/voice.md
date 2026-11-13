# Voice layer

Researched 2026-11-13 from vendor documentation. Nothing here has been tested with a key yet.

## Shape

The browser talks to speech services through one client interface with swappable adapters. Our server owns every prompt and never needs the user's audio.

```
hold to talk -> speech-to-text (adapter) -> final transcript text
             -> POST /api/interview/{id}/turn (our server, streams the model's reply)
             -> reply text split into sentences -> text-to-speech (adapter) -> playback queue
```

- **Push-to-talk is the default.** The venue is loud, and background voices must not trigger turns. Hands-free is an option, not the default.
- Text input always works and uses the same turn endpoint.
- Pressing talk while the interviewer is speaking stops playback and aborts the reply stream.
- The interviewer says it is an AI at the start of every session.
- No voice, tone or emotion analysis. Audio is never stored by us.

## Adapter 1: ElevenLabs (preferred when a key exists)

- Speech-to-text: Scribe realtime over WebSocket from the browser. `@elevenlabs/react` exposes a `useScribe` hook; connect with a single-use token and the microphone, use the manual commit strategy and call `commit()` when the talk button is released. Partial transcripts arrive while the person speaks. Documentation examples use model `scribe_v3_live`. Finnish is rated excellent.
- The single-use token is minted on our server (`elevenlabs.tokens.singleUse.create("realtime_scribe")` in `@elevenlabs/elevenlabs-js`), valid 15 minutes. Mint on click, never on page load.
- Text-to-speech: Flash v2.5 (or v4 Turbo) streaming. Both support Finnish; Flash v2 is English-only. Our server calls the streaming endpoint per sentence and relays audio; the key never reaches the browser.
- Cost estimate for 900 conversation minutes: about $3 speech-to-text plus about $18 text-to-speech.
- Retention: per-request no-logging is an enterprise feature, so treat audio and text sent there as retained by the vendor. Say so in the consent text. A production deployment would swap in an EU-hosted speech service.
- Documentation: https://elevenlabs.io/docs/cookbooks/speech-to-text/streaming , https://elevenlabs.io/docs/overview/models , https://elevenlabs.io/pricing/api

## Adapter 2: OpenAI-compatible speech endpoint (if the owner provides one)

Record with `MediaRecorder` while the button is held, post the blob to our server, which forwards it to `/v1/audio/transcriptions`; text-to-speech through `/v1/audio/speech`. No live partial transcript. In this adapter audio passes through our server in memory and is not written to disk.

## Adapter 3: browser speech engine (zero-key fallback)

`SpeechRecognition` / `webkitSpeechRecognition` for input and `speechSynthesis` for output. Works in Chrome and partly in Safari, not in Firefox. Chrome sends audio to Google, so the consent text must say that audio is processed by the browser vendor. Voice quality is robotic. Use only when no key is configured.

## Gotchas

- Microphone access needs HTTPS. Test on the real domain early.
- iOS: create or resume the `AudioContext` and start capture inside the tap handler, or audio stays locked. The ring/silent switch can mute Web Audio.
- Caddy must not buffer the streamed reply (`flush_interval -1`).
- Laptop speakers feed back into the microphone in hands-free mode. Pause capture while the interviewer speaks.
- Concurrency limits apply per vendor plan; call the session end on page unload so stale tabs do not hold connections.
- Testing without a human: Chromium launched by Playwright with `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<file.wav>` feeds a WAV file as the microphone.
- Measure time from button release to first audio in the Phase 1 spike. Target under 1.5 seconds.

## Demo modes

- **Express interview**: three questions, about 60 to 90 seconds, for the pitch.
- **Full interview**: five to seven questions, about four minutes.
