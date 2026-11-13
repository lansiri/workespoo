# S2: Need Cards and pool evidence

You turn a real public job posting into a Need Card: what the employer is actually asking for, with questions back to the employer where a requirement may be shutting people out, and honest numbers about the pool. This is what answers Espoo's two complaints about companies: they describe needs badly and late, and they doubt the city's pool has anyone relevant.

## Yours

`src/features/needs/**`, `src/features/jobs/jobs.ts` (queue definitions for the ingestion that already exists), `src/app/api/needs/**`, `src/app/api/jobs/**`, `src/app/(company)/c/[token]/need/**`, `src/app/dev/s2/**`. The rest of `src/features/jobs/` exists; change it only to fix a bug you hit, and say so.

## Specs

`docs/specs/need-card.md` (all of it), `docs/specs/prompts/need-card-draft.md`, and section 1.2 of `docs/specs/company-view.md` (how a company sees its need). Section 3.1 of `docs/specs/matching.md` defines `touches(person, requirement)`, which your pool counts share with S3a.

## What you call

`@/lib/llm` (`chatJson` with `NeedCardDraftOutput`, role `analyst`, purpose `needs.draft`), `@/lib/esco`, `@/lib/ids`, `@/lib/audit`, `@/lib/queue`, `@/lib/session` (`companyFromToken`, `requireOrganiser`), `@/lib/http`, `@/lib/i18n`, `@/features/jobs` (`getJob`). You read the `eligibility` table that S3a writes, and the `signal`, `talent_language` and `talent` tables.

## Block 1: drafting

1. `draftNeedCard(db, jobId, companyId)`: load the posting and its sentences; build the candidate ESCO list for the prompt (`K1`, `K2`, ...) from the posting's own skill URIs, the essential skills of its occupations, and trigram candidates for salient phrases, as the spec's ESCO mapping section says; call the model; apply the validation section of the spec (drop a requirement whose sentence index is out of range or whose text hits `findProtectedCard`, cap at 12, map `K` labels to URIs and drop unknown ones); decide the statutory class by the keyword rules, using the posting's `sector`; apply the question rules (which types may be asked, when to drop a question, never for statutory requirements, wording patterns exactly as specified); assign ids with `newId("req")`; store as `draft`, version 1 or the next version on a re-draft; add `job_skill` rows with origin `needcard`; audit `needcard.drafted`; enqueue `matching.need_changed`.
2. `getNeedCard`, `getNeedCardForJob`, `listNeedCards`, each validating the stored body with the `NeedCard` schema.
3. Queue definitions in `src/features/needs/jobs.ts`: `needs.draft` and `needs.recompute_pool`. In `src/features/jobs/jobs.ts`: `jobs.ingest_tmt` (schedule every 6 hours for Espoo) and `jobs.crawl_occupations` (schedule every 30 minutes, limit 100).

Tests for block 1 with `loadJobFixtures` and `setLlmFake`: drafting from an English and a Finnish fixture posting using model outputs shaped like the spec's worked examples; each validation rule; statutory requirements never get a question and public-sector language rules are recognised; each question type fires and is dropped under its conditions; a work-permit requirement is recorded as specified and never questioned or counted; re-drafting bumps the version; the acceptance tests in section 9 that concern drafting.

## Block 2: pool evidence and the company's page (report after this)

- `recomputePoolEvidence(db, needCardId)`: the definitions and pseudo-SQL of section 5, exactly: people in the pool with an approved card; `relevant` from the `eligibility` rows for this need and version; `speakTo` through `touches`; languages through `talent_language` with the declared-only number kept separate; the exclusion number hidden for statutory requirements; "not mentioned" never worded as "lacks". Store the result on each requirement with `computedAt`. When no eligibility rows exist yet, store counts with scope `whole_pool` as the spec describes, or `null` if the spec says to show nothing: follow the spec.
- The company's flow: `POST /api/needs/[id]/answer` records an answer to a requirement's question and applies it (`make_nice` changes the kind, `remove` removes the requirement, `reworded` replaces the text, `keep` only records), bumps the version, audits `needcard.question_answered` and `needcard.edited`, and enqueues `matching.need_changed`; `POST /api/needs/[id]/confirm` sets `confirmed` and audits `needcard.confirmed`; `GET /api/needs/[id]` returns the card to its company (token) or to the organiser. `POST /api/needs/draft` lets the organiser draft a card for a posting.
- `/c/[token]/need/[needCardId]`: the masked-employer banner; title and summary; each requirement with its kind, the posting sentence it came from, its question with answer buttons, and the pool evidence in the exact display wording of section 5.4, in all three languages; confirm. Test ids per `docs/ROUTES.md`. The real employer name must not appear anywhere on this page or in its payload while the company is masked.
- `/dev/s2`: behind the organiser session: recent postings with a "draft Need Card" button and a link to the result.

Tests for block 2: pool counts on a small hand-built pool (people with approved signals, languages declared and evidenced, eligibility rows), including the honesty cases the spec lists; each answer choice; confirm; token and organiser access, and refusal without either; the payload for a masked company never contains the real employer name.

## Later, only if asked

Free editing and adding of requirements by the company, the `stale` status when a posting changes or expires, Kuntarekry and The Hub ingesters, de-duplication across sources.

## Watch out for

- Questions are questions. Never write a sentence that tells an employer a requirement is wrong.
- Posting sentences are plain 0-based indexes into `Job.sentences`; transcript sentences are 1-based. Do not mix them.
- Drafting costs a model call per posting: cache by posting and its last-modified time, and never draft inside a request that a person is waiting on unless the organiser pressed the button.
