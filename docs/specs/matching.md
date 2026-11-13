# Matching

Owner: stream S3 (`src/features/matching/`). Prompts: `prompts/match-reasons.md` (person to jobs), `prompts/picks-draft.md` (need to people). Inputs: approved Signal Cards (via `talent_signal_index`, `talent_language`), jobs, Need Cards.

Two directions, one rule set:

| | Person to jobs | Need to people |
|---|---|---|
| Who sees it | The person, in their own job feed | Organiser, then the company |
| Retrieval | SQL over ESCO links, trigram, full text | Same `touches` predicate as pool evidence |
| Ordering | Allowed: postings are ordered for the person | Forbidden: eligibility is a yes/no; selection is by exposure and seeded random; display is shuffled |
| Model | Writes reasons for the top 12 | Writes reasons for the drafted picks |

No embeddings. No numeric score on a person is stored, returned by an API or shown.

## 1. Inputs every matcher may read, and nothing else

| May read | Must never read |
|---|---|
| `talent_signal_index` (approved signals: `esco_uri`, `phrase_en`, `kind`) | Transcript text, original quotes |
| `talent_language` | Interview language, input mode, `Turn.*` |
| `SignalCard.companyView` renderings (for reason prompts) | `talent_identity` (name, contact) |
| `SignalCard.lookingFor.roles`, `workMode` | Handle (except as an opaque id), `synthetic`, `liveDemo` flags |
| Jobs, Need Cards, ESCO tables | Any previous pick decision or organiser note (except for the rotation timestamp, section 4) |

A unit test asserts the prompt payloads and the SQL inputs contain none of the right-hand column (M12).

## 2. Person to jobs (the person's feed)

### 2.1 Retrieval in words

1. Start from the person's approved ESCO skill URIs `U`.
2. **Direct**: active postings whose `job_skill` lists any URI in `U`.
3. **Through occupations**: postings whose `escoOccupationUris` include an occupation for which a URI in `U` is an essential (or optional) skill in `esco_occupation_skill`.
4. **Text**: postings whose title or sentences match the ESCO labels of `U` in English and Finnish (full text, `simple` config, prefix match for Finnish compounds), or whose title is trigram-similar to a self-declared role in `lookingFor.roles`.
5. Keep postings that are active, not expired, posted within 60 days, in Uusimaa (Espoo `049`, Helsinki `091`, Vantaa `092`, Kauniainen `235`, or region `01`). Exclude postings used for masked demo companies (`synthetic-world.md` 4).
6. **Gate**: keep a posting if `direct ≥ 1`, or `occEssential ≥ 2`, or (`occEssential ≥ 1` and a text hit), or a role-title hit.
7. **Order** (postings, for this person): `3·direct + 2·occEssential + occOptional + textHit + roleHit` descending, then Espoo before other municipalities, then `postedAt` descending, then `job.id`. Keep 40.
8. Top 12 get model-written reasons; 13–40 show a code-rendered reason (2.3).

### 2.2 Pseudo-SQL

```sql
WITH u AS (SELECT DISTINCT esco_uri FROM talent_signal_index WHERE talent_id = :t AND esco_uri IS NOT NULL),
terms AS (  -- built in code: ESCO labels en+fi of u, words >= 4 chars, stopwords removed, each as 'word:*', OR-joined
  SELECT to_tsquery('simple', :terms) AS q
),
eligible_jobs AS (
  SELECT j.* FROM job j
  WHERE j.active AND (j.expires_at IS NULL OR j.expires_at > now())
    AND j.posted_at > now() - interval '60 days'
    AND (j.municipality IN ('049','091','092','235') OR j.region = '01')
    AND j.id NOT IN (SELECT job_id FROM demo_company_posting)
),
direct AS (
  SELECT js.job_id, count(DISTINCT js.skill_uri) AS n FROM job_skill js JOIN u ON u.esco_uri = js.skill_uri GROUP BY 1
),
occ AS (
  SELECT j.id AS job_id,
         count(DISTINCT os.skill_uri) FILTER (WHERE os.relation = 'essential') AS ess,
         count(DISTINCT os.skill_uri) FILTER (WHERE os.relation = 'optional')  AS opt
  FROM eligible_jobs j
  JOIN esco_occupation_skill os ON os.occupation_uri = ANY(j.esco_occupation_uris)
  JOIN u ON u.esco_uri = os.skill_uri
  GROUP BY 1
),
txt AS (SELECT j.id AS job_id FROM eligible_jobs j, terms WHERE j.search_tsv @@ terms.q),
role AS (
  SELECT j.id AS job_id FROM eligible_jobs j
  WHERE EXISTS (SELECT 1 FROM unnest(:roles::text[]) r WHERE word_similarity(r, j.title) >= 0.5)
)
SELECT j.id,
       coalesce(d.n,0) AS direct, coalesce(o.ess,0) AS occ_ess, coalesce(o.opt,0) AS occ_opt,
       (t.job_id IS NOT NULL) AS text_hit, (r.job_id IS NOT NULL) AS role_hit
FROM eligible_jobs j
LEFT JOIN direct d ON d.job_id = j.id LEFT JOIN occ o ON o.job_id = j.id
LEFT JOIN txt t ON t.job_id = j.id    LEFT JOIN role r ON r.job_id = j.id
WHERE coalesce(d.n,0) >= 1 OR coalesce(o.ess,0) >= 2 OR (coalesce(o.ess,0) >= 1 AND t.job_id IS NOT NULL) OR r.job_id IS NOT NULL
ORDER BY 3*coalesce(d.n,0) + 2*coalesce(o.ess,0) + coalesce(o.opt,0) + (t.job_id IS NOT NULL)::int + (r.job_id IS NOT NULL)::int DESC,
         (j.municipality = '049') DESC, j.posted_at DESC, j.id
LIMIT 40;
```

The same query with the interview's **proposed** signals (count only, `LIMIT 200`) drives the `jobs.lit` SSE event during the interview. It must answer in under 150 ms on 4,000 postings; indexes: `job_skill(skill_uri)`, `esco_occupation_skill(skill_uri)`, GIN on `job.esco_occupation_uris`, GIN on `search_tsv`, GIN trigram on `job.title`.

The sort expression is a posting order for one person. It is never written to `JobMatch` as a number (store `feedPosition` only, see C11) and never used in need-to-people matching.

### 2.3 Reasons and "not mentioned" in the feed

- For the top 12, the model writes 1 to 3 reasons from **allowed pairs** computed by code (`prompts/match-reasons.md`). A pair is `(signal Sx, posting sentence Py)` where:
  - the posting has a Need Card draft (cached, `need-card.md` C10) and requirement `r` with `postingSentence = Py` is touched by `Sx`, or
  - otherwise, `Sx.esco_uri` is in `job_skill` and `Py` is a sentence whose text trigram-matches the ESCO label (`word_similarity ≥ 0.5`, label en or fi). If no sentence matches, `Py = null` and the reason cites the ESCO label.
- **Code-rendered reason** (rows 13–40, and fallback when the model fails): "Your card mentions {signal.phrase}. This posting lists {ESCO labelEn}." One line, no model.
- **Not mentioned**: requirements of the cached draft that the person does not touch, `must` first then `nice`, posting order, max 5, rendered as "Not mentioned in your conversation: {text}". Statutory ones get "(checked by the employer at hiring)". If no draft exists yet: "Requirements not read yet." Never "missing", "lacking" or "gap".
- Each feed item also shows: real title, real employer name, municipality, closing date, "Source: Työmarkkinatori" (or The Hub / Kuntarekry), and an "Open the posting" link to `job.url`.

### 2.4 When it runs

On card approval (and each re-approval): run retrieval, store `JobMatch` rows for the top 40 with `cardVersion`, enqueue `feed.reasons` for the top 12 (concurrency 4) and `needcard.draft_feed` for any of those 12 jobs without a cached draft (role `bulk`). The feed page renders immediately with code-rendered reasons and swaps in model reasons as they arrive (poll every 3 s for 60 s). Cached by `(talentId, cardVersion, jobId)`.

## 3. Need to people

### 3.1 The `touches(p, r)` predicate (shared with pool evidence)

`touches(p, r)` is true when:

| `r.category` | True if |
|---|---|
| `skill`, `experience`, `education` with ESCO URIs | an approved signal of `p` has `esco_uri ∈ r.escoSkillUris`, or `word_similarity(r.text, phrase_en) ≥ 0.6` |
| same, without ESCO URIs | `word_similarity(r.text, phrase_en) ≥ 0.6` |
| `language` | `talent_language` has `r.languageCode` (evidenced or declared) |
| `authorisation` | an approved signal has `word_similarity(r.text, phrase_en) ≥ 0.6` (usually false: "not mentioned") |
| `other` | an approved signal has `word_similarity(r.text, phrase_en) ≥ 0.6` |

Years, degree level and language level are never assessed: a Java signal touches "5 years of Java development".

### 3.2 Eligibility: a threshold, not a ranking

Let `A(N)` be the **anchor** requirements of Need Card `N`: categories `skill`, `experience`, `education`, of **either kind**. Language, authorisation and other requirements are never anchors: they can neither include nor exclude anyone.

```
T(N) = 2 if |A(N)| >= 3 else 1
eligible(p, N) = |{ r in A(N) : touches(p, r) }| >= T(N)
```

Also eligible: `p` touches at least one anchor AND a `lookingFor.roles` entry has `word_similarity(role, N.title) ≥ 0.5`.

Stored per `(needCardId, needCardVersion, talentId)`: `eligible` (bool) and `touchedRequirementIds` (set). The count is not stored. `touchedRequirementIds` is used only to render reasons and "not mentioned"; nothing sorts by its size.

Not eligibility, but **exclusions** (applied after, recorded with their reason, visible to the organiser as "not drafted because ..."):

1. Not in the pool (`in_pool = false`, no approved card, past `purge_after`).
2. An intro with this company is open (`pending_review`, `awaiting_talent`, `awaiting_company`) or `accepted`.
3. The person declined an intro with this company, or a talent request to it was declined by the company, in the last 30 days.

Must-have status, missing languages, missing licences and "not mentioned" items are never exclusions.

### 3.3 Choosing the handful (exposure fairness)

Per Need Card per digest, `k = settings.digestSize` (default 5). Inputs: eligible and not excluded set `E`.

```
seed      = sha256(eventId + ":" + digestDate + ":" + companyId + ":" + needCardId)        -- stored on the digest
lastDrafted(p) = max(pick.created_at) over all picks of p, any company, any status          -- null if never
tie(p)    = sha256(seed + ":" + talentId)
recent(p) = p had a pick for this company in the last `rotationDays` (default 7)
capped(p) = p already has `maxPicksPerDay` (default 3) picks drafted today across all digests

pass 1: candidates = E where not recent and not capped
        sort by (lastDrafted NULLS FIRST asc, tie asc); take k
pass 2: if fewer than k, fill from E where recent and not capped, same sort
```

Recorded on each pick, `selection = {seed, lastDraftedBefore, pass}`. Picks drafted earlier in the same daily run update `lastDrafted` before the next Need Card is processed; Need Cards are processed in `needCardId` order so the run is deterministic.

Why this is not a ranking: the sort keys are time since last exposure and a hash. Nothing from the card content enters them. A newly approved card is drafted first because it has never been drafted.

### 3.4 Display order

Picks have no order. Every list of picks (organiser queue, company digest) is sorted by `sha256(digest.seed + ":" + pick.id)`, so the order changes between digests and carries no meaning. The UI says "In no particular order".

### 3.5 Reason format

Written by `prompts/picks-draft.md` from allowed `(requirement, signal)` pairs (code computes the pairs from `touchedRequirementIds`).

| Part | Organiser sees | Company sees |
|---|---|---|
| 2 to 3 reasons | text + requirement chip + "From the card:" the signal's `companyView` rendering (labelled "English rendering") + "From the posting:" the sentence | same |
| Not mentioned | requirements of `N` not touched, `must` first, all of them | same |
| Basis | "Relates to these requirements:" followed by the touched requirement chips in posting order (no count); "Not drafted to anyone for {days} days" or "Never drafted before"; "Picked by rotation, seed {first 8 chars}" | not shown |
| Origin | "Drafted by the agent" / "Added by organiser: {note}" / "The person asked to meet you" | "The person asked to meet you" only for talent requests |
| Original words | hidden; a "Show original words" button (logged as `card.originals_viewed`) | never before opt-in |

## 4. Acceptance tests

| # | Test | Catches |
|---|---|---|
| M1 | Person with Python + SQL signals; fixture of 50 postings | Feed contains the 3 fixture data-engineering postings; none outside Uusimaa; none expired; none from `demo_company_posting` |
| M2 | Feed item | Shows real employer name, source attribution, link to `job.url` |
| M3 | `jobs.lit` query on 4,000 postings (PGlite seed) | Returns under 150 ms |
| M4 | Person touches 1 of 4 anchors, no matching role | Not eligible |
| M5 | Person touches 2 nice-to-have anchors and 0 must-haves | Eligible (**must-have not acting as a filter**) |
| M6 | Flip every requirement's `kind` | Eligible set identical (**must-have not acting as a filter**) |
| M7 | Person with no Finnish evidence or declaration, Need Card with must-have Finnish | Eligibility identical to the same person with Finnish declared (**language not filtering**) |
| M8 | Two eligible people, A touches 2 anchors, B touches 6, both never drafted; 200 different seeds, `k = 1` | A selected between 35% and 65% of runs (**no hidden ranking by overlap**) |
| M9 | Give A extra matching signals without changing eligibility; same seed | Same selection result (**no hidden ranking**) |
| M10 | Pick and digest API responses | JSON keys are a whitelist; no numeric field other than ids, timestamps, `version`; no key named like `score`, `rank`, `similarity`, `overlap`, `weight` (**hidden score**) |
| M11 | Same people, two digests with different seeds | Display order differs; selection depends only on `lastDrafted` and `tie` |
| M12 | Snapshot of the picks-draft and match-reasons prompt payloads for a fixture | Contains no transcript sentence, no name, no interview language, no input mode, no handle |
| M13 | Counterfactual twins (`synthetic-world.md` 3) | Identical `eligible` and `touchedRequirementIds` for every Need Card |
| M14 | Person with an `accepted` intro with company C | Not drafted for C; reason recorded as exclusion 2 |
| M15 | Newly approved eligible card, everyone else drafted before | Selected in the next digest for that Need Card |
| M16 | 8 eligible, `k = 5`, 3 drafted to this company 2 days ago | Pass 1 takes the other 5; those 3 appear only if pass 1 is short |
| M17 | Re-run the daily job for the same date with no decisions made | Identical picks (same seed, same order) |
| M18 | Model reason JSON cites a pair not in the allowed list | Reason dropped; if none survive, code-rendered reason used |

## 5. Contract change requests

| # | Change | Reason |
|---|---|---|
| C11 | `JobMatch` adds `cardVersion`, `feedPosition` (int, posting order for this person), `basis` (`direct` \| `occupation` \| `text` \| `role`, array), `reasonsSource` (`model` \| `code`), `computedAt`; `reasons[]` items become `{text, signalId, evidence: EvidenceRef, postingSentence: number \| null, escoUri?}` | Caching by card version; code fallback; evidence by reference |
| C12 | New table `eligibility (need_card_id, need_card_version, talent_id, card_version, eligible bool, touched_requirement_ids text[], exclusion text NULL, computed_at)`; primary key on the first three | Pool evidence denominator, picks, unmatched queue; boolean plus set only, no count column |
| C13 | `Pick.reasons[]` items become `{text, requirementId, signalId, evidence: EvidenceRef, postingSentence: number \| null}`; `Pick.notMentioned[]` becomes requirement ids | Render reasons and evidence by reference |
| C14 | `Pick` adds `origin` (`agent` \| `organiser` \| `talent_request`), `selection` (`{seed, lastDraftedBefore, pass}` \| null), `needCardVersion`, `cardVersion` | Exposure audit; reproducibility |
| C15 | `Digest` adds `seed` | Display shuffle and selection reproducibility |
| C16 | New table `demo_company_posting (company_id, job_id)` (or `Company.jobId`) | Exclude masked postings from the real feed |
