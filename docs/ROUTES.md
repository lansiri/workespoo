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
| `GET /api/health` | lead | Exists |

## Test ids on the golden path

| Page | Test ids |
|---|---|
| every page (header) | `language-switcher`, `lang-en`, `lang-fi`, `lang-sv`, `site-logo` |
| `/interview` | `consent-interview`, `consent-voice`, `consent-live-demo`, `mode-express`, `mode-full`, `cv-text` (optional pasted CV), `start-interview` |
| `/interview/[id]` | `interviewer-text` (latest interviewer line), `transcript`, `answer-input`, `send-answer`, `talk-button`, `signal-chip` (one per signal, with `data-signal-id`), `jobs-lit-count`, `interview-done`, `go-to-card`, `turn-remove` (removes one of the person's own answers) |
| `/card` | `card-headline`, `card-signal` (with `data-signal-id`), `signal-quote`, `signal-rendering`, `signal-remove`, `approve-card`, `card-approved`, `pool-opt-in`, `go-to-matches`, `export-data`, `delete-data`, `delete-data-confirm` |
| `/matches` | `job-match`, `match-reason`, `not-mentioned`, `job-link`, `source-attribution`, `intro-request`, `intro-accept`, `intro-decline`, `intro-status` |
| `/organiser` | `passcode-input`, `passcode-submit`, `reset-demo`, `reset-demo-confirm` |
| `/organiser/audit` | `audit-row` (with `data-action`), `audit-filter` |
| `/organiser/exposure` | `exposure-band` (with `data-band`), `exposure-handle` |
| `/organiser/review` | `run-daily`, `review-digest` (with `data-digest-id`), `review-pick` (with `data-pick-id`), `pick-reason`, `pick-approve`, `pick-remove`, `pick-remove-reason`, `publish-digest`, `digest-link` |
| `/c/[token]` | `masked-banner`, `need-link`, `pick-card`, `pick-reason`, `pick-not-mentioned`, `ask-to-meet`, `intro-status`, `revealed-name`, `revealed-quote` |
| `/c/[token]/need/[needCardId]` | `need-title`, `requirement` (with `data-requirement-id`), `requirement-question`, `question-answer-keep`, `question-answer-make_nice`, `pool-evidence`, `confirm-need` |
