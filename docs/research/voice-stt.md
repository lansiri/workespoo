# Speech to text on our own server

Measured on the live server (2 cores, AMD EPYC, 3.7 GB RAM) on 14 November 2026. This replaces the browser's own speech recognition as the default way to listen.

## Why the browser's recognition had to go

Reported from real phones: the interviewer heard the first word of an answer and nothing after it. Three causes, all in the browser engine or in how we used it:

- Phones give the microphone to one user at a time. Our level meter opened the microphone with `getUserMedia` a moment after `SpeechRecognition` had started, and on Android that takes the microphone away from the recogniser.
- Android Chrome ignores `continuous = true`: recognition ends at the first pause, and we did not start it again.
- `SpeechRecognition` does not exist in Firefox, is unreliable in iOS Safari, and where it works it sends the audio to the browser vendor.

So: capture the audio ourselves, once, with `getUserMedia` and Web Audio (which every current browser has, phones included), and turn it into text on our own server.

## What runs

| Piece | Choice |
|---|---|
| Model | NVIDIA Parakeet TDT 0.6b v3, int8 (CC BY 4.0). One multilingual model: 25 European languages, Finnish, Swedish and English among them. It finds the language itself and writes punctuation and capitals. |
| Runtime | sherpa-onnx v2.0.1 (Apache 2.0), its `sherpa-onnx-offline-websocket-server`, with ONNX Runtime on CPU |
| Where | Its own container, `stt` in `compose.yaml`, built from `infra/stt/Dockerfile`. Read-only file system, no volume, no secrets, no capabilities, and a network with no route to the internet that only `web` shares. |
| Path of the audio | browser (16 kHz mono PCM, a few seconds at a time) → `POST /api/voice/stt` → websocket to `stt` → text back. Held in memory only, on both hops. |

## Measurements

One recording at a time through the websocket server, two threads. Recordings: FLEURS dev set (people reading sentences aloud, CC BY 4.0), 25 per language for Parakeet, 12 Finnish ones for Whisper. Word error rate after lower-casing and removing punctuation; it counts "13" for "trettonde" and a split compound as errors, so it overstates what a reader would call wrong.

| Model | Language | Word error rate | Time for a 6 s recording | Time for an 18 s recording | Memory held |
|---|---|---|---|---|---|
| Parakeet TDT 0.6b v3 int8 | Finnish | 21.8% | 0.7 s | 1.8 s | about 1.6 GB |
| Parakeet TDT 0.6b v3 int8 | Swedish | 21.5% | 0.8 s | 1.9 s | |
| Parakeet TDT 0.6b v3 int8 | English | 6.9% | 0.8 s | 1.4 s | |
| Whisper small int8 | Finnish | 35.2% | 2.5 s | 7.5 s | about 1.3 GB |

Parakeet works at about a ninth of real time here, so text for a stretch of speech is back before the person has finished the next one. Whisper small is slower by a factor of four and worse on Finnish. Whisper base was not worth finishing.

Other things measured:

- Start after a restart: 2.8 s until it listens.
- Silence, noise and a pure tone all come back as empty text. It did not invent words.
- Three recordings of 15 s sent at the same moment came back after 1.5 s, 3.3 s and 6.0 s: the server takes them one after another.
- 30 s of audio: 3.1 s.
- **A recording with no samples, or a single sample, kills the server process** (an uncaught ONNX Runtime error). 80 samples and more are safe. The app never sends less than a quarter of a second, and the container restarts by itself.
- NaN samples come back as a run of `<unk>`. The app sends 16-bit integers, so this cannot happen from a browser; the text is cleaned of `<unk>` anyway.
- The server's output holds connection lines and counts. No audio and no text.

## The websocket protocol

Verified against `sherpa-onnx/csrc/offline-websocket-server-impl.cc` at v2.0.1 and by running it.

1. Open a websocket to `STT_URL` (`ws://stt:6006`).
2. Send binary frames. The first eight bytes are two little-endian 32-bit integers: the sample rate, then the number of bytes of sample data that follow. After them come the samples as little-endian 32-bit floats in [-1, 1]. The data may be spread over several frames; 64 KiB frames were tested.
3. When the announced number of bytes has arrived the server decodes and answers with one text frame of JSON: `{"text": "...", "tokens": [...], "timestamps": [...], ...}`. Only `text` is used.
4. Send the text frame `Done`. The server closes the connection with code 1000. (More recordings could be sent on the same connection first; we use one connection per recording.)
5. Any other text frame closes the connection. A recording longer than `--max-utterance-length` (35 s in our image) closes it with "Payload is too large".

Node 22 has a websocket client built in (`globalThis.WebSocket`), which is what the image runs. Node 20 does not, unless started with `--experimental-websocket`.

## How the browser sends speech

- One microphone stream per press of the talk button; the same samples drive the level meter. The microphone is released on release of the button, which also gives a phone its loudspeaker back for the interviewer's voice.
- Capture with an `AudioWorklet`, falling back to a `ScriptProcessorNode`. Samples are brought to 16 kHz in the browser and sent as 16-bit PCM: 32 kB per second of speech.
- While the button is held, the speech so far is cut at pauses (or after 14 s without one) and each piece is sent straight away, so the text grows on screen while the person talks and only the last piece is left to do on release.
- Loudness is the only thing measured in the browser: to draw the meter and to find a pause. Nothing about the voice is analysed anywhere, and nothing is stored.

## Limits

- One model on two cores: one person talking uses about a quarter of the processor. Three or four people talking at the same moment still get their text within a few seconds; beyond that requests are turned away and the person is asked to type.
- The model holds about 1.6 GB of the server's 3.7 GB. The container has a 2.2 GB ceiling and is the first thing the kernel stops if memory runs out; it comes back in three seconds.
- Finnish and Swedish names of people and places are often misspelt. The person sees the text and can remove an answer; the card is theirs to correct before anything uses it.
- If the `stt` container is down, `/api/voice/config` answers `browser` and the old path is used. `VOICE_ADAPTER=browser` forces that; `VOICE_ADAPTER=none` turns voice off.

## Sources

- Model: https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3 (CC BY 4.0); export used: `sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2` from the sherpa-onnx `asr-models` release
- Runtime: https://github.com/k2-fsa/sherpa-onnx (Apache 2.0), release v2.0.1
- Test recordings: FLEURS, https://huggingface.co/datasets/google/fleurs (CC BY 4.0), used for measurement only
