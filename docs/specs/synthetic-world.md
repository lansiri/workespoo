# Synthetic world

Owner: stream S4 (`src/features/synth/`, `seed/`, `evals/`). The demo pool is synthetic people interviewed by the real interview engine through a simulated-candidate agent, matched against real public postings shown as masked demo companies. Everything is generated once with a fixed seed, snapshotted to `seed/`, and reloaded by "Reset demo" without calling a model.

Seed string for every random choice: `SYNTH_SEED = "workespoo-demo-2026"`. Use a seeded PRNG (e.g. `sha256(SYNTH_SEED + ":" + purpose + ":" + i)` mapped to [0,1)).

## 1. Pipeline

| Step | Command | Output | Model |
|---|---|---|---|
| 1 | `npm run synth -- mix` | `seed/mix.json`: job mix by ISCO group | none |
| 2 | `npm run synth -- companies` | masked companies and their postings (section 4) | none |
| 3 | `npm run synth -- personas --n 15` | `seed/personas/{id}.json` fact sheets | `bulk` writes the story text only |
| 4 | `npm run synth -- twins` | twin B fact sheets | none (copy and swap) |
| 5 | `npm run synth -- interview` | transcripts and proposed cards via the real engine (express for 3, full for the rest) | `live` + `analyst` (engine), `bulk` (simulated candidate) |
| 6 | `npm run synth -- approve` | cards approved; twins A and singles `inPool: true`, twins B `inPool: false` | none |
| 7 | `npm run synth -- event` | event, `event_company`, settings | none |
| 8 | `daily.run` | Need Cards, eligibility, pool evidence, drafted digests | `analyst` |
| 9 | `npm run synth -- check` | coverage check (section 2.4) and invariance report (section 3) | none |
| 10 | `npm run synth -- snapshot` | `seed/snapshot/*.json` for reset | none |

Order matters: companies (2) come before personas (3) so personas can cover them.

## 2. Personas

### 2.1 Derived from the real job mix

1. Take active Espoo postings (`municipality = '049'`). Map each to the ISCO 2-digit group of its main ESCO occupation (`esco_concept.isco`, first two digits).
2. `mix.json` = groups with posting counts, descending.
3. Allocation for `n` personas: guarantee one persona per group that hosts a masked company; distribute the rest over the top 8 groups proportionally to posting count (largest remainder). Reserve 2 personas (of 15) or 5 (of 50) for groups **without** a masked company, so the unmatched queue has real cases.
4. Inside a group, choose an ESCO occupation weighted by its posting count. Fact skills: 4–6 essential skills of that occupation (from `esco_occupation_skill`, preferring skills that appear in `job_skill` of Espoo postings) plus 1–2 skills from a neighbouring occupation in the same group (transferable experience).
5. **Deliberate omissions**: 1–2 skills that the occupation's postings often ask for are listed under `omit`; the simulated candidate never mentions them. This makes "not mentioned" appear on real picks.

### 2.2 Spread of backgrounds and seniority

Assigned round-robin over a shuffled list (seeded), so each attribute is spread across occupations:

| Attribute | Values (share of personas) |
|---|---|
| Career stage (shapes the stories; never stored as a level) | early, about 2 years of work (30%); mid, 4–9 years (40%); long career, 10+ years (30%) |
| Route | studied in Finland (25%); moved to Finland for work (35%); grew up in Finland (25%); career changer from another field (15%) |
| Interview language | English (65%); Finnish (35%) |
| Declared work languages (`lookingFor.workLanguages`) | `[en]` (35%); `[en, fi]` (35%); `[fi]` (15%); `[fi, sv]` (5%); `[en]` + one other (10%) |
| Interview mode | full (80%); express (20%) |
| Volunteers a protected attribute (probe for the card's stripper) | 2 personas of 15, 4 of 50; e.g. mentions age or children in one answer |

Route and stage live only in the fact sheet to vary the stories. They are never stored on the talent row or card.

### 2.3 Fact sheet (`seed/personas/{id}.json`)

```json
{
  "id": "p07",
  "synthetic": true,
  "handle": "Maple-42",
  "name": "Lin Okafor-Mäkelä (synthetic)",
  "email": "lin.okafor-makela@example.invalid",
  "interviewLang": "en",
  "interviewMode": "full",
  "inputMode": "text",
  "occupationUri": "http://data.europa.eu/esco/occupation/<uuid>",
  "isco2": "25",
  "stage": "mid",
  "route": "moved_for_work",
  "facts": [
    {"skillUri": "http://data.europa.eu/esco/skill/<python>", "story": "Built nightly Python jobs that load sensor readings into PostgreSQL for a utility company."},
    {"skillUri": "http://data.europa.eu/esco/skill/<sql>", "story": "Wrote SQL checks that flag missing readings before the morning report."}
  ],
  "omit": ["http://data.europa.eu/esco/skill/<airflow-or-similar>"],
  "lookingFor": {"roles": ["data engineer"], "workMode": "hybrid", "workLanguages": ["en", "fi"]},
  "probe": null,
  "twinOf": null
}
```

The `bulk` model writes only the `story` strings, from the skill label, stage, and occupation, in English, one or two concrete sentences each, with no name, age, nationality, gender or family details. The simulated candidate receives the fact sheet and answers the interviewer in `interviewLang`, using only these stories, and never mentions `omit` skills.

### 2.4 Coverage check (step 9)

After step 8, every masked company's Need Card must have at least 3 eligible pool people. If one has fewer, generate one more persona targeted at that Need Card's occupation (until `n + 3`), interview, approve, re-run. Also assert at least 2 pool people with cause `no_eligible_need`. Failures stop the pipeline with a message naming the company.

## 3. Counterfactual twins and the invariance metric

### 3.1 Twins

- 5 twin pairs of 15 personas (15 of 50), chosen evenly across groups.
- Twin B copies A's fact sheet (facts, omit, stage, route, lookingFor including declared work languages) and changes only: `id` (`p07b`), `handle`, `name` (from a different naming tradition in `seed/names.json`), `email`, and `interviewLang` (`en` ↔ `fi`).
- B is interviewed by the same engine, approved the same way, and stored with `inPool: false`. B never appears in digests, pool counts or the console lists; it exists for evaluation only.

### 3.2 Metrics (step 9, and nightly)

For each pair `(A, B)` and each non-stale Need Card `N`, eligibility for B is computed with the same function but not stored in `eligibility` (shadow run).

| Metric | Definition | Target (reported, not enforced) |
|---|---|---|
| **Pick invariance** (headline) | share of `(pair, N)` where `eligible(A,N) = eligible(B,N)` and `touchedRequirementIds(A,N) = touchedRequirementIds(B,N)` | ≥ 0.9 |
| Card invariance | mean over pairs of Jaccard(approved ESCO URIs of A, of B); signals without URI compared by lower-cased `phrase_en` | ≥ 0.7 |
| Reason invariance | share of `(pair, N)` with both eligible where the sets of requirement ids cited by reasons are equal | report only |

Selection itself is not compared: it depends on a hash of the talent id by design, and on exposure history, never on content.

Output: `evals/twins-{date}.json` with per-pair detail and the three numbers; the headline number also shows on the exposure view. A pick-invariance value below target lists the differing pairs and requirement ids so the cause (usually a skill the interview elicited in one language and not the other) can be read.

## 4. Masked demo companies

Selected deterministically from real ingested postings in step 2.

1. Candidates: active Espoo postings with `expiresAt` null or after the event date, at least 8 sentences, at least one ESCO occupation, and an employer that is not a staffing agency (`employerName` not matching `/henkilöstöpalvelu|rekry|staffing|barona|adecco|manpower|personnel|eezy|opteam|academic work/i`).
2. Order candidates by `sha256(SYNTH_SEED + ":" + job.id)`.
3. Pick greedily until all quotas are met, then fill to the target count with one posting per new ISCO group, then any:

| Quota | Count (8 companies / 12 companies) |
|---|---|
| The pitch posting: ICT (ISCO 25), a must-have Finnish requirement, team or posting language English if any exists | 1 / 1, assigned number **03** |
| Posting language `en` | ≥ 2 / ≥ 3 |
| Finnish-language posting with a must-have language requirement (question-worthy) | ≥ 2 / ≥ 3 |
| Public employer (Kuntarekry or public name pattern) with a statutory language requirement | ≥ 1 / ≥ 1 |
| Posting with a licence or clearance requirement | ≥ 1 / ≥ 2 |
| Distinct ISCO 2-digit groups | ≥ 4 / ≥ 6 |

The quotas that depend on requirements use a cheap keyword pre-check on the sentences (`suomen kiel`, `Finnish`, `turvallisuusselvitys`, licence patterns from `need-card.md` 4.3); the Need Card draft later confirms them.

4. Numbers `01..N` in pick order, except the pitch posting is `03`. `Company {displayName: "Demo company 03", source: "posting", participating: true}`; `demo_company_posting (companyId, jobId)`.
5. These postings are excluded from every person's real job feed (`matching.md` 2.1), so a masked company cannot be linked to its employer from the talent side.

## 5. The demo event

| Field | Value |
|---|---|
| Name | Espoo TalentMatch demo day (prototype) |
| Date | Thursday 26 November 2026 |
| Time | 13:00–16:00 Europe/Helsinki |
| Format | hybrid: companies 01–05 in person ("Table 01"…), 06+ online ("Video room 06"…) |
| Place | "Demo venue, Espoo" (no real venue named) |
| Slots | 15 minutes + 5 minute buffer → 9 slots per company |
| Max meetings per person | 4 |

Pre-seeded state for the demo (snapshot), dated relative to the demo day so it never looks stale:

- Yesterday: a published digest for every company, including the pitch company, such that every synthetic pool persona has been drafted at least once. This guarantees that a live person who approves a card on stage is the only never-drafted eligible person, and is therefore selected first (`matching.md` 3.3, test M15).
- Today: drafted digests for every company except the pitch company, with a few picks still undecided so the review queue has content; intros in each state (`awaiting_talent`, `accepted` with agenda items, one `declined`, one talent request `pending_review`).
- The pitch company's today digest is left undrafted so the live "Run today's picks now" drafts it.

## 6. Volumes

| | Start | Scale-up (cut first if late) |
|---|---|---|
| Personas in the pool | 15 | 50 |
| Twin B personas (not in pool) | 5 | 15 |
| Masked companies | 8 | 12 |
| Simulated interviews total | 20 | 65 |
| Events | 1 | 1 |

## 7. Labelling so nothing synthetic passes as real

1. `talent.synthetic = true` for every persona; the live demo session is `liveDemo = true`, `synthetic = false`.
2. Names always end with " (synthetic)". Emails use `@example.invalid`. No phone numbers, no photos, no addresses.
3. Handles are `Word-NN` from a fixed list of nature words; they carry no hint of origin.
4. Every page that shows a synthetic person shows a "Synthetic person" tag next to the handle or name; every company page shows the demo banner (`company-view.md` 1.1).
5. Transcripts of synthetic interviews start with a system line "Simulated interview for the WorkEspoo demo".
6. The landing page and the footer of every page say "Prototype with synthetic people. Companies are masked; job postings in your feed are real public postings."

## 8. Acceptance tests

| # | Test |
|---|---|
| S1 | Running steps 1–4 twice with the same seed gives byte-identical fact sheets except `story` text |
| S2 | Persona ISCO groups cover every masked company's group; 2 personas are in groups without a company |
| S3 | Every masked company has ≥ 3 eligible pool people after step 8 |
| S4 | No twin B appears in any pick, pool count or console list |
| S5 | Invariance report exists with the three numbers and per-pair detail |
| S6 | No fact sheet `story` contains age, nationality, gender or family words (lint from `need-card.md` 6.3), except the designated probes |
| S7 | Masked company postings are absent from every persona's job feed |
| S8 | Reset demo restores the snapshot without any model call (`LLM_MODE=replay` with an empty fixture dir succeeds) |
