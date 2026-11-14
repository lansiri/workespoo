# Routes and test ids

Lead-owned. Streams implement exactly these paths. Phase 2 pages are unstyled but real; Phase 3 restyles them without changing paths or test ids. Add a `data-testid` from the lists below to the element named; add more of your own freely, but never rename these.

## Pages

| Route | Stream | Purpose |
|---|---|---|
| `/` | lead | Landing page |
| `/how-it-works` | lead | Public responsible-AI page (text in `docs/specs/responsible-ai.md`) |
| `/interview` | S1 | Consent, mode choice, start |
| `/interview/[id]` | S1 (voice controls from S4) | The live interview |
| `/card` | S1 | The person reviews, edits and approves their own card |
| `/matches` | S3 | The person's job feed and introduction requests to answer |
| `/organiser` | S3 | Passcode entry, then overview |
| `/organiser/review` | S3 | Review queue: approve or remove picks one by one, publish digests |
| `/organiser/audit` | S3 | Second pass: the audit log, newest first, filter by action |
| `/organiser/exposure` | S3 | Second pass: who has been suggested how often, in bands, so nobody stays unseen |
| `/organiser/pool`, `/organiser/unmatched`, `/organiser/settings`, `/organiser/people/[talentId]` | S3 | Later |
| `/c/[token]` | S3 | Company digest: masked banner, picks with reasons, "ask to meet" |
| `/c/[token]/need/[needCardId]` | S2 | Company's Need Card: requirements, questions, pool evidence, confirm |
| `/apply` | S5 | The event's jobs a person can apply to with a job interview (`docs/specs/job-interview.md`) |
| `/apply/[id]` | S5 | One application by status: the start screen (`/apply/new?job=<jobId>`), the job interview room, review and sending, the result with the ratings |
| `/organiser/applicants` | S5 | Jobs with applicants and whether their order is approved |
| `/organiser/applicants/[jobId]` | S5 | The ranked list of one job: ratings, reasons, the person's answers on demand, move with a reason, approve |
| `/c/[token]/applicants` | S5 | The company's approved list of applicants: order, ratings, reasons, "ask to meet" |
| `/agenda/[token]` | S3 | Static event agenda (second pass) |
| `/dev` and `/dev/<stream>` | each stream | Plain test pages. `/dev/s1`, `/dev/s2`, `/dev/s3`, `/dev/voice` |

## API

| Method and path | Stream | Notes |
|---|---|---|
| `POST /api/interview` | S1 | `StartInterviewRequest` to `StartInterviewResponse`; sets the talent session cookie |
| `POST /api/interview/[id]/turn` | S1 | `TurnRequest`; server-sent events: `turn.delta`, `turn.done` |
| `GET /api/interview/[id]/events` | S1 | Server-sent events: signals, coverage, `jobs.lit`, `interview.completed`, `card.ready`. Supports `Last-Event-ID`. |
| `POST /api/interview/[id]/stop` | S1 | Ends the interview early |
| `POST /api/interview/[id]/remove` | S1 | `{ turnIndex }`: removes one of the person's own answers; answers `{ turnIndex, text }` with the scripted confirmation and the next question |
| `GET /api/card` | S1 | `CardForPerson` for the session's talent |
| `PATCH /api/card` | S1 | Edits: remove a signal, edit a phrase, edit `lookingFor` |
| `POST /api/card/approve` | S1 | Approves the draft |
| `POST /api/card/pool` | S1 | `{ inPool: boolean }` |
| `GET /api/me/export` | S1 | Second pass: everything stored about the session's person, as one JSON download |
| `DELETE /api/me` | S1 | Second pass: deletes the session's person and everything that hangs off them; clears the session |
| `GET /api/matches` | S3 | The session talent's job feed and pending introductions |
| `POST /api/intros` | S3 | A company asks to meet (company token in the body) |
| `POST /api/intros/[id]/respond` | S3 | The person accepts or declines. Body: `IntroResponseRequest` (`{ decision: "accept", displayName, contact }` or `{ decision: "decline" }`) |
| `POST /api/organiser/login` | S3 | `{ passcode }`; sets the organiser session |
| `GET /api/picks/queue` | S3 | Draft digests with their picks, for the organiser |
| `POST /api/picks/decision` | S3 | `{ pickId, decision: "approve" | "remove", reasonCode?, note? }` |
| `POST /api/picks/run` | S3 | Runs the daily drafting job now (organiser) |
| `POST /api/digests/[id]/publish` | S3 | Publishes a digest; refuses while any pick is undecided |
| `GET /api/organiser/audit` | S3 | Second pass: audit rows, newest first; `?action=` and `?before=` |
| `GET /api/organiser/exposure` | S3 | Second pass: exposure bands |
| `POST /api/organiser/reset-demo` | S3 | Second pass: restores the demo snapshot through `resetDemoFromSnapshot` |
| `GET /api/needs/[id]` | S2 | The Need Card; company token or organiser session |
| `POST /api/needs/[id]/answer` | S2 | The company answers a requirement question |
| `POST /api/needs/[id]/confirm` | S2 | The company confirms the card |
| `POST /api/needs/draft` | S2 | Organiser: draft a Need Card for a posting |
| `GET /api/voice/config` | S4 | `VoiceConfig` |
| `POST /api/voice/token` | S4 | `VoiceTokenResponse` (single-use speech-to-text token) |
| `POST /api/voice/tts` | S4 | `TtsRequest`; streams audio |
| `POST /api/voice/stt` | S4 | A stretch of speech as raw 16 kHz mono 16-bit PCM in the body; answers `SttResponse`. Needs a talent session with voice consent (or an organiser session). The audio is held in memory only (`docs/research/voice-stt.md`) |
| `GET /api/application/jobs` | S5 | The event's jobs for the signed-in person, with the status of their own application to each |
| `POST /api/application` | S5 | `StartApplicationRequest` to `StartApplicationResponse`; needs an approved card and the `job_assessment` consent |
| `GET /api/application/[id]` | S5 | The person's own application: plan, turns, state, and the assessment once it exists |
| `POST /api/application/[id]/turn` | S5 | `ApplicationTurnRequest`; server-sent events of `ApplicationEvent` |
| `POST /api/application/[id]/skip`, `/stop`, `/remove`, `/submit` | S5 | Skip the current question (events), stop, remove an answer (`{ turnIndex }`), send the application |
| `DELETE /api/application/[id]` | S5 | Withdraws: deletes the application everywhere |
| `GET /api/organiser/applicants`, `GET /api/organiser/applicants/[jobId]` | S5 | The organiser's overview and one job's ranked list |
| `GET /api/organiser/applicants/[jobId]/evidence?application=<id>` | S5 | The person's own words behind one application's ratings |
| `POST /api/organiser/applicants/[jobId]/move`, `/unpin`, `/approve` | S5 | `MoveApplicantRequest`; `{ applicationId }`; approve the order for the company |
| `POST /api/applicants/meet` | S5 | A company asks to meet an applicant on its approved list (`{ token, applicationId }`) |
| `GET /api/health` | lead | Exists |

## Test ids on the golden path

| Page | Test ids |
|---|---|
| every page (header) | `language-switcher`, `lang-en`, `lang-fi`, `lang-sv`, `site-logo` |
| `/interview` | `consent-interview`, `consent-voice`, `consent-live-demo`, `interview-language`, `mode-express`, `mode-full`, `cv-text` (optional pasted CV), `start-interview` |
| `/interview/[id]` | `interviewer-text` (latest interviewer line), `transcript`, `answer-input`, `send-answer`, `talk-button` (with `data-state`), `voice-status`, `voice-partial` (the words so far while the button is held), `voice-final`, `signal-chip` (one per signal, with `data-signal-id`), `jobs-lit-count`, `interview-done`, `go-to-card`, `turn-remove` (removes one of the person's own answers) |
| `/card` | `card-headline`, `card-signal` (with `data-signal-id`), `signal-quote`, `signal-rendering`, `signal-remove`, `approve-card`, `card-approved`, `pool-opt-in`, `go-to-matches`, `export-data`, `delete-data`, `delete-data-confirm` |
| `/apply` | `apply-job` (with `data-job-id`), `apply-start`, `apply-continue`, `apply-open` |
| `/apply/[id]` | start: `apply-consent`, `apply-language`, `apply-begin`; room: `interviewer-text`, `answer-input`, `send-answer`, `talk-button`, `apply-requirement` (with `data-requirement-id` and `data-progress`), `apply-skip`, `apply-stop`; review: `apply-review`, `apply-answer`, `apply-remove-answer`, `apply-send`; result: `apply-result`, `apply-rating` (with `data-requirement-id` and `data-level`), `apply-points`, `apply-position`, `apply-withdraw` |
| `/organiser/applicants` | `applicants-job` (with `data-job-id`) |
| `/organiser/applicants/[jobId]` | `ranked-applicant` (with `data-application-id` and `data-position`), `ranked-points`, `ranked-rating`, `ranked-evidence`, `ranked-move`, `ranked-move-position`, `ranked-move-reason`, `ranked-move-confirm`, `ranked-unpin`, `ranked-approve`, `ranked-status` |
| `/c/[token]/applicants` | `company-applicant` (with `data-position`), `company-rating`, `ask-to-meet`; `applicants-link` on `/c/[token]` |
| `/matches` | `job-match`, `match-reason`, `not-mentioned`, `job-link`, `source-attribution`, `intro-request`, `intro-accept`, `intro-decline`, `intro-status` |
| `/organiser` | `passcode-input`, `passcode-submit`, `reset-demo`, `reset-demo-confirm` |
| `/organiser/audit` | `audit-row` (with `data-action`), `audit-filter` |
| `/organiser/exposure` | `exposure-band` (with `data-band`), `exposure-handle` |
| `/organiser/review` | `run-daily`, `review-company` (one per company in the rail, with `data-digest-id`; the queue shows one company at a time), `review-digest` (with `data-digest-id`), `review-pick` (with `data-pick-id`), `pick-reason`, `pick-approve`, `pick-remove`, `pick-remove-reason`, `publish-digest`, `digest-link` |
| `/c/[token]` | `masked-banner`, `need-link`, `pick-card`, `pick-reason`, `pick-not-mentioned`, `ask-to-meet`, `intro-status`, `revealed-name`, `revealed-quote` |
| `/c/[token]/need/[needCardId]` | `need-title`, `requirement` (with `data-requirement-id`), `requirement-question`, `question-answer-keep`, `question-answer-make_nice`, `pool-evidence`, `confirm-need` |
