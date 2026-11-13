# S4: the synthetic world, seeding and evaluation

The brief from Espoo requires synthetic data for people. You create the people, the demo event and the demo companies, and the harness that runs them through the real product. Your output is what the judges will see in the organiser's queue, and your evaluation report is the evidence that the interviewer behaves.

## Yours

`src/features/synth/**`, `scripts/seed.ts`, `scripts/sim.ts`, `seed/**`, `evals/**`.

## Specs

`docs/specs/synthetic-world.md` (all of it), section 10 of `docs/specs/interview.md` (the evaluation rubric, including the planted facts), and `docs/specs/demo-script.md` (what the seeded state must make possible on stage).

## What you call

`@/features/interview` (`startInterview`, `submitTurn`, `settleInterview`), `@/features/card` (`cardForPerson`, `approveCard`, `setPoolOptIn`), `@/features/needs` (`draftNeedCard`), `@/features/matching` (`computeEligibility`), `@/features/picks` (`draftDailyDigests`), `@/features/jobs`, `@/lib/queue` (`runReadyJobs`), `@/lib/llm`, `@/lib/ids`, `@/lib/lexicon`. Most of these are stubs until their streams are merged. Write against the signatures in `docs/FEATURE-API.md`, mock them in tests, and make each script fail with a clear message naming the missing feature instead of a stack trace.

There is no model key yet, so nothing you build may depend on a live model to produce the demo data. The personas and their answers are written by you, now, as files.

## Block 1: the people, as files

1. **Fifteen personas** in `seed/personas/*.json`, following the fact-sheet shape in section 2.3 and the spread in section 2.2, derived from the kinds of work in `fixtures/jobs/tmt-sample.json` so that real postings exist for them. Each persona has scripted answers for every coverage area (`recent_work`, `example`, `tools`, `people`, `beyond`, `open_floor`, `looking_for`), written the way a real person talks: concrete, uneven, sometimes brief. Ten answer in English, three in Finnish, two in Swedish. Each has one or two planted protected facts inside an answer that also contains a real skill, with the planted tokens listed, as section 10.5 of the interview spec describes. Each carries a clearly synthetic display name and contact (for example an `@example.invalid` address) for the reveal step, and the `synthetic` flag.
2. A Zod schema for the persona file and a loader that validates every file. A test that fails on a persona with a missing area, with no planted fact, or whose answers would be caught by `findBannedEvaluative` in the interviewer's mouth is not needed; a test that every persona validates is.
3. **A scripted candidate**: given a persona and an interviewer turn, return the persona's answer for that turn's target area (a probe gets a second, more concrete answer; a repair gets the same answer again; a closing gets nothing). No model involved. This is what drives simulated interviews deterministically.

## Block 2: simulation, seeding, evaluation (report after this)

- `runSimulatedInterview(db, persona, mode)`: start an interview, feed the scripted candidate's answers through `submitTurn` until the interview completes, `settleInterview`, mark the talent synthetic, store the synthetic identity, approve the card and opt in to the pool. Returns ids and the transcript.
- `npm run sim -- --n 15 [--mode express|full]`: runs the personas and writes `evals/report.md` and `evals/report.json` with every metric in section 10 of the interview spec that can be computed automatically: JSON validity of model outputs (from `llm_call`), share of evidence references that resolved, share of signals grounded in ESCO, question counts against the mode limits, language mirroring, interviewer text scanned with `findBannedEvaluative` and `findProtectedQuestion`, and the check that none of a persona's planted tokens appears anywhere on its card while the skill planted beside it does. Each metric has a pass threshold from the spec and the report states pass or fail per metric.
- `npm run seed`: idempotent. Creates the demo event (Thursday 26 November 2026, slots as specified); selects postings for masked demo companies by the rule in section 4 and creates "Demo company 01" and so on with tokens and `event_company` rows, including the pitch company with a must-have Finnish requirement that the demo script needs; drafts their Need Cards through `draftNeedCard`; runs the simulated interviews; computes eligibility; and leaves the state the demo script's "before going on stage" section expects, including the detail that every synthetic person already counts as suggested yesterday so a newly approved card is picked first. It prints the organiser passcode hint and each demo company's link. `npm run seed -- --reset` restores that state.
- Everything synthetic is labelled as section 7 requires.

Tests: the persona loader; the scripted candidate over every turn kind; `runSimulatedInterview` against mocked features; each evaluation metric on a hand-built transcript and card, including one that must fail (a planted token on a card) to prove the check bites; the seed's selection of demo postings on `loadJobFixtures`.

## Later, only if asked

Counterfactual twins and the invariance number, scaling to 50 personas, a model-driven candidate for less predictable answers, the nightly evaluation job.

## Watch out for

- Personas must not be caricatures. Vary age, origin and path through what people say about their work, never through stereotype, and remember the planted facts exist to prove the system ignores them.
- Finnish and Swedish answers must read as native speech.
- A simulated interview must go through the same public functions a real one does. Do not write to the interview or card tables directly, except for the synthetic flag and identity.
