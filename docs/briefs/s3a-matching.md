# S3a: matching and the person's job feed

You decide, in both directions, what relates to what, without ever ranking a person. For the person, that is a feed of real open postings with a plain reason each. For a need, it is a yes or no per person plus the set of requirements their card speaks to, which S3b's picks and S2's pool evidence both read.

## Yours

`src/features/matching/**`, `src/app/api/matches/**`, `src/app/(talent)/matches/**`.

## Specs

`docs/specs/matching.md` (all of it), `docs/specs/prompts/match-reasons.md`. The acceptance tests in section 4 are the ones that prove no hidden ranking exists: treat them as the point of the stream.

## What you call

`@/lib/llm` (`chatJson` with `MatchReasonsOutput`, role `analyst`, purpose `matching.feed_reasons`), `@/lib/esco`, `@/lib/sql` (`rowsOf`), `@/lib/audit`, `@/lib/queue`, `@/lib/session`, `@/lib/http`, `@/lib/i18n`. `@/features/card` (`getApprovedCard`), `@/features/needs` (`getNeedCardForJob`; enqueue `needs.draft` and `needs.recompute_pool`), `@/features/intros` (`introsForTalent`). The last two are stubs until merged: mock them in tests and catch their failure in real code (an empty list of introductions; reasons without "not mentioned" items).

## Block 1: eligibility

1. The `touches(person, requirement)` predicate of section 3.1, as one SQL-backed function with its threshold as a named constant: an approved signal's ESCO URI is among the requirement's URIs, or is linked through an occupation as the spec allows, or the signal phrase is trigram-similar to the requirement text at or above the threshold. Language, authorisation and "other" requirements never touch anyone, as specified.
2. `computeEligibility(db, scope)`: for one need against everyone in the pool with an approved card, or for one person against every need. Apply the rule of section 3.2 exactly (at least 2 of the need's skill, experience or education requirements, or 1 when it has fewer than 3; must and nice count the same). Write one `eligibility` row per pair with `eligible`, `touchedRequirementIds`, the versions and `computedAt`. There is no count column and you must not add one, in the table or in memory that outlives the function. Audit `eligibility.computed` with row counts only.
3. Queue definitions in `src/features/matching/jobs.ts`: `matching.card_approved` (compute the feed, then eligibility for the person, then enqueue `needs.recompute_pool` for each need whose rows changed) and `matching.need_changed` (eligibility for the need, then `needs.recompute_pool`).

Tests for block 1 on `loadJobFixtures` plus a small hand-built pool (insert talents with approved `signal` rows whose ESCO URIs you look up by label in the fixture concepts, and need cards written by hand as valid `NeedCard` bodies): each branch of `touches`; the threshold rule at its boundaries; that changing a requirement from must to nice changes nothing; that a language requirement neither includes nor excludes; that no row or return value exposes how many requirements were touched beyond the set itself; idempotency; the job handlers with `runReadyJobs`.

## Block 2: the feed and its page (report after this)

- `computeFeed(db, talentId)`: the retrieval of section 2 (postings linked directly to the person's skill URIs through `job_skill`, postings linked through occupations, bilingual text search built from ESCO labels in English and Finnish and from `lookingFor.roles`, freshness and location as tie-breaks), excluding postings that belong to a masked demo company. Take the number of candidates the spec says, keep the feed size it says, and record `basis` per posting. For each kept posting, compute the allowed (signal, posting sentence) pairs in code, ask the model only to word the reasons, apply every code check in `match-reasons.md` (the allowed pairs, the banned-word pattern, de-duplication), and fall back to the code-rendered reason with `reasonsSource: "code"`. `notMentioned` comes from the posting's Need Card when one exists; when none exists, enqueue `needs.draft` for it with `companyId: null` and leave the list empty for now. Replace the person's previous feed rows. Ordering postings for the person is allowed.
- `feedForTalent(db, talentId)` returning each match with its `Job`.
- `GET /api/matches`: the session talent's feed and their introductions.
- `/matches`: each posting with title, real employer name, municipality, a link out, the source attribution line from `JOB_SOURCE_ATTRIBUTION`, its reasons ("From your card" with the rendering and a way to see their own words; "From the posting" with the sentence), and the "not mentioned in your conversation" items worded as the spec says. Below, introduction requests with accept and decline, which call `POST /api/intros/[id]/respond` (S3b's route); accepting asks for the person's name and a contact first, because that is the moment identity is collected. Test ids per `docs/ROUTES.md`. An empty feed explains itself and points at editing the card.

Tests for block 2 with `setLlmFake`: retrieval on the fixtures for a person with software skills and one with care or logistics skills (the right kinds of postings come back, masked ones never do); every "bad output" case listed in `match-reasons.md` is caught; the code fallback; the feed is stable for the same card version; twins with identical signals and different handles get identical feeds.

## Later, only if asked

Refreshing the feed when new postings arrive, a per-person "why not this job" explanation.

## Watch out for

- The reason prompt must never receive the transcript, the handle, the interview language or the input mode: only signal phrases, renderings and posting sentences.
- Reasons describe the relation between a card and a posting. They never describe the person.
- Keep every threshold as a named constant in one file so the lead can tune them on real data.
