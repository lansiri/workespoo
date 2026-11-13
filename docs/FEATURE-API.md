# Feature public APIs and the events between features

Lead-owned. A feature may import another feature only through its `index.ts` (`@/features/<name>`), and only the functions listed here. Everything else crosses features through the database tables or through queue jobs. Stub `index.ts` files exist on `main` for every function below; the owning stream replaces the stub bodies and must keep the signatures.

`Db` comes from `@/db/client`. Contract types come from `@/contracts`.

## Streams and what they own

| Stream | Feature folders | Builds |
|---|---|---|
| S1a | `interview` | The interview engine and its pages |
| S1b | `card` | Card synthesis, review, approval, the four audience projections |
| S2 | `jobs`, `needs` | Ingestion (exists), Need Cards, pool evidence, the company's Need Card page |
| S3a | `matching` | Eligibility, the person's job feed and its page |
| S3b | `picks`, `intros` | Daily digests, organiser review, the company digest page, introductions |
| S4 | `voice`, `synth` | Voice (exists), personas, simulated candidates, seeding, evaluation |

## `@/features/interview` (S1a)

```ts
/** Creates the talent, consent records and interview, stores the scripted opening turn. */
export function startInterview(db: Db, request: StartInterviewRequest): Promise<StartInterviewResponse>;

/**
 * Handles one participant turn end to end: store it, plan, stream the interviewer's reply,
 * run the extractor, and at the end of the interview trigger card synthesis.
 * Yields the events for this turn (`turn.delta`, `turn.done`, and anything produced before
 * the reply finished). Background events are also persisted to `interview_event`.
 */
export function submitTurn(db: Db, interviewId: string, request: TurnRequest,
  opts?: { signal?: AbortSignal }): AsyncIterable<InterviewEvent>;

/** Replays stored events after `afterEventId`, then follows new ones until aborted. */
export function followEvents(db: Db, interviewId: string,
  opts?: { afterEventId?: number; signal?: AbortSignal }): AsyncIterable<{ id: number; event: InterviewEvent }>;

/** Ends the interview early with the scripted closing and triggers synthesis. */
export function stopInterview(db: Db, interviewId: string): Promise<void>;

/** Resolves once background work for the interview (extraction, synthesis) has finished. For tests and the simulator. */
export function settleInterview(db: Db, interviewId: string, timeoutMs?: number): Promise<void>;
```

## `@/features/card` (S1b)

```ts
/**
 * Builds the draft card from the interview's transcript and live signals (analyst model,
 * with the fallback path). Called by the interview engine when an interview ends.
 */
export function synthesiseCard(db: Db, interviewId: string):
  Promise<{ talentId: string; version: number; fallback: boolean }>;

/** The person's own view of their newest card (draft if one exists, else approved). */
export function cardForPerson(db: Db, talentId: string): Promise<CardForPerson | null>;
/** Projections of the APPROVED card. Null when the person has no approved card. */
export function cardForCompany(db: Db, talentId: string): Promise<CardForCompany | null>;
export function cardForOrganiser(db: Db, talentId: string): Promise<CardForOrganiser | null>;
/** Only call after checking that an introduction between the two is `accepted`. */
export function cardForCompanyRevealed(db: Db, talentId: string): Promise<CardForCompanyRevealed | null>;
export function getApprovedCard(db: Db, talentId: string): Promise<SignalCard | null>;

/**
 * Approves the draft: validates it, replaces the approved row, rebuilds the person's
 * `signal` rows (status `approved`) and `talent_language`, writes `card.approved` to the
 * audit log, and enqueues `matching.card_approved`.
 */
export function approveCard(db: Db, talentId: string): Promise<{ version: number }>;
export function setPoolOptIn(db: Db, talentId: string, inPool: boolean): Promise<void>;
```

## `@/features/jobs` (S2, exists after wave 1b)

`importEsco`, `ingestTmt`, `crawlOccupationSkills`, `getJob(db, id)`, `listJobs(db, filter)`.

## `@/features/needs` (S2)

```ts
/**
 * Drafts (or re-drafts) the Need Card for a posting with the analyst model and stores it.
 * `companyId` is null for a card that only explains a posting in a person's feed.
 * Enqueues `matching.need_changed`.
 */
export function draftNeedCard(db: Db, jobId: string, companyId: string | null): Promise<NeedCard>;
export function getNeedCard(db: Db, needCardId: string): Promise<NeedCard | null>;
export function getNeedCardForJob(db: Db, jobId: string): Promise<NeedCard | null>;
export function listNeedCards(db: Db, filter?: { companyId?: string; status?: NeedCardStatus }): Promise<NeedCard[]>;
/** Recomputes `pool` on every requirement from the `eligibility`, `signal` and `talent_language` tables. */
export function recomputePoolEvidence(db: Db, needCardId: string): Promise<void>;
```

## `@/features/matching` (S3a)

```ts
/** The person's job feed, in feed order, with the posting each match refers to. */
export function feedForTalent(db: Db, talentId: string):
  Promise<Array<{ match: JobMatch; job: Job }>>;
/** Recomputes the feed for one person from their approved card. */
export function computeFeed(db: Db, talentId: string): Promise<{ matches: number }>;
/** Recomputes eligibility rows: for one need against the pool, or for one person against all needs. */
export function computeEligibility(db: Db, scope: { needCardId: string } | { talentId: string }):
  Promise<{ rows: number }>;
```

## `@/features/picks` and `@/features/intros` (S3b)

```ts
/** Drafts today's digests for every participating company. Idempotent per company and day. */
export function draftDailyDigests(db: Db, date: string): Promise<{ digests: number; picks: number }>;
/** The introductions a person has to answer or has answered, for the `/matches` page, each with the company's display name and the need's title. */
export function introsForTalent(db: Db, talentId: string): Promise<IntroForTalent[]>;
```

## `@/features/voice` (S4, exists after wave 1b)

Client-side: `useVoice`, `PushToTalkButton`. The interview page imports these.

## `@/features/synth` (S4)

Scripts only (`npm run seed`, `npm run sim`); nothing imports it.

## Queue jobs that connect features

| Kind | Payload | Enqueued by | Handled by | Does |
|---|---|---|---|---|
| `matching.card_approved` | `{ talentId, cardVersion }` | `card` on approval | `matching` | `computeFeed`, then `computeEligibility({ talentId })`, then `needs.recompute_pool` for each affected need |
| `matching.need_changed` | `{ needCardId, version }` | `needs` on draft, edit, confirm | `matching` | `computeEligibility({ needCardId })`, then `needs.recompute_pool` |
| `needs.recompute_pool` | `{ needCardId }` | `matching` | `needs` | `recomputePoolEvidence` |
| `needs.draft` | `{ jobId, companyId }` | `matching` (feed explanations), `synth` (seeding) | `needs` | `draftNeedCard` |
| `picks.draft_daily` | `{ date }` | schedule, or `POST /api/picks/run` | `picks` | `draftDailyDigests` |
| `jobs.ingest_tmt` | `{ municipalities }` | schedule | `jobs` | `ingestTmt` |
| `jobs.crawl_occupations` | `{ limit }` | schedule | `jobs` | `crawlOccupationSkills` |
| `trust.purge_live_sessions` | `{}` | schedule | `card` | Deletes live demo talents past `purgeAfter`; audit `talent.purged` |

Each feature exports `jobs: JobDefinition[]` and `schedules: Schedule[]` from `src/features/<name>/jobs.ts`. The lead wires them into `src/worker/registry.ts` at merge time. In tests, call `runReadyJobs(db, [...])` with the definitions you need.

A job whose handler is not registered yet simply stays queued, so features can be merged in any order.
