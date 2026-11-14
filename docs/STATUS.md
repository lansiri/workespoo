# Status board

Updated by the lead. Times are Helsinki time.

## Now (Sat 14 Nov, 11:45)

**The designed product is live and demo-ready. The three-minute demo runs as an automated test against the live site with the real model, and passes. A captioned backup video of it exists.**

| Item | State |
|---|---|
| Live site https://workespoo.aichat.fi | serving `73c2772` (tag `demo-2026-11-14-voice`; the 06:45 freeze is tag `demo-freeze-2026-11-14`): every screen in the designed interface, in English, Finnish and Swedish, with listening on our own server |
| Demo world on the live site | 15 simulated people (each interviewed by the real interviewer), 8 demo companies built from real open Espoo postings, 19 picks waiting for the organiser across seven companies; the pitch company (03) is left for the live run. "Reset demo" on the organiser's overview restores it in a few seconds without a model |
| Golden path | `e2e/golden-path.spec.ts`: reset, interview, card, picks, organiser decisions, company page, the Finnish question, ask to meet, mutual yes, audit trail. Passed on the live site in 1.5 minutes at 11:42, after the voice deploy |
| Backup video | `~/junction26/workespoo-demo-backup.mp4` on the build machine: 3 minutes, silent, captioned, recorded from the live site (`e2e/record-demo.mjs`, `e2e/make-video.mjs`) |
| Demo script and pitch notes | `docs/specs/demo-script.md`, `docs/PITCH.md` |
| Server | hardened, key-only SSH, firewall, TLS, push-to-deploy with rollback; 2 cores, 4 GB. Five containers: caddy, web, worker, db and `stt` (the speech model: about 1 GB held, read-only, no route to the internet) |
| Model | `kimi-k3-1-pro` on Verda for all three roles. **Limit: 40 requests a minute for the whole key, one provider** |
| Voice | Listening and speaking both run on our own server. Hold to talk in any current browser, phones included: the audio is turned into text by an open speech model in its own container (6 s of speech in about 0.7 s) and dropped; words appear while the person is still talking. The server speaks with Piper. English, Finnish and Swedish, no key, no outside speech service (`docs/research/voice-stt.md`) |
| Live database | 1,338 Espoo postings, 18,269 ESCO concepts, 24,682 occupation-to-skill links |
| Tests on main | 1,514 passing; `e2e/voice.spec.ts` speaks recorded answers in three languages into a real browser, by mouse, by finger and in Firefox |
| GitHub mirror | up to date (private) |

**Rule from here on: no deploy without running the golden path on the live site afterwards.** Twice tonight a change that passed every unit test changed what the demo shows.

## What changed on Saturday morning: listening moved to our own server

Reported from a real phone: the interviewer heard the first word of an answer and nothing after it.

| Found | What it was | Now |
|---|---|---|
| Reading the voice code | On a phone the level meter took the microphone away from the browser's speech recognition, Android ends that recognition at the first pause, and Firefox and iOS do not have it reliably | The browser captures the audio once and sends it to our server a few seconds at a time; an open speech model (Parakeet TDT 0.6b v3) turns it into text there and drops it. Measured on the server: 6 s of speech in 0.7 s |
| The same code | The interviewer's voice went through an audio graph that existed for a test-page meter; a phone that suspends it gets a silent interviewer, and a clip the phone pauses was never restarted | The voice plays straight from the audio element; a clip that stalls is restarted after a second and skipped after four |
| The talk button | A quick tap on a slow phone ended before the listening state was drawn, so the press never ended and the microphone stayed open | A press ends when the finger lifts |
| Review of the wording | A person could agree to "audio stays on our own server" and be given the browser's recogniser a moment later if ours was down | The consent records which wording was agreed to, and the room keeps to it: our recogniser or typing |
| Review of the endpoint | Small points: a microphone failing mid-press, bursts of tiny requests, a body cut off mid-upload | Fixed, each with a test |
| GitHub | Five red runs on in-between commits that the next push repaired | CI cancels a superseded run; the newest runs are green |

Checked on the live site at 11:41: spoken answers in English, Finnish and Swedish arrive 0.8 s after letting go, words are on screen while the button is still held, a finger hold on a phone-sized touch screen stays a press, and Firefox uploads sound of the right pitch and length (`e2e/voice.spec.ts`). **Not checked by anyone yet: a real phone and a real voice.**

## What changed on Friday night after the screens were built

| Found by | What it was | Now |
|---|---|---|
| The seed with the real model | A network cut left interviews made only of scripted questions, and the seed accepted them | The seed rejects an interview in which the model did not answer, and does it again |
| The real cards | Nobody had a work language, so a language requirement's pool evidence read "0 of N" | Simulated people declare how they want to work on the card, as a person does |
| The real cards | The jobs board in the interview stayed empty for nurses, teachers, cooks and customer service | Skill labels are chosen during the conversation; a nurse's first answer now lights 19 open jobs |
| The real picks | Almost every drafted pick had no reasons (a similarity asked in the wrong direction) | Reasons follow the rule that made the person eligible |
| The demo companies | Six of eight related to nobody in the pool | Re-picked from real postings the pool relates to; every company has people |
| The golden path | After the last decision the review jumped to another company, hiding Publish | The review stays with the company |
| The golden path | A live demo participant was tagged "Synthetic person" | Tagged "Live demo: a real person" |
| The golden path | Picks on a published list showed "out of date" after the company edited its need | Only a suggestion still waiting can be out of date |
| Looking at the repository | The snapshot would have held working private links | Links are made again at every restore; none is stored |
| The evaluation | One card in fifteen was the code-built fallback: synthesis takes 15 to 30 s and each model request was cut off at 30 s | Card synthesis and Need Card drafting get 75 s for one attempt; the affected card was redone |
| The golden path on a slow connection | A passcode typed before the page was interactive left the Sign in button dead | The form takes over what is already in the field |
| The golden path on the rebuilt world | The newcomer was left off the pitch company's list: they related to four companies and nobody is suggested to more than three a day | The demo event sets that cap to the number of companies |

## Running now

Nothing. The evaluation of 20 simulated interviews finished and passed (`evals/2026-11-14-*`).

## Next

1. Whatever the owner decides after trying it: wording, the order of the demo, anything that feels off.
2. If time allows: the open question shown on the company's main page (it is on the Need Card page today), names instead of ids in the audit log, a second model provider once a key exists.

## Waiting on the owner

1. **Model capacity and a second provider.** One provider with 40 requests a minute carries everything. It is enough for the demo and for one or two people at once, not for a room trying it together, and the provider was unreachable for 24 minutes last night. An NVIDIA key or any other OpenAI-compatible endpoint can be added as a fallback with two lines of configuration.
2. **Try the voice on your phone** at `/interview` with "Use my voice" ticked: allow the microphone when asked, hold the button, speak, let go. Only a real phone and a real voice can settle this; say which phone and browser if anything is off. Typing always works.
3. **Deadline and submission.** Is it Sunday 10:00, and what does the submission need (video, repository link, slides)? The repository is private; say if it should be public.
4. **Finnish and Swedish wording** were written by the builders; the Swedish in particular wants a native reader before the event.
5. After the event: rotate the Verda key, since it was pasted into the chat.

## Gates

- [x] Gate 1: live URL over HTTPS, deploy and rollback proven, streamed model turn from the server, 1,000+ Espoo postings and ESCO in the database, voice round trip from the server.
- [x] Gate 2: the full path works end to end with the real model. Evaluation reports in `evals/`.
- [x] Gate 3: styled product, golden-path test green on the live site, backup video, demo freeze (tag `demo-freeze-2026-11-14`).
