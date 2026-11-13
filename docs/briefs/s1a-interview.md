# S1a: the interview engine

You build the conversation itself: the thing a jobseeker talks to. It is the centrepiece of the product and of the live demo.

## Yours

`src/features/interview/**`, `src/app/api/interview/**`, `src/app/(talent)/interview/**`, `src/app/dev/s1/**`.

## Specs

`docs/specs/interview.md` (all of it), `docs/specs/prompts/interviewer-live.md`, `docs/specs/prompts/turn-extractor.md`. For the words the interviewer says without a model, and for stopwords and command words, use `src/lib/i18n/content/interview-lines.ts` (all three languages), not the spec text.

## What you call

- `@/lib/llm`: `chatStream` (role `live`, purpose `interview.live`) and `chatJson` with `ExtractorOutput` (role `live`, purpose `interview.extract`).
- `@/lib/sentences`, `@/lib/lexicon`, `@/lib/esco` (`escoTopMatch`), `@/lib/jobs-lit` (`jobsLitForSkillUris`), `@/lib/ids`, `@/lib/session`, `@/lib/consent`, `@/lib/audit`, `@/lib/http`, `@/lib/sse`, `@/lib/i18n`.
- `@/features/card`: `synthesiseCard(db, interviewId)` when an interview ends. Until S1b is merged the stub throws: catch any failure, publish an `error` event with `retryable: true`, and leave the interview `completed`. In tests, mock it.
- `@/features/voice` (client): `useVoice` and `PushToTalkButton` on the interview page.

## Block 1: a whole interview in text (report after block 2)

1. `startInterview`: reject unless `consent.interview` is true; create the talent with a handle from `newHandle`; when `consent.liveDemo` is true set `liveDemo` and `purgeAfter` (now plus `LIVE_SESSION_TTL_HOURS`); record consents; create the interview with `initialInterviewState`; store the scripted opening as turn 0 (kind `opening`, target `recent_work`); audit `interview.started`.
2. `submitTurn`, following section 6 of the spec in order: store the participant turn (cap 2,000 characters, `splitSentences`, detect language with the three stopword lists, kind `answer`, target = the area of the question it answers); audit `interview.turn` with counts only; the pre-check for stop and skip commands and for empty or garbled input (repair lines, at most two in a row); the deterministic planner of section 4 for both modes; the live call with the prompt from `interviewer-live.md`, streamed through the output guard of section 7 using `findBannedEvaluative` and `findProtectedQuestion`, falling back to a bank question in the reply language; store the interviewer turn with its kind and target; yield `turn.delta` per emitted sentence and `turn.done`.
3. In parallel with the live call, the turn extractor: prompt from `turn-extractor.md`, the lenient coercions as `coerce`, then every merge rule (resolve references against stored sentences, drop what does not resolve, `findProtectedCard` and `stripQualityWords` on phrases, de-duplication, ids `s1`, `s2`, ..., ESCO top match, the cap of 20). Upsert `signal` rows with status `proposed`. Publish `signal.proposed`, `signal.updated` (use `toSignalPublic`), `coverage.updated` and `jobs.lit` to the `interview_event` table and to in-process listeners. An extractor failure never fails the turn.
4. Ending: scripted closing (kind `closing`), status `completed`, `interview.completed`, wait up to 8 seconds for outstanding extraction, call `synthesiseCard`, publish `card.ready`. `stopInterview` does the same from outside. `settleInterview` resolves when nothing is outstanding.
5. `followEvents`: replay rows after `afterEventId`, then follow new ones (in-process emitter plus a one-second poll of the table as a safety net) until aborted.
6. Routes per `docs/ROUTES.md`: `POST /api/interview` sets the talent session; the turn and events routes require the session's talent to own the interview and respond with `sseResponse`; the events route honours `Last-Event-ID`.

Tests for block 1: the planner as a table of cases for both modes; the pre-check; the guard (praise dropped, protected question dropped, second question cut, fallback used, `[[STOP]]`); every extractor merge rule; language detection in English, Finnish and Swedish; and a full express interview and a full-mode interview driven by `setLlmFake`, asserting the question count, the stored turns with kinds and targets, the signal rows, the events in order, the closing, and that `synthesiseCard` was called once. Add the adversarial acceptance tests from section 11 that concern the engine: an invented reference is dropped, volunteered protected information never reaches a signal, an instruction to ignore the rules changes nothing.

## Block 2: the pages

- `/interview`: consent (interview, voice vendor when voice is on, live demo), mode choice, start. Wording from `consentCopy` and `interviewCopy`. No name is asked for here.
- `/interview/[id]`: the interviewer's line as it streams, the transcript, a text box and send button, the push-to-talk button when voice is available (speak each interviewer sentence with `speakSentences` in the conversation's locale, send the transcript on release), signal chips as they arrive, the "jobs lit" count, coverage as a quiet progress hint, and at the end a "Preparing your notes" state that turns into a link to `/card` when `card.ready` arrives. The page reconnects to the events stream after a drop. Test ids per `docs/ROUTES.md`.
- `/dev/s1`: behind the organiser session, a plain list of recent interviews with mode, status, question count, coverage and signal count.

Keep interview state in a hook (`useInterview`) that owns the two streams, so Phase 3 can restyle the page freely.

## Later, only if asked

The "delete this" redaction command, CV seeding, transcript export, the time caps under real time.

## Watch out for

- The live reply must feel fast: start the model call before the extractor finishes, emit the first sentence as soon as the guard has it, and never wait on the database for anything the reply does not need.
- A turn that arrives while a reply is streaming aborts that reply and is processed normally (barge-in).
- The same turn submitted twice (a retry after a network error) must not create two answers: make turn submission idempotent on a client-supplied id or on the turn index.
- Nothing about the person's manner, speed or mistakes is stored anywhere.
