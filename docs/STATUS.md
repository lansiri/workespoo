# Status board

Updated by the lead. Times are Helsinki time.

## Now (Sat 14 Nov, afternoon)

**Job interviews and ranked applicants are built, reviewed and merged on main. Deployed: [[DEPLOYED-AT]].** The owner decided at 12:50 that applicants to a job are rated and ranked (`docs/LEAD-DECISIONS.md`, the newest entry; `docs/specs/job-interview.md`). Everything else stays as it was: the general interview is not scored, the Signal Card has no levels, the job feed has no match percentages, Daily Picks are in no particular order and approved one by one.

### What was built

| Item | State |
|---|---|
| Choosing a job | `/apply`: the eight demo companies' jobs, each with what its ad asks for. Needs an approved card; being in the pool is not needed |
| Start screen | Says that an AI rates the answers against the ad, that applicants are put in order, that an organiser reads the answers and checks the order, and that the company sees no name and none of the person's words until both agree to meet. A separate consent (`job_assessment`); nothing starts without it |
| The job interview | One question per requirement of the ad, at most six, chosen by code (must-haves first; statutory and permit requirements are never asked). The questions are worded once per job and language and every applicant gets the same ones. At most one follow-up per requirement, only when the answer had no concrete example. Skip, stop, remove an answer; review before sending. English, Finnish and Swedish, typed or spoken |
| Assessment | After sending: a level from 0 to 3 per requirement, with a written anchor for each level and a reason in three languages that points at the person's own sentences. Code drops references that do not resolve, replaces reasons that judge the person or name a protected detail, and leaves out of the assessor's input any sentence in which the person says something protected about themselves |
| Points and order | Code: level times weight (must-have 2, nice-to-have 1); order by points, then must-haves at level 2 or 3, then who sent earlier. Nobody is removed by a rating |
| The person's result | Levels, reasons, the sentences they rest on, points, and after an approval "You are number N of M on the list the company sees". Withdraw deletes the application everywhere, the approved list included |
| Organiser | **Applicants** in the organiser's menu: per job the ranked list, the answers behind each rating, a move that needs a written reason, approval of the exact list seen (refused if it changed meanwhile), and a link to the company's page |
| Company | `/c/[token]/applicants`: the approved order with levels and reasons, "Position set by the organiser" on a moved person, no name and no own words until both agree to meet; **Ask to meet** uses the existing introduction flow |
| Demo world | Simulated people have applied through the real feature with the real model ([[APPLICATIONS-COUNT]]). The pitch company (03) has four simulated applicants, so the person on stage becomes the fifth. "Reset demo" restores them without a model |
| Audit | `application.started`, `application.submitted`, `application.assessed`, `application.withdrawn`, `ranking.moved`, `ranking.unpinned`, `ranking.approved`; ids, counts, positions and the organiser's reason, never answers, levels or reasons |

### What was verified, and how

| Check | Result |
|---|---|
| Prompt lab before the build was accepted | 84 real model calls over the three prompts (`evals/prompt-lab/application-*`). Assessment: 12 runs over 6 cases, all valid; 60 of 60 ratings at the level the scale's anchors call for; both runs of every case gave identical levels (temperature 0); broken English got the same levels as the same content in clean English (2 of 2 cases, both runs); Finnish the same as English (1 case, both runs); a sentence that was left out was never cited (6 of 6) |
| Timing in the lab | Rating one job interview 12 to 18 s; deciding on a follow-up about 1 s; wording a job's questions 4 to 12 s, once per job and language |
| Unit tests | `npm run check` on main: 1,816 passing, 3 skipped |
| Reviews | Found and fixed before merging: the protected check now works in three languages and leaves a sentence out only when the person speaks about themselves, while a country or nationality word in a work sentence is hidden and the sentence kept; reasons are checked for remarks about the person and how they came across; a failed assessment stores nothing; the organiser approves the list that was on screen and is refused if it moved on; withdrawal, "delete my data" and the 24-hour purge take the person out of the approved list and the pins |
| The journey as a test | `e2e/job-interview.spec.ts`: choose a job, consent, job interview, review and send, own ratings, the organiser's list with the answers behind a rating, a move with a reason, approval, the company's list without names, ask to meet, the person's place and yes, the name only after that, the audit trail. On the live site: [[DEPLOYED-AT]] |

### Not done

1. Deploy, then run `golden-path` and `job-interview` on the live site: [[DEPLOYED-AT]].
2. The language swap check (`evals/application-swap`, run by hand): [[SWAP-CHECK]].
3. The backup video again, with the job interview in it: [[VIDEO]].
4. **Still not checked by anyone: a real phone and a real voice.**
5. The public page `/how-it-works` and the consent page do not mention the job interview yet; the job interview's own start screen says what is rated.

Known limits, also in the README and the pitch notes: the protected-detail screening is word lists in three languages and can miss an unusual phrasing; reasons are model-written and checked by word lists, with an organiser as the last check; the simulated applicants are played by a model from persona sheets; the level scale and the weights are a first version nobody has validated with employers; an EU AI Act high-risk system needs a conformity assessment, a fundamental rights impact assessment and validation on real applicants, none of which this prototype has.

## Saturday 11:45: the designed product live and demo-ready

**The designed product is live and demo-ready. The three-minute demo runs as an automated test against the live site with the real model, and passes. A captioned backup video of it exists.** (As it stood before the job interview. The demo script now leads with the job interview; the backup video does not show it yet.)

| Item | State |
|---|---|
| Live site https://workespoo.aichat.fi | serving `73c2772` (tag `demo-2026-11-14-voice`; the 06:45 freeze is tag `demo-freeze-2026-11-14`): every screen in the designed interface, in English, Finnish and Swedish, with listening on our own server |
| Demo world on the live site | 15 simulated people (each interviewed by the real interviewer), 8 demo companies built from real open Espoo postings, 19 picks waiting for the organiser across seven companies; the pitch company (03) is left for the live run. "Reset demo" on the organiser's overview restores it in a few seconds without a model |
| Golden path | `e2e/golden-path.spec.ts`: reset, interview, card, picks, organiser decisions, company page, the Finnish question, ask to meet, mutual yes, audit trail. Passed on the live site in 1.5 minutes at 11:42, after the voice deploy |
| Backup video | `~/junction26/workespoo-demo-backup.mp4` on the build machine: 3 minutes, silent, captioned, recorded from the live site (`e2e/record-demo.mjs`, `e2e/make-video.mjs`) |
| Demo script and pitch notes | `docs/specs/demo-script.md`, `docs/PITCH.md` (rewritten in the afternoon for the job interview) |
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

Waiting for a result: the language swap check of the job interview, run by hand ([[SWAP-CHECK]]). The evaluation of 20 simulated interviews finished and passed (`evals/2026-11-14-*`).

## Next

1. Whatever the owner decides after trying it: wording, the order of the demo, anything that feels off. That now includes the job interview and the new three-minute demo.
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
- [ ] Gate 4: job interviews live, `job-interview` and `golden-path` green on the live site, the swap check read, the backup video recorded again. Deployed: [[DEPLOYED-AT]]; swap check: [[SWAP-CHECK]]; video: [[VIDEO]].
