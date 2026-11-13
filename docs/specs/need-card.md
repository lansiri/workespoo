# Need Card

Owner: stream S2 (`src/features/needs/`). Prompt: `prompts/need-card-draft.md`. Consumers: matching (S3), company view, organiser console.

A Need Card is a company's need, drafted by the analyst model from a real public posting, then checked by the company. It lists requirements, each tied to the posting sentence it came from, mapped to ESCO where possible, with pool evidence and, for a few, a question to the company. It never filters anyone out.

## 1. Pipeline

| Step | Who | What | Output |
|---|---|---|---|
| 1 | ingestion (S2) | Redact contacts, split description into `Job.sentences[]` (rule 2) | `job.sentences` |
| 2 | code | Build candidate ESCO list `K1..Kn` (rule 4) | prompt input |
| 3 | model `analyst` | Draft title, summary, requirements (`prompts/need-card-draft.md`) | draft JSON |
| 4 | code | Validate, resolve `K` ids to URIs, statutory override (rule 6), protected-attribute drop (rule 7), trigram ESCO fallback | `NeedCard` v1, `status: draft` |
| 5 | code | Pool evidence (section 5) | `requirement.pool` |
| 6 | code | Decide which questions are shown (section 4) | `requirement.question` kept or nulled |
| 7 | company | Confirm, answer questions, edit (section 6) | `status: confirmed`, version + 1 |

Drafting runs for every participating company's posting (eagerly) and, with the `bulk` role, in the background for active Espoo postings that appear in someone's job feed (lazily, cached per `jobId`; see `matching.md` 2.4). A draft for a feed posting is never shown to an employer; it only supplies "not mentioned" items to the person's feed.

## 2. Posting sentences

Rule, applied once at ingestion after redaction, so indexes are stable:

1. Normalise `\r\n` to `\n`. Strip HTML (The Hub).
2. Split into lines. Each non-empty line is a unit. Bullets (`-`, `•`, `*`, `–`, `1.`) are stripped of their marker; each bullet is its own unit.
3. Split each unit at `(?<=[.!?])\s+(?=[A-ZÅÄÖ0-9])`.
4. Drop units shorter than 3 characters. Index from 0. Title is not a sentence.
5. Cap at 120 sentences (the rest is dropped from the prompt, not from storage).

The model sees `[P0] text`, `[P1] text` and cites the number. Code renders the text from `job.sentences[i]`. A requirement whose sentence index does not exist is dropped.

## 3. Requirement rules

### 3.1 Extraction

- One requirement per distinct thing asked for. "Python and SQL" is two requirements if the posting treats them as separate skills, one if it says "Python/SQL data tooling".
- Only what the posting asks of the applicant. Not duties ("you will build..."), not benefits, not company description. Exception: a duty sentence can supply a skill when no requirement list exists; then `kind: nice`.
- `text`: short English phrase, at most 80 characters, no employer name, no numbers except years and licence classes ("C driving licence", "5 years of Java development").
- At most 12 requirements. If the posting lists more, keep all `must` cues first, then `nice` in posting order.

### 3.2 `must` / `nice` rubric (by cue words in the cited sentence or its section header)

| `must` cues | `nice` cues |
|---|---|
| fi: edellytämme, edellytyksenä, vaadimme, vaatimuksena, kelpoisuusvaatimus, sinulla on, sinulla tulee olla, hallitset, odotamme | fi: eduksi, katsotaan eduksi, arvostamme, plussaa, toivomme, olisi hienoa, lisäksi hyödyksi |
| en: required, must, you have, you need, we expect, requirements, qualifications | en: nice to have, a plus, bonus, preferred, ideally, we appreciate, advantage |
| sv: krav, vi förutsätter, du har | sv: meriterande, vi uppskattar |

- No cue at all: `nice`.
- Header cues apply to every bullet below the header until the next header.
- `kind` never affects who is considered (rule 7 in `CLAUDE.md`). It affects display and question triggers only.

### 3.3 Categories

| `category` | Use for | ESCO mapping |
|---|---|---|
| `skill` | a capability or tool ("Python", "customer service", "forklift operation") | yes |
| `language` | a working language, any level wording | no; `languageCode` instead |
| `education` | a degree or field of study | optional (field as skill) |
| `experience` | years or prior work in a domain ("5 years in B2B sales") | yes, the underlying skill |
| `authorisation` | licence, certificate, card, clearance, registration, work permit | no |
| `other` | soft or vague asks ("team player", "stress tolerance", "self-directed") | no |

Work permit / right to work requirements are recorded as `authorisation` with `statutory: other_law`, never questioned, never counted (nobody's card covers it, and asking about it touches nationality).

### 3.4 ESCO mapping

1. **Candidate list** given to the model, at most 40 items, numbered `K1..`:
   a. `job.escoSkillUris` (from Työmarkkinatori `position.skills[]`), then
   b. essential skills of `job.escoOccupationUris` from `esco_occupation_skill`, then optional ones,
   until 40. Each item shows `labelEn / labelFi`.
2. The model attaches zero to three `K` ids per `skill`, `experience` or `education` requirement. It may attach none.
3. Code fallback for a `skill` or `experience` requirement with no `K`: trigram over `esco_concept` (type skill, not retired), `word_similarity(lower(text), lower(label_en)) >= 0.6` or the same on `label_fi` against the Finnish sentence; take the single best if it beats the runner-up by 0.05, else leave empty.
4. Requirements with empty `escoSkillUris` are matched by text (`matching.md` 3.1).
5. Language requirements: `languageCode` is ISO 639-1 (`fi`, `sv`, `en`, ...). Code resolves the ESCO language skills for display only (labels like "Finnish", "speak Finnish", "interact verbally in Finnish").

## 4. Questions to the company

A question invites the company to reconsider a requirement. It is never a verdict. The model drafts `questionType` and the wording; code decides whether it is shown.

### 4.1 Triggers (model proposes, code checks)

| `questionType` | Fires when | Pattern (fill the braces, keep the shape) |
|---|---|---|
| `language` | `category: language`, `kind: must`, not statutory | "Is {Language} needed from day one, or could someone start in {OtherLanguage} and build up {Language} on the job?" |
| `years` | `category: experience` with a year count ≥ 3, `kind: must` | "Would someone who has done {work}, with fewer than {N} years, be worth a conversation?" |
| `degree` | `category: education`, `kind: must`, not statutory | "Would hands-on experience in {field} work instead of the degree?" |
| `tool` | `category: skill`, `kind: must`, names one vendor product or version | "Would experience with a comparable tool be enough, if the person learns {Tool} on the job?" |
| `vague` | `category: other`, any kind | "What does '{phrase}' look like in this job? One concrete example helps us find people who have done it." |

`{OtherLanguage}` is `English` unless the posting itself is in English and the requirement is English, in which case no question. `why` is one neutral sentence, at most 140 characters, with no numbers. Pool numbers are rendered next to the question by code, never written by the model.

Example `why` lines: "The posting is written in English and describes an English-speaking team." / "Many people describe this work without counting years." / "The posting does not say what this means in practice."

### 4.2 When not to ask (code drops the question)

1. `statutory != none` (section 4.3). Always.
2. `kind: nice` (except `vague`).
3. `pool.hardFilterWouldExclude == 0`, or the relevant pool `relevant < 3` (too small to say anything).
4. The question contains a forbidden word (case-insensitive): `unnecessary`, `unrealistic`, `excessive`, `discriminat`, `bias`, `illegal`, `should`, `must not`, `too`, `wrong`, `outdated`. Regenerate is not attempted; the question is dropped.
5. More than 3 questions survive: keep the 3 with the largest `hardFilterWouldExclude` (this orders requirements, never people).
6. The company already answered a question on this requirement in any earlier version.

### 4.3 Statutory requirements: never questioned

`statutory` is the OR of the model's cue and a code keyword check on the cited sentence (case-insensitive, Finnish and English):

| `statutory` | Code rule |
|---|---|
| `language_act` | `category: language` AND (employer is public: `job.source = kuntarekry`, or employer name matches `/kaupunki|kunta\b|kuntayhtymä|hyvinvointialue|virasto|ministeriö|valtion|city of|municipality|wellbeing services/i`, or sentence matches `/kielitaitolaki|424\/2003|kielitaitovaatimus|julkisyhteisö|virkaan|tehtävään vaadittava kielitaito/i`) |
| `licence` | `/laillistettu|valvira|terhikki|ammattioikeus|kelpoisuus|pätevyys|ajokortti|ammattipätevyys|hygieniapassi|työturvallisuuskortti|tulityökortti|sähköpätevyys|anniskelupassi|registered nurse|licen[cs]ed?|driving licen[cs]e|qualification required/i` |
| `clearance` | `/turvallisuusselvitys|security clearance|rikostaustaote|criminal record/i` |
| `other_law` | `/työlupa|oleskelulupa|work permit|right to work|residence permit/i` |

A statutory requirement displays "Set by law or regulation. Not questioned here; the employer checks it at hiring." It shows `pool.speakTo` but hides `hardFilterWouldExclude` (showing "what a filter would exclude" next to a legal duty invites dropping it). On picks it appears in "not mentioned" with the suffix "(the employer checks this at hiring)".

## 5. Pool evidence

Shown per requirement. Two anonymous counts, computed by SQL, no model.

### 5.1 Definitions

- **Pool** `P`: talent with `in_pool = true`, a current approved Signal Card, not past `purge_after`. Live demo sessions only if they opted in to the pool. Counterfactual twin B personas are never in `P` (`synthetic-world.md`).
- **Relevant set** `R(N)`: people in `P` who are eligible for Need Card `N` (`matching.md` 3.2). Card-level number `relevant = |R|`.
- **Touches** `touches(p, r)`: the predicate in `matching.md` 3.1. Evidence only: an approved signal on the card, or (languages only) a self-declared work language.
- **`speakTo(r)`** = `|{p ∈ R : touches(p, r)}|`.
- **`hardFilterWouldExclude(r)`** = `relevant − speakTo(r)`. Everyone counted here simply did not mention the requirement in a short conversation. The UI must say so.
- **`selfDeclaredOnly(r)`** (language only) = people in `speakTo` whose only basis is a self-declared work language.
- If `relevant == 0`, compute `speakTo` over all of `P`, set `scope: whole_pool`, and set `hardFilterWouldExclude` to null.

What is never used: interview language, input mode, names, anything outside the approved card. This keeps the numbers identical for counterfactual twins.

### 5.2 Pseudo-SQL

```sql
-- talent_signal_index: one row per approved signal of each current approved card (contract request C7)
-- talent_language: (talent_id, code, basis 'evidenced'|'declared')            (contract request C8)
WITH pool AS (
  SELECT t.id FROM talent t
  WHERE t.in_pool AND t.card_approved AND (t.purge_after IS NULL OR t.purge_after > now())
),
rel AS (                                 -- R(N): eligibility table written by matching
  SELECT e.talent_id FROM eligibility e JOIN pool ON pool.id = e.talent_id
  WHERE e.need_card_id = :need AND e.need_card_version = :ver AND e.eligible
),
touch AS (
  SELECT r.id AS req_id, rel.talent_id,
         CASE WHEN r.category = 'language' THEN
                (SELECT max(CASE basis WHEN 'evidenced' THEN 2 ELSE 1 END)
                   FROM talent_language l WHERE l.talent_id = rel.talent_id AND l.code = r.language_code)
              WHEN cardinality(r.esco_skill_uris) > 0 THEN
                (SELECT 2 FROM talent_signal_index s WHERE s.talent_id = rel.talent_id
                   AND (s.esco_uri = ANY(r.esco_skill_uris) OR word_similarity(r.text, s.phrase_en) >= 0.6) LIMIT 1)
              ELSE
                (SELECT 2 FROM talent_signal_index s WHERE s.talent_id = rel.talent_id
                   AND word_similarity(r.text, s.phrase_en) >= 0.6 LIMIT 1)
         END AS basis                     -- 2 evidenced, 1 declared only, NULL not mentioned
  FROM requirements(:need, :ver) r CROSS JOIN rel
)
SELECT req_id,
       count(*) FILTER (WHERE basis IS NOT NULL)          AS speak_to,
       (SELECT count(*) FROM rel) - count(*) FILTER (WHERE basis IS NOT NULL) AS hard_filter_would_exclude,
       count(*) FILTER (WHERE basis = 1)                  AS self_declared_only
FROM touch GROUP BY req_id;
```

### 5.3 When it runs

- After drafting, after every company edit (new version), in the daily job, and after any card approval or pool opt-in/out (debounced: one `pool.recompute` queue job per Need Card, 10 seconds).
- Stored on the requirement with `computedAt`. The company view shows "as of {time}".

### 5.4 Display text (exact)

- Normal: "**{speakTo} of {relevant}** people in the pool whose cards relate to this role speak to this. A hard filter on it would set aside **{exclude}**. They did not mention it in a short conversation; that does not mean they lack it. No filter is applied."
- Language with self-declared: append "({selfDeclaredOnly} of them by naming it as a work language.)"
- Statutory: "**{speakTo} of {relevant}** speak to this. Set by law or regulation; the employer checks it at hiring."
- Whole pool: "Nobody in the pool relates to this role yet. Across the whole pool of {|P|}, **{speakTo}** speak to this requirement."

## 6. Company confirm and edit flow

On the company digest page (`company-view.md`). Every action writes an audit event (`actor: company`).

| Action | Effect | Audit `action` |
|---|---|---|
| Answer a question: **Keep as must-have** | `question.answer = {choice: keep}` | `needcard.question.answered` |
| **Make it nice-to-have** | `kind: nice`, answer `make_nice` | same |
| **Change the wording** | inline text edit, answer `reworded`; ESCO re-mapped by the code fallback (3.4.3) | same + `needcard.requirement.edited` |
| **Remove it** | requirement deleted from the new version, answer `remove` | same |
| Toggle `must`/`nice` on any requirement | kind changes | `needcard.requirement.edited` |
| Edit `text` | as "change the wording" | same |
| Add a requirement | text, kind, category; ESCO by trigram autocomplete over `esco_concept`; `postingSentence: null`, `source: company` | `needcard.requirement.added` |
| Edit title or summary | free text, max 80 / 300 chars | `needcard.edited` |
| **Confirm this need** | `status: confirmed`, `confirmedAt` | `needcard.confirmed` |

Rules:

1. Every save creates a new version (`version + 1`) and recomputes pool evidence. Picks already drafted keep the version they were drafted against; the next digest uses the latest.
2. A company can confirm without answering questions. Unanswered questions stay visible.
3. Protected-attribute lint on any company text (add or edit): reject if it matches `/\b(age|years old|young|nuori|ikä|gender|male|female|mies|nainen|nationality|kansalai|native|äidinkieli|syntyperä|religio|uskonto|health|terveys|pregnan|raskau|family|perhe|photo|kuva)\b/i`. Message: "This describes a personal characteristic, not the work. Describe the skill or language level the work needs instead." "native Finnish" gets the hint "Try 'fluent working Finnish'."
4. Statutory requirements can be edited for wording but show no question and no exclusion count.
5. A `stale` Need Card (posting inactive or expired) is read-only and gets no new picks.

## 7. Validation of the model output (code)

Reject and retry once (gateway repair) on schema failure. After a valid parse, apply silently:

1. Drop requirements whose `sentence` is not a valid index.
2. Drop unknown `K` ids. Drop `esco` on `language`, `authorisation`, `other`.
3. Drop requirements whose text or cited sentence hits the protected lint (6.3); record them in `droppedSentences` for the organiser ("Removed from the draft because it describes a personal characteristic: P7").
4. Force `questionType: none` and `question: null` when the trigger conditions (4.1) do not hold.
5. Dedupe requirements with the same `text` (case-insensitive) or the same `esco` set and category.
6. If zero requirements survive, keep the card with `requirements: []` and flag it in the organiser event overview ("Need Card has no requirements; check the posting").

## 8. Stored shape (example)

Fields marked † are contract change requests (section 10).

```json
{
  "id": "nc_01HZX",
  "jobId": "job_tmt_7f3c",
  "companyId": "co_07",
  "version": 2,
  "title": "Backend developer (Java)",
  "summary": "Builds and maintains Java services for an Espoo software company. Works in a team that uses AWS.",
  "lang": "fi",
  "status": "draft",
  "droppedSentences": [],
  "requirements": [
    {
      "id": "req_a1",
      "text": "5 years of Java development",
      "kind": "must",
      "category": "experience",
      "escoSkillUris": ["http://data.europa.eu/esco/skill/<java-uuid>"],
      "postingSentence": 6,
      "source": "agent",
      "languageCode": null,
      "statutory": "none",
      "question": {
        "type": "years",
        "text": "Would someone who has done Java development, with fewer than 5 years, be worth a conversation?",
        "why": "Many people describe this work without counting years.",
        "answer": null
      },
      "pool": { "scope": "relevant", "relevant": 11, "speakTo": 8, "hardFilterWouldExclude": 3, "selfDeclaredOnly": null, "computedAt": "2026-11-14T06:02:11Z" }
    }
  ]
}
```

## 9. Acceptance tests

| # | Given | Then |
|---|---|---|
| N1 | Fixture posting fi-01 (prompt doc example B) and replayed model output | Card has ≥ 5 requirements; every `postingSentence` renders a non-empty `job.sentences[i]`; no requirement text contains the employer name |
| N2 | Model output cites `P99` on a 40-sentence posting | That requirement is dropped; the rest survive |
| N3 | Requirement "erinomainen suomen kielen taito", `edellytämme`, private employer, English summary | `category: language`, `languageCode: fi`, `kind: must`, `question.type: language` present (if pool conditions hold) |
| N4 | Same requirement, `job.source = kuntarekry` | `statutory: language_act`, `question: null`, `hardFilterWouldExclude` hidden in rendered HTML |
| N5 | Sentence contains "turvallisuusselvitys" | `statutory: clearance`, no question, even if the model proposed one |
| N6 | Model question text "Is this requirement unnecessary?" | Question dropped |
| N7 | Posting sentence "Etsimme nuorta ja energistä..." | No requirement for age; sentence index listed in `droppedSentences` |
| N8 | Pool of 10, relevant 6; 4 touch Python by ESCO URI | Python: `speakTo 4`, `hardFilterWouldExclude 2` |
| N9 | Two personas, identical `talent_signal_index` and `talent_language` rows, different interview language | Every pool count is identical with either one in the pool |
| N10 | Person with `workLanguages: [fi]` and no Finnish signal | Counts in `speakTo` and in `selfDeclaredOnly` for a Finnish requirement |
| N11 | Toggle a requirement `must` → `nice` | `relevant` and every `speakTo` unchanged (only question visibility changes) |
| N12 | Company adds "native Finnish speaker" | Rejected with the hint text; nothing saved; no audit event of kind `requirement.added` |
| N13 | Company confirms | `status: confirmed`, `version` incremented, `needcard.confirmed` audit row with `actor: company` |
| N14 | 5 questions survive the triggers | Exactly 3 shown, those with the largest `hardFilterWouldExclude` |
| N15 | `relevant == 0` | `scope: whole_pool`, `hardFilterWouldExclude: null`, whole-pool sentence rendered |
| N16 | Posting expires | Need Card becomes `stale`; daily job drafts no picks for it |

## 10. Contract change requests

| # | Change | Reason |
|---|---|---|
| C1 | `Job.sentences: string[]`, split at ingestion after redaction (section 2) | `Requirement.postingSentence` indexes into "the posting's sentences", which the model does not have today; indexes must be stable |
| C2 | `Job.workLanguages: string[]` (ISO 639-1, from Työmarkkinatori `position.workLanguages`) and `Job.sector: 'public' \| 'private' \| 'unknown'` | Language question trigger and the `language_act` statutory rule |
| C3 | `Requirement` adds `source: 'agent' \| 'company'`, `languageCode: string \| null`, `statutory: 'none' \| 'language_act' \| 'licence' \| 'clearance' \| 'other_law'`; `postingSentence` becomes `number \| null` (null for company-added) | Statutory handling, language matching, company additions |
| C4 | `Requirement.question` becomes `{type, text, why, answer: {choice: 'keep' \| 'make_nice' \| 'reworded' \| 'remove', note?, at} \| null}` | Record the company's answer; rule 4.2.6 |
| C5 | `Requirement.pool` becomes `{scope: 'relevant' \| 'whole_pool', relevant, speakTo, hardFilterWouldExclude: number \| null, selfDeclaredOnly: number \| null, computedAt}` | Honest denominators; statutory hides the exclusion count |
| C6 | `NeedCard` adds `version`, `lang`, `confirmedAt`, `droppedSentences: number[]`; `status` adds `stale` | Versioned edits; protected drops visible to organisers; expiry |
| C7 | New table `talent_signal_index (talent_id, card_version, signal_id, esco_uri NULL, phrase_en, kind)` with a `pg_trgm` GIN index on `phrase_en`, rebuilt on card approval | Pool counts and eligibility in SQL without parsing jsonb |
| C8 | New table `talent_language (talent_id, code, basis 'evidenced' \| 'declared')`, rebuilt on card approval from language signals and `lookingFor.workLanguages` | Language counts with the declared/evidenced split |
| C9 | New table `job_skill (job_id, skill_uri, origin 'posting' \| 'needcard')` and a `search_tsv` column on `job` (`simple` config over title + sentences) | SQL retrieval in `matching.md` |
| C10 | New table `needcard_draft_cache (job_id, job_last_modified, needcard jsonb)` or reuse `NeedCard` with `companyId: null` for feed postings | Lazy requirement extraction for the person's job feed |
