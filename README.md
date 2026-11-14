# WorkEspoo

A prototype for Junction 2026, City of Espoo challenge "Rethinking Recruitment". Live at **https://workespoo.aichat.fi**. Not an official City of Espoo service.

Registration for a matchmaking event becomes a short conversation with an AI interviewer instead of a CV form. Everything after it rests on what the person said: the real open jobs they are shown, and the short lists of people an Espoo organiser approves for each company. That conversation is not scored, and those lists are in no particular order.

A person can then choose one job of the event and take a job interview whose questions come from that job's ad. This is the one thing that is rated, and the person is told so before starting: an AI rates the evidence in the answers for each requirement, code puts the applicants in order, and an organiser checks the order before the company sees it. Names stay hidden until both sides say yes. The job interview is on the live site since [[DEPLOYED-AT]].

![The interview room: the person's words, the notes taken from them, and real open jobs](docs/img/interview-room.jpg)

## What it does

| | What it is | Who decides |
|---|---|---|
| **Signal Card** | A person's skills as short notes, each pointing at the sentences the person said. No scores, no levels, no name, no photo. | The person edits and approves it before anything uses it. |
| **Need Card** | A company's need, drafted from the real posting it already wrote: must-haves, nice-to-haves, and questions back to the employer with evidence from the pool. | The company answers or changes it. |
| **Daily Picks** | Per company, a short list of people worth a conversation, in no particular order, with reasons that pair the card with a sentence of the posting. | An Espoo organiser approves each person one by one. |
| **Job interview** | For one job of the event: one question per requirement of the ad (at most six), at most one follow-up each, only when an answer has no example. Every applicant is asked about the same requirements of the ad, in the same wording for the same language. Afterwards a level per requirement (four levels with written anchors) and a reason that points at the person's own sentences. | The person chooses the job, agrees to the rating separately, sends the answers and can withdraw at any time. They see their own levels, reasons and, once a list is approved, their place on it. |
| **Ranked applicants** | The applicants to one job in order. Code computes points (level 0 to 3 times weight: a must-have weighs 2, a nice-to-have 1) and the order (points, then must-haves with a concrete example, then who sent earlier). | An Espoo organiser can read the answers behind each rating, can move a person with a written reason, and approves the list. The company then sees order, levels and reasons, without names or the person's own words. |

A must-have does not filter anyone out. It comes back to the employer as a question:

![A must-have Finnish requirement returned to the employer as a question with pool evidence](docs/img/need-card-question.jpg)

The organiser decides every suggestion, one person at a time. There is no approve-all, and a removal needs a reason. For a job's ranked applicants the organiser approves the order, and moving a person needs a reason too:

![The organiser's review queue](docs/img/organiser-review.jpg)

## Try it

1. Open https://workespoo.aichat.fi and press **Start the conversation**. Type, or hold the button and speak; speaking is built for current browsers on phones and computers, and has not yet been tried with a real voice on a real phone. English, Finnish and Swedish work.
2. Check your notes on the card, approve it, and see open jobs in Espoo that relate to it.
3. Under **Apply for a job**, choose one of the event's jobs and take its job interview. The start screen says what is rated and who sees what; nothing starts until you tick the box.
4. The organiser's and the company's sides need the organiser passcode; the three-minute walk, and a five-minute one, are in [`docs/specs/demo-script.md`](docs/specs/demo-script.md).

Whoever starts an interview on the live site is a live demo session: it needs consent and is deleted after 24 hours.

## What is real and what is not

| Real | Simulated or masked |
|---|---|
| The postings: about 1,300 open Espoo jobs from Job Market Finland (Työmarkkinatori), refreshed every six hours, with recruiter names, emails and phone numbers removed at ingestion | The people in the demo: 15 synthetic personas. Each was interviewed by the real interviewer and went through the real pipeline, and each is labelled "Synthetic person" |
| The model calls: every interview, card, Need Card and job interview rating in the demo was made by the real model | The companies: 8 real postings shown as "Demo company 01" to "08" with the employer's name hidden, because no employer was asked |
| The job applications in the demo world ([[APPLICATIONS-COUNT]]): made through the real job interview and rated by the real model | Who answers them: a model playing each persona from its sheet. The pitch company's job has four simulated applicants, so a person on stage becomes the fifth |
| Matching through the ESCO skills taxonomy, the review queue, the ranked lists, mutual consent, the audit log | Email: nothing is sent; a company's list is a private link. Event agenda and meeting slots are not built |

## Rules the code enforces

1. One thing about a person is rated, and only with their knowledge: a job application. The person is told before the job interview that the answers will be rated against the ad's requirements and the applicants ranked, and agrees to that separately. Everything else is unscored and unordered: no levels on the Signal Card, no match percentages in the job feed, Daily Picks in no particular order. The interviewer never evaluates out loud.
2. In a job interview every applicant to a job is asked about the same requirements, chosen by code from the ad. A level is about the evidence for one requirement, never about the person. Every level above the lowest points at the person's own sentences; a level whose sentences do not resolve becomes the lowest. Each application is rated by itself, and code, not the model, computes the order, so one person's levels do not move when another applies.
3. The assessor never gets the name, the nickname, the interview language or whether the person spoke or typed. It does read the answers as written, so their language is in front of it; its instructions say that fluency, grammar and the language of an answer must not change a level. A sentence in which the person says something protected about themselves is left out of what it reads, and a country or nationality word inside a work sentence is hidden. A reason that judges the person or names a protected detail is replaced by the code's sentence for that level.
4. A rating never removes anyone: every applicant stays on the list, and must-haves weigh more but never filter. An organiser can move a person, with a written reason kept in the audit log, and approves the list before the company sees it. The company sees no name and none of the person's own words until both sides agree to meet. Withdrawing deletes the application and its answers and takes the person off the list, the approved one included; the audit log keeps its ids and any organiser's reason, never the answers.
5. Evidence is cited by reference: the model points at a turn and a sentence, and code renders the text from the stored transcript. Model wording is never shown as a quote.
6. Age, gender, nationality, ethnicity, religion, health, family status and photo are never stored on a card or shown. The interview language and whether someone spoke or typed are not shown to a company. An organiser is not shown them either, except that in a job interview the organiser can read the person's answers as given, so the language they answered in is visible there. A company sees the person's own words only after both sides agreed.
7. A person approves their own card before anything uses it, and can download or delete everything.
8. A human approves every pick individually. There is no approve-all. Must-have requirements never filter anyone out of the pool.
9. Job ingestion drops personal data, including contact details inside description text.
10. No voice, tone or emotion analysis. Audio is never stored: speech is turned into text on our own server and dropped, and no outside speech service hears it.
11. The app never calls a closed model API: every model call goes through one gateway to an OpenAI-compatible endpoint (today the open-weight Kimi K3.1 served by Verda from Finland).

The public page [`/how-it-works`](https://workespoo.aichat.fi/how-it-works) describes the conversation, the card and the picks in three languages; its sentence that the AI does not rate answers must be limited to the conversation before the job interview goes live (see `docs/STATUS.md`). The job interview's start screen says what is rated, who reads the answers and what the company sees, before the person agrees.

## How it is built

One TypeScript package and a speech model, five containers on one small server (2 cores, 4 GB).

| Piece | Choice |
|---|---|
| Web | Next.js 16 (App Router), React 19, Tailwind 4; server-sent events for the live interview |
| Worker | The same code as a second process: ingestion, Need Card drafting, matching, daily drafts, rating sent job interviews, the 24-hour purge |
| Database | Postgres 17 with `pg_trgm`; Drizzle for schema and migrations; PGlite for tests |
| Model gateway | `src/lib/llm`: three roles (live, analyst, bulk) as priorities under one shared rate limit, a deadline on every call, JSON validated with Zod, an audit row per call |
| Voice | Hold to talk: the browser sends the audio to our own server, where an open speech model (Parakeet TDT 0.6b v3 on sherpa-onnx, in its own container with no route to the internet) turns it into text and drops it. The server speaks with Piper. English, Finnish and Swedish, no key and no outside speech service ([measurements](docs/research/voice-stt.md)) |
| Proxy and deploy | Caddy with automatic TLS; `git push` to the server builds, migrates, swaps and rolls back on a failed health check |

```
src/contracts    every shape that crosses a boundary (API, database json, events, model output)
src/lib          the shared library: model gateway, queue, audit, redaction, ESCO, i18n
src/features     interview, card, jobs, needs, matching, picks, intros, application, voice, synth
src/app          pages and thin route handlers
src/components   the design system as React components (gallery at /dev/design)
seed/            the synthetic personas and the snapshot the demo reset restores
e2e/             the demo as a test, and the scripts that record it as a video
docs/            specs, decisions, the design system, the demo script, pitch notes
```

## Checks

| Command | What it does |
|---|---|
| `npm run check` | type check, lint and about 1,800 unit tests (Vitest, in-process Postgres) |
| `npx playwright test golden-path` | the demo without the job interview against a real deployment with the real model (see the demo script for the environment it needs) |
| `npx playwright test job-interview` | a job interview from choosing the job to the company's approved list and the mutual yes, against a real deployment with the real model |
| `npx playwright test voice` | spoken answers in English, Finnish and Swedish through a browser whose microphone is a recording, by mouse and by finger |
| `npm run sim -- --n 15 --db` | simulated interviews against the interview rubric; reports are in [`evals/`](evals/) |
| `npx tsx evals/application-swap/run.ts` | run by hand: puts each application's answers into the other two languages and rates every version; the levels should not move. Result: [[SWAP-CHECK]] |
| `npm run seed` | builds the demo world; `--snapshot` saves it, `--reset` restores it without a model |

## Where to read more

- [`docs/PITCH.md`](docs/PITCH.md): what it is for, measured numbers, and answers to likely questions
- [`docs/specs/demo-script.md`](docs/specs/demo-script.md): the three-minute demo and a five-minute one
- [`docs/specs/job-interview.md`](docs/specs/job-interview.md): the job interview and the ranked applicants
- [`docs/design/DESIGN.md`](docs/design/DESIGN.md): the design system
- [`docs/LEAD-DECISIONS.md`](docs/LEAD-DECISIONS.md): decisions taken while building, with reasons
- [`docs/STATUS.md`](docs/STATUS.md): the progress board
- [`docs/PLAN.md`](docs/PLAN.md): the original plan

## Limits we know about

- The job data comes from the website's own endpoints of Työmarkkinatori. Production use needs its official API, which an employment authority can onboard to.
- One model provider with 40 requests a minute carries everything. It is enough for a demo and a few people at once.
- Recruitment is a high-risk use under the EU AI Act, and ranking applicants is squarely inside it. The design assumes those obligations apply. What is there: information to the person before the job interview, human oversight of every pick and every ranked list, logging in the audit trail, the person's access to their own ratings and reasons. What is not: a conformity assessment, a fundamental rights impact assessment, validation on real applicants.
- The level scale and the weights (must-have 2, nice-to-have 1) are a first version that nobody has validated with employers.
- The screening of protected details in job interview answers is word lists in three languages and can miss an unusual phrasing. Reasons are written by the model and checked by word lists; an organiser is the last check.
- The simulated applicants are played by a model from persona sheets. The prompt lab that checked the job interview's prompts (84 real model calls) rated six cases; the larger language swap check is [[SWAP-CHECK]].
- The Finnish and Swedish wording was written by the builders and wants a native reader.
- Speech recognition gets about one word in five wrong on read Finnish and Swedish sentences (one in fifteen in English), mostly names and compounds. The person sees the text and checks every note; there is no step to correct a spoken answer before it is sent. In a job interview a misheard answer is rated as heard. The person sees it and can remove it before sending, but the interview does not go back to a question already passed: a removed answer leaves that requirement unanswered, at the lowest level.
- Not built: the event agenda, email delivery, an organiser adding a person by hand, and a test that swaps names and languages to check that picks do not change.

## Sources and credits

Job postings: Lähde: Työmarkkinatorin asiakastietojärjestelmä (Job Market Finland). Skills taxonomy: ESCO, European Commission. Speech recognition: Parakeet TDT 0.6b v3 by NVIDIA (CC BY 4.0), run with sherpa-onnx; measured on FLEURS recordings (CC BY 4.0). The interviewer's voice: Piper with the voices en_GB-cori, fi_FI-harri and sv_SE-nst.
