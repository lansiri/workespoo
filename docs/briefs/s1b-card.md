# S1b: the Signal Card

You turn a finished conversation into a card the person owns: skills in plain English, each pointing at the person's own words, which they review, change and approve. Nothing downstream may use a card the person has not approved.

## Yours

`src/features/card/**`, `src/app/api/card/**`, `src/app/api/me/**`, `src/app/(talent)/card/**`.

## Specs

`docs/specs/signal-card.md` (all of it), `docs/specs/prompts/card-synthesis.md` (prompts A, B and C), and section 10.4 of `docs/specs/interview.md` for how card text is checked. Interface wording comes from `cardCopy` and `poolCopy` in `src/lib/i18n/content/copy.ts`.

## What you call

`@/lib/llm` (`chatJson` with `SynthOutput`, role `analyst`, purpose `card.synthesis`; prompt B with purpose `card.render`), `@/lib/sentences` (`renderEvidence`), `@/lib/lexicon` (`findProtectedCard`, `stripQualityWords`), `@/lib/esco`, `@/lib/session`, `@/lib/audit`, `@/lib/consent`, `@/lib/queue` (`enqueue`, `defineJob`), `@/lib/http`, `@/lib/i18n`. You read the `interview`, `turn` and `signal` tables that S1a writes; you do not import S1a's code.

## Block 1: synthesis and the projections

1. `synthesiseCard(db, interviewId)`: load the participant turns that are not redacted and the live `signal` rows; build prompt A; validate with `SynthOutput`; then the "Code after A" steps in order: resolve every evidence label against the stored sentences and drop signals with none left; `findProtectedCard` on headline, summary, phrases and renderings (a hit in a signal drops the signal and audits `card.protected_dropped` with no content; a hit in headline or summary falls back to the code-built ones); `stripQualityWords`; ids (keep the single source id, else the next free one); truncate to `MAX_SIGNALS[mode]`; `lookingFor.roles` only when `rolesEvidence` resolves; ESCO grounding (start with `escoTopMatch`; prompt C is a later refinement). Store the result as the `draft` row in `signal_card` with `companyView` built from the renderings (`label` from the copy, `stale: false`). Audit `card.synthesised` with counts. On a second validation failure use the fallback path from the spec and audit `card.synthesis_fallback`. With no signals at all, store an empty draft the person can add to.
2. The projections, built strictly from the contract types so hidden fields are absent: `cardForPerson` (newest card, quotes rendered by `renderEvidence`), `cardForCompany`, `cardForOrganiser`, `cardForCompanyRevealed` (approved card only; quotes, `phraseOwn`, identity from `talent_identity`, interview language and input modes), `getApprovedCard`.
3. `approveCard`: refuse when a rendering is stale or a signal fails `signalEvidenceIsValid`; turn the draft into the approved row (the previous approved row is deleted, version carried forward as the spec's versioning section says); replace the person's `signal` rows with the card's signals at status `approved`; rebuild `talent_language` from `lookingFor.workLanguages` as `declared` (map common language names in the three interface languages to ISO 639-1 codes; skip what you cannot map); audit `card.approved`; enqueue `matching.card_approved` with `{ talentId, cardVersion }`.
4. `setPoolOptIn`: sets `talent.inPool`, records or withdraws the `pool` consent, audits `pool.opted_in` or `pool.opted_out`. Opting in requires an approved card.
5. A job `trust.purge_live_sessions` with a schedule every 30 minutes: delete talents where `liveDemo` is true and `purgeAfter` has passed (the cascade removes the rest), and audit `talent.purged` with a count. Export `jobs` and `schedules` from `src/features/card/jobs.ts`.

Tests for block 1: synthesis from a stored transcript with `setLlmFake` (happy path; an invented label dropped; a signal naming a country dropped with the audit event; quality words stripped; truncation; the fallback path; the empty card); each projection compared key by key against what its audience may see, including a test that serialises `cardForCompany` and `cardForOrganiser` and asserts that no quote text, name, language code or input mode appears anywhere in the JSON; approval (signal rows replaced, language rows built, job enqueued, stale rendering refused); pool opt-in rules; the purge with an injected clock.

## Block 2: review (report after this)

- `PATCH /api/card` on the draft: remove a signal; edit a phrase (run `stripQualityWords` and `findProtectedCard`; keep the original in `phraseOwn`; set that signal's rendering to the code-built sentence "The person describes {phrase}." and `stale: false`, with prompt B as a later refinement); edit `lookingFor`. If only an approved card exists, the first edit creates a draft at the next version, as the versioning section describes. Audit each edit.
- `GET /api/card`, `POST /api/card/approve`, `POST /api/card/pool`, all for the session's talent.
- `/card`: headline; each signal with its phrase, ESCO label in English and Finnish, "your words" (the quotes), "shown to companies as" (the rendering, labelled as an AI rendering), a remove button and an inline phrase edit; the `lookingFor` form; approve; after approval the pool opt-in checkbox and a link to `/matches`. Test ids per `docs/ROUTES.md`. While synthesis is still running, show the waiting state and poll.

## Later, only if asked

Prompt B re-rendering after edits, prompt C for ESCO choice, correcting transcript sentences, adding one's own signal with a `review_note` turn, export (`GET /api/me/export`) and delete (`DELETE /api/me`).

## Watch out for

- A draft and an approved card can exist at once. Matching and companies only ever see the approved one.
- Renderings shown to companies must carry no quote, no name, no place, no language and no fluency cue. When in doubt, drop the rendering and use the code-built sentence.
- Do not put anything derived from `hasExample` into any payload.
