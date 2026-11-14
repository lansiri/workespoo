# Status board

Updated by the lead. Times are Helsinki time.

## Now (Sat 14 Nov, 06:45)

**The designed product is live and demo-ready. The three-minute demo runs as an automated test against the live site with the real model, and passes. A captioned backup video of it exists.**

| Item | State |
|---|---|
| Live site https://workespoo.aichat.fi | serving the frozen commit (tag `demo-freeze-2026-11-14`): every screen in the designed interface, in English, Finnish and Swedish |
| Demo world on the live site | 15 simulated people (each interviewed by the real interviewer), 8 demo companies built from real open Espoo postings, 19 picks waiting for the organiser across seven companies; the pitch company (03) is left for the live run. "Reset demo" on the organiser's overview restores it in a few seconds without a model |
| Golden path | `e2e/golden-path.spec.ts`: reset, interview, card, picks, organiser decisions, company page, the Finnish question, ask to meet, mutual yes, audit trail. Passed on the live site in 1.5 minutes at 06:31 |
| Backup video | `~/junction26/workespoo-demo-backup.mp4` on the build machine: 3 minutes, silent, captioned, recorded from the live site (`e2e/record-demo.mjs`, `e2e/make-video.mjs`) |
| Demo script and pitch notes | `docs/specs/demo-script.md`, `docs/PITCH.md` |
| Server | hardened, key-only SSH, firewall, TLS, push-to-deploy with rollback; 2 cores, 4 GB |
| Model | `kimi-k3-1-pro` on Verda for all three roles. **Limit: 40 requests a minute for the whole key, one provider** |
| Voice | The server speaks with Piper in English, Finnish and Swedish (0.2 to 0.65 s per sentence). The browser listens (Chrome). No key needed |
| Live database | 1,338 Espoo postings, 18,269 ESCO concepts, 24,682 occupation-to-skill links |
| Tests on main | 1,398 passing |
| GitHub mirror | up to date (private) |

**Rule from here on: no deploy without running the golden path on the live site afterwards.** Twice tonight a change that passed every unit test changed what the demo shows.

## What changed tonight after the screens were built

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

| Task | What it does |
|---|---|
| Evaluation | the final run of 20 simulated interviews with the real model against the interview rubric; reports in `evals/2026-11-14-*` |

## Next

1. Whatever the owner decides after trying it: wording, the order of the demo, anything that feels off.
2. If time allows: the open question shown on the company's main page (it is on the Need Card page today), names instead of ids in the audit log, a second model provider once a key exists.

## Waiting on the owner

1. **Model capacity and a second provider.** One provider with 40 requests a minute carries everything. It is enough for the demo and for one or two people at once, not for a room trying it together, and the provider was unreachable for 24 minutes last night. An NVIDIA key or any other OpenAI-compatible endpoint can be added as a fallback with two lines of configuration.
2. **Try the voice** at `/interview` in Chrome with "Use my voice" ticked. Only a person can judge how it sounds and whether the hall allows it. Typing always works.
3. **Deadline and submission.** Is it Sunday 10:00, and what does the submission need (video, repository link, slides)? The repository is private; say if it should be public.
4. **Finnish and Swedish wording** were written by the builders; the Swedish in particular wants a native reader before the event.
5. After the event: rotate the Verda key, since it was pasted into the chat.

## Gates

- [x] Gate 1: live URL over HTTPS, deploy and rollback proven, streamed model turn from the server, 1,000+ Espoo postings and ESCO in the database, voice round trip from the server.
- [x] Gate 2: the full path works end to end with the real model. Evaluation reports in `evals/`.
- [x] Gate 3: styled product, golden-path test green on the live site, backup video, demo freeze (tag `demo-freeze-2026-11-14`).
