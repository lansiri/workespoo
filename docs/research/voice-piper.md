# Piper speech synthesis on our own server

Researched and measured 2026-11-14 on the build laptop. Nothing here has run on the VPS yet.

## What we use

| Part | Choice | Source | Licence |
|---|---|---|---|
| Engine | Piper `2023.11.14-2`, standalone `piper_linux_x86_64.tar.gz` (binary plus its own onnxruntime 1.14.1, espeak-ng and piper-phonemize libraries, `RUNPATH=$ORIGIN`) | https://github.com/rhasspy/piper/releases/tag/2023.11.14-2 | Piper: MIT. Bundled espeak-ng: GPL-3.0 (we run it as a separate program, unmodified). onnxruntime: MIT. |
| English | `en_GB-cori-medium` (UK English, female, 22 050 Hz) | https://huggingface.co/rhasspy/piper-voices/tree/v1.0.0/en/en_GB/cori/medium | Model card: dataset from LibriVox, **public domain**, trained from scratch. Voice repository: MIT. |
| Finnish | `fi_FI-harri-medium` (22 050 Hz) | https://huggingface.co/rhasspy/piper-voices/tree/v1.0.0/fi/fi_FI/harri/medium | Model card: dataset **CC0**. Caveat below. |
| Swedish | `sv_SE-nst-medium` (22 050 Hz) | https://huggingface.co/rhasspy/piper-voices/tree/v1.0.0/sv/sv_SE/nst/medium | Model card: NST dataset (Språkbanken), **CC0**, trained from scratch by KBLab. |

The standalone binary is the last release of `rhasspy/piper`; the project has since moved to `OHF-Voice/piper1-gpl`, which ships as a Python package rather than a binary, so the 2023 release is the simplest thing to put in the image.

**Licence caveat, Finnish.** `fi_FI-harri-medium` is the only medium-quality Finnish voice. Its own data is CC0, but its model card says it was fine-tuned from the US English `lessac` voice, whose training data (Blizzard 2013 Lessac) is under a research licence (https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html). For a non-commercial hackathon demo that is acceptable; a production deployment should use a Finnish voice trained from scratch. English voices fine-tuned from `lessac` (`amy`, `alan`, `ryan`) and the CC BY-NC-SA voices (`ryan`, `hfc_female`) were passed over for the same reason; `cori` has no such ancestry.

## Files and checksums

All files are pinned. SHA-256 computed here; the MD5 of each voice file also matched the `md5_digest` in the repository's `voices.json` at `v1.0.0`.

| File | Size | SHA-256 |
|---|---|---|
| `piper_linux_x86_64.tar.gz` | 26 460 462 | `a50cb45f355b7af1f6d758c1b360717877ba0a398cc8cbe6d2a7a3a26e225992` |
| `en_GB-cori-medium.onnx` | 63 531 379 | `1899f98e5fb8310154f3c2973f4b8a929ba7245e722b3d3a85680b833d95f10d` |
| `en_GB-cori-medium.onnx.json` | 4 966 | `e262c16d7f192f69d4edd6b4ef8a5915379e67495fcc402f1ab15eeb33da3d36` |
| `fi_FI-harri-medium.onnx` | 63 201 294 | `a44167faa34caed940e4fcad139fcc35922266b2593bcebe77701774c0fb2389` |
| `fi_FI-harri-medium.onnx.json` | 4 873 | `3f9c9f76f74adf1fbe7279e41eea17d6610757e45effd6808bbea6be74b8916d` |
| `sv_SE-nst-medium.onnx` | 63 104 526 | `df011f56825a59dd1efc080c38a65a1ef70407e60f63050e9246f43a3d7e471e` |
| `sv_SE-nst-medium.onnx.json` | 4 157 | `d45dd74cbb4eca58694bf04a97e243044092476f28a55ae26424f0653086980a` |

About 245 MB on disk in all (binary directory 52 MB, voices 190 MB).

## How we drive it

`piper --model <voice>.onnx --json-input --output_raw`, one long-lived process per language. Each request is one JSON line `{"text": "..."}` on stdin (JSON keeps a newline in the text from splitting a request). Piper writes raw 16-bit mono PCM at the voice's sample rate to stdout, then logs `Real-time factor: ... (infer=..., audio=...)` on stderr. That log line is the end-of-sentence marker; the app waits a few milliseconds for the last stdout bytes, adds a 44-byte WAV header and answers with the complete WAV. Neither the text nor the audio is logged or written to disk.

Two things that did not work and why:
- `--json-input` with `"output_file": "/dev/stdout"` would give a self-delimiting WAV, but Node's `spawn` connects stdout with a socket pair, and opening `/dev/stdout` on a socket fails silently (only the path line arrives).
- The `audio=` seconds in the log are cumulative over the process lifetime and leave out the 0.2 s silence Piper appends after each sentence, so they cannot be used to count bytes.

The binary needs only glibc and `libstdc++`, both already in `node:22-bookworm-slim`. It finds `espeak-ng-data` next to itself.

## Measurements

Laptop: Intel i7-12700H (14 cores, 20 threads), 31 GB. **The laptop was heavily loaded by other builders' test runs during every measurement: load average 48 to 67 on 20 threads**, so wall times below are inflated, probably by around three times. Each line: one process, voice load, then the same sentence three times (12 words; 14 for Swedish).

| Voice | Load (wall) | Synthesis per sentence (wall) | Audio length | Sample rate | RSS after load | Peak RSS | Loudness (RMS) |
|---|---|---|---|---|---|---|---|
| en_GB-cori-medium | 3.3 to 6.3 s | 2.6 to 3.8 s | 4.0 to 4.4 s | 22 050 Hz | 101 MB | 178 MB | -14.4 to -15.8 dBFS |
| fi_FI-harri-medium | 1.7 s | 4.0 to 5.3 s | 6.1 s | 22 050 Hz | 95 MB | 200 MB | -16.2 to -16.8 dBFS |
| sv_SE-nst-medium | 5.3 s | 2.9 to 4.5 s | 4.4 to 4.8 s | 22 050 Hz | 95 MB | 178 MB | -17.0 dBFS |

Sentences: "Thank you for telling me about that job, it sounds really interesting." / "Kiitos kun kerroit siitä työstä, se kuulostaa minusta todella mielenkiintoiselta ja hyvältä." / "Tack för att du berättade om det jobbet, det låter verkligen intressant för mig."

**The audio is not silent**: RMS about -15 to -17 dBFS for every run, peak at full scale (Piper normalises its output).

CPU time could not be measured meaningfully: onnxruntime 1.14 starts one spinning worker thread per core and sets their affinity itself, so `taskset` does not confine it and the process showed about 20 CPU-seconds per sentence on this oversubscribed machine. Under a cgroup quota of two CPUs (`systemd-run -p CPUQuota=200%`), still with about 14 threads competing for the quota, one sentence took 10 s. On the VPS (2 vCPU, no CPU quota on the container) onnxruntime sees two cores and starts two threads, which is the configuration Piper is designed for.

## Verdict

**Not settled here.** On this machine, under a load three times its thread count, a 12-word sentence took 2.6 to 5.3 s, which is above the one-second target. The measurement is dominated by contention and does not show what Piper does on an idle CPU. Two facts point the right way: Piper's medium voices are built to run in real time on a Raspberry Pi 4, and the playback queue fetches every sentence of a reply as soon as it is queued, so only the first sentence's synthesis is on the critical path.

What the lead should check after deploy, on `/dev/voice` with the server idle: "Request to first sound" for one short sentence, once warm (the first request per language also pays the 2 to 6 s model load). If it is well over a second, set `PIPER_DIR` to a path that does not exist in the runtime env: the app then reports `tts: "browser"` and speaks with `speechSynthesis` again, with no code change.

## Memory

Each language process holds about 100 MB once its voice is loaded and peaks at 180 to 200 MB while synthesising. All three languages warm at once: about 600 MB at peak, about 300 MB idle; idle processes stop after five minutes. The `web` service's limit goes from 1 GB to 1.5 GB to leave the Next.js server its previous headroom (`compose.yaml`). With `db` at 1 GB and `worker` at 768 MB the ceilings add up to about 3.3 GB of the server's 3.7 GB, plus 4 GB swap; they are ceilings, not reservations.
