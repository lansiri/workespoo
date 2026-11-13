# S3b: daily picks, the organiser's review, the company's digest, introductions

You build the judges' own seat. Espoo's organisers are the jury, and this is where they see that a person, not the AI, decides who gets suggested to whom. You also build what a company sees and the mutual opt-in that reveals who someone is.

## Yours

`src/features/picks/**`, `src/features/intros/**`, `src/app/api/picks/**`, `src/app/api/digests/**`, `src/app/api/intros/**`, `src/app/api/organiser/**`, `src/app/(organiser)/**`, `src/app/(company)/c/[token]/page.tsx` (and components for it under `src/features/picks/`), `src/app/dev/s3/**`.

## Specs

`docs/specs/picks-and-intros.md` (all of it), `docs/specs/prompts/picks-draft.md`, sections 3.3 to 3.5 of `docs/specs/matching.md` (choosing the handful, display order, reason format), sections 1, 2, 3.1 and 3.2 of `docs/specs/organiser-console.md`, and `docs/specs/company-view.md`.

One change to the specs' flow, from `docs/LEAD-DECISIONS.md`: a person's name and contact are collected when they accept an introduction, not at consent.

## What you call

`@/lib/llm` (`chatJson` with `PicksDraftOutput`, role `analyst`, purpose `picks.reasons`), `@/lib/ids`, `@/lib/audit`, `@/lib/queue`, `@/lib/session` (`requireOrganiser`, `verifyOrganiserPasscode`, `setOrganiserSession`, `companyFromToken`, `requireTalent`), `@/lib/http`, `@/lib/sql`, `@/lib/i18n`. `@/features/card` (`cardForOrganiser`, `cardForCompany`, `cardForCompanyRevealed`), `@/features/needs` (`getNeedCard`, `listNeedCards`). You read the `eligibility` table that S3a writes. The other features are stubs until merged: mock them in tests.

## Block 1: drafting and the organiser's review

1. `draftDailyDigests(db, date)`: for each participating company and each of its Need Cards, take the people who are eligible (`eligibility.eligible`), in the pool, with an approved card; apply the selection rule of `matching.md` 3.3 exactly (never-suggested first, then least recently suggested, ties broken by `sha256(seed:talentId)`, not the same company again within the rotation window, at most the daily cap per person), with the settings from `MATCHING_SETTINGS_DEFAULTS` overridable through `app_meta`. Nothing about how many requirements a person touches may influence selection. For each pick, compute the allowed (requirement, signal) pairs from `touchedRequirementIds` and the person's approved signals, ask the model only to word the reasons, apply every code check in `picks-draft.md`, and fall back to code-rendered reasons. `notMentioned` is the need's requirement ids outside the touched set. One draft digest per company and day with its seed; running it twice changes nothing. Record `selection` on each pick. Audit `digest.drafted` and `pick.drafted`. A need with nobody eligible goes into `emptyNeeds`.
2. Queue definition `picks.draft_daily` with an hourly schedule that enqueues once per day after `dailyRunAt`, in `src/features/picks/jobs.ts`.
3. Organiser API: `POST /api/organiser/login`; `GET /api/picks/queue` (draft digests grouped by company, each pick with the `CardForOrganiser` projection, its reasons with the requirement text, and its "not mentioned" items; picks in the seeded shuffled order, labelled as being in no particular order); `POST /api/picks/decision` (approve, or remove with a reason code from the spec's list and an optional note; a removal without a reason code is refused; undo while the digest is a draft); `POST /api/picks/run`; `POST /api/digests/[id]/publish` (refused while any pick is undecided; sets `published`, records who and when). There is no endpoint that decides more than one pick. Audit `pick.approved`, `pick.removed`, `pick.decision_undone`, `digest.published`.
4. `/organiser`: passcode entry, then a short overview with a link to the review queue. `/organiser/review`: the queue as section 3.2 describes it, with the keyboard flow (`a` approve, `r` remove then a reason number and Enter, `p` publish, arrow keys or `j` and `k` to move), "Run today's picks now", and after publishing the company's link for the demo. Test ids per `docs/ROUTES.md`.

Tests for block 1 on a hand-built pool (talents with approved cards as rows, need cards as valid bodies, eligibility rows inserted directly) with `setLlmFake`: the rotation rule case by case; the daily cap; the rotation window; idempotency; the test from the spec that over many seeds a person who touches more requirements is selected no more often than one who touches fewer; every "bad output" case in `picks-draft.md`; decisions (reason required on removal, undo, no bulk path, organiser session required); publish gating; the queue payload contains no quote, name, language or input mode.

## Block 2: the company's digest and the mutual opt-in (report after this)

- `/c/[token]`: the masked banner that cannot be dismissed; the company's needs with a link to each Need Card page (S2's route); the approved picks of the latest published digest in shuffled order, each showing the `CardForCompany` projection, its reasons and "not mentioned" items with the spec's line that not mentioned does not mean missing; "ask to meet". Never a name, never a number, never an order that means anything. Test ids per `docs/ROUTES.md`.
- Introductions, following the state machine in section 6 with its transition table and a 409 for anything else: `POST /api/intros` (a company, by token, asks to meet a person from an approved pick: status `awaiting_talent`); `POST /api/intros/[id]/respond` (the person, by session, accepts with a name and a contact, or declines). On acceptance: write `talent_identity`, set `acceptedAt` and `revealedAt`, audit `intro.accepted` and `identity.revealed`. `introsForTalent(db, talentId)` for the `/matches` page.
- After acceptance, `/c/[token]` shows the reveal block for that person from `cardForCompanyRevealed`: name, contact and their own words, labelled as shown after both agreed. Before acceptance none of that is in the payload.

Tests for block 2: every allowed and refused transition as a table; a company cannot ask to meet someone who is not in one of its approved picks; a declined introduction reveals nothing; the page payload before acceptance, serialised, contains no identity or quote; after acceptance it does, for that pair only.

## Later, only if asked

The unmatched queue, the exposure view, adding a pick by hand, requests a person starts themselves, agenda slots and static agenda pages, notifications, the audit and settings screens, expiry of unanswered requests.

## Watch out for

- "Remove" needs a reason because the organiser's judgement is part of the record. "Approve" does not, but it must be one deliberate action per person.
- The seeded shuffle must differ between digests and be reproducible from the stored seed.
- A pick's reasons were written for specific card and need versions. If either has moved on when the organiser opens the queue, show that the pick is out of date instead of silently showing old reasons.
