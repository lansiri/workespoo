# Signal Card

Owner: Stream S1 (`src/features/interview/`, `src/app/(talent)/card/`). Synthesis prompts: `prompts/card-synthesis.md`. Copy: `copy.md`.

The Signal Card is the person's own account of what they can do. Each skill points at their words. Nothing on it is a score, a level or a ranking, and nothing is used until they approve it.

## 1. Anatomy

| Part | Source | Notes |
|---|---|---|
| Handle | generated (section 6) | e.g. `Birch-27`. Never the person's name. |
| Headline | synthesis | at most 10 words, English, neutral |
| Signals, in 4 groups | synthesis, then the person | section 2 |
| Per signal: phrase | synthesis or the person | English, 2 to 6 words |
| Per signal: ESCO label | prompt C | shown as `labelEn · labelFi`, or "No ESCO match" |
| Per signal: your words | `Turn.sentences` via `EvidenceRef` | rendered by code, never by a model; person-only before opt-in |
| Per signal: shown to companies as | `companyView` item | AI rendering, labelled |
| Looking for | synthesis (`roles`) and a form | all optional and self-declared |
| Transcript | `Turn` rows | each sentence correctable by the person |

`lookingFor` fields:

| Field | Values | Set by |
|---|---|---|
| `roles[]` | up to 3 short strings | synthesis proposes from the `looking_for` answer; person edits |
| `workMode` | `onsite` \| `hybrid` \| `remote` \| `any` | form, optional |
| `startFrom` | `now` \| `within_1_month` \| `within_3_months` \| `later` | form, optional |
| `workLanguages[]` | free chips, max 5 | form, optional, helper text says it is optional and visible to companies |

## 2. Grouping and wording

1. Four groups in this fixed order: **What I do** (`skill`), **Tools** (`tool`), **Know-how** (`knowledge`), **Fields** (`domain`). Empty groups are hidden.
2. Within a group, order by the first evidence turn index, then by id. Never by count of evidence, presence of an example, or anything that implies strength.
3. Phrases: English, 2 to 6 words, no quality words, no levels, no years. Skills read as activities ("Filing supplier claims"), tools as names ("SAP"), know-how as subjects ("Food hygiene rules"), fields as sectors ("Elderly care").
4. The number of evidence sentences is never displayed to anyone other than the person, and `hasExample` is never displayed to anyone.
5. A person-added signal shows the tag "Added by you" (person) or "Added by the person" (others).

## 3. Review flow

The person lands on the draft card right after synthesis. Every action writes an audit event (ids and counts only, no text).

| Action | Rules | Effects | Audit |
|---|---|---|---|
| **Edit a phrase** | 2 to 60 characters. Any language. A hit on the card lexicon (`interview.md` 10.4 B) shows a gentle warning ("Companies will see this. You don't need to share it.") but does not block: it is the person's choice. | Store the person's text in `phraseOwn`. Rendering prompt B returns the English `phrase` and new `companyView` text; ESCO re-picked (prompt C). The person sees "Shown to companies as: …". | `card.signal_edited` |
| **Remove a signal** | Any signal. Undo available until approval. | `status: removed`; excluded from the approved version and from `companyView`. | `card.signal_removed` |
| **Add your own** | Phrase required (2 to 60 chars). "In your own words" optional, up to 3 sentences, 400 chars. Max 6 added signals. | The words are stored as a new participant `Turn` (`kind: review_note`, `inputMode: text`), split into sentences, and cited as evidence. Without words, `evidence: []` (allowed only for `addedBy: person`). Rendering B and ESCO C run. | `card.signal_added` |
| **Correct a transcript sentence** | One sentence at a time, max 400 chars. A correction replaces one sentence slot; it cannot split or merge slots, so references stay valid. Clearing a sentence redacts it. | First correction copies the original into `sentencesOriginal`. Signals citing the sentence get stale renderings (B re-runs). No re-extraction. If a signal loses all evidence, it is removed with an undo notice. | `transcript.corrected` |
| **Edit "Looking for"** | Free edit within section 1 limits. | — | `card.looking_for_edited` |
| **Approve** | At least one signal not removed. All renderings fresh (B runs automatically; button shows "Preparing company view…"). | Snapshot as the approved version (section 7). `proposed` → `approved`, removed signals dropped from the snapshot, `approvedAt` set. Then the pool opt-in screen. | `card.approved {version, signalCount}` |

Notes:

1. The company preview ("What companies see") is visible on the review page at all times, not hidden behind a click.
2. Corrections exist because speech-to-text makes mistakes, especially with accents. The interface never calls them errors by the person.
3. Review has no time limit except the 24-hour purge for live demo sessions, which the page states.
4. The card records what the person said, not verified facts. The company label says so.

## 4. What each audience sees

| Item | Person | Organiser | Company before mutual opt-in | Company after mutual opt-in |
|---|---|---|---|---|
| Handle | yes | yes | yes | yes |
| Name and contact (`talent_identity`) | yes | only for intros accepted by both sides | no | yes |
| Headline, `companyView.summary` | yes | yes | yes | yes |
| Signal phrases (English) and ESCO labels | yes | yes | yes | yes |
| `companyView` renderings, with label | yes (as preview) | yes | yes | yes |
| Original quotes (evidence sentences) | yes | no | no | yes |
| Full transcript | yes | no | no | no (quotes only) |
| Interview language, input mode (voice/text) | yes | no | no | yes |
| `lookingFor` | yes | yes | yes | yes |
| Draft (unapproved) card, removed signals | yes | no | no | no |
| `phraseOwn` (person's own wording) | yes | no | no | yes |
| `hasExample`, extractor flags, coverage | no | no | no | no |
| Synthetic demo profile label | yes | yes | yes | yes |
| Pool status, approval date, version | yes | yes | no | no |

The organiser sees the company-level view on purpose: the person approving picks must not see fluency or language cues either.

## 5. Rules for `companyView`

Generated by prompts A and B, checked by code. These rules are copied verbatim into both prompts as R1 to R8.

1. Plain standard English, third person ("They …"), one sentence per signal, at most 25 words. Summary at most 2 sentences, 40 words.
2. Only facts from the cited sentences.
3. Never a quote; never the person's unusual wording or grammar. This removes fluency cues.
4. No praise, levels, years, durations or comparisons.
5. Employers, schools and people become generic descriptions; tools, software, machines, standards and certificates keep their names.
6. No countries, cities, regions, nationalities or languages spoken.
7. Never mention the interview, speaking, typing, translation, accent or language.
8. No protected information.

Code checks after every generation: card lexicon (10.4 B) on all `companyView` text; length limits; on failure, one regeneration, then the fallback text `They list {phrase} as a skill.`

Fixed label shown above the renderings (English for every company): "Written by AI from this person's own words and approved by them. Not a quote, not a verified fact." Person-added signals without words show "Added by the person" instead of a rendering-from-words claim (rendering text: `They list {phrase} as a skill.`).

ESCO labels are shown in English and Finnish for everyone, whatever the interview language, so the presence of Finnish labels reveals nothing.

## 6. Handle scheme

1. Format `{Word}-{NN}`: a word from the fixed list below and a number 10 to 99, chosen with a cryptographic random source.
2. Words are nature and object nouns that are not common given names and carry no gender, nationality or religious meaning: Maple, Birch, Cedar, Spruce, Alder, Larch, Pine, Moss, Lichen, Pebble, Granite, Basalt, Quartz, Harbour, Fjord, Delta, Meadow, Ridge, Glacier, Comet, Orbit, Lantern, Compass, Anchor, Beacon, Kettle, Ladder, Bridge, Canal, Island, Valley, Cloud (32 × 90 = 2,880 handles).
3. Unique across all talent rows, retry on collision; after 20 collisions use 3 digits.
4. Assigned at consent, stable across card versions, never derived from personal data, never reused while the row exists. Synthetic personas use the same scheme and carry the synthetic label.

## 7. Versioning

1. At most two card rows per person: the **current approved** version and one **draft**.
2. First synthesis creates a draft with `version` = 1. Approval turns it into approved version 1.
3. "Edit my card" after approval copies the approved card into a new draft with `version` = n + 1. The approved version n stays in use for matching until the draft is approved.
4. Approving version n + 1 replaces version n, which is deleted (minimisation; the audit log keeps the fact and the counts).
5. `card.approved` carries `{talentId, version}`. Matching (S3) re-checks drafts and picks against the new version: a pick whose reasons all cite removed signals is withdrawn; companies always see the latest approved version.
6. Discarding a draft restores nothing and changes nothing; audit `card.draft_discarded`.

## 8. Pool opt-in

1. Shown after the first approval, default **off**. Separate consent record `kind: pool` with its `textVersion`.
2. Only an approved card can be in the pool. Without opt-in the person still sees their own job matches; organisers and companies never see them.
3. Live demo sessions may opt in for the demo; the screen states they are still deleted after 24 hours.
4. Opting out at any time: `inPool = false`, `withdrawnAt` set; pending (`suggested`) picks removed; open `requested` intros set to `withdrawn`; accepted intros stay (the person agreed to them) but can be withdrawn individually.
5. Audit `pool.opted_in` / `pool.opted_out`.

## 9. Export and delete

**Export** ("Download my data"): one JSON file `workespoo-{handle}.json` containing talent flags and handle, identity (if given), interview metadata, all turns with sentences and originals, the draft and approved card, consents, intros, and audit events whose subject is this person. Generated on request, not stored. Audit `data.exported`.

**Delete** ("Delete everything"): one confirmation, then synchronously hard-delete talent, identity, interviews, turns, cards, consents, picks and intros. In a published digest the pick shows "This profile was removed." Keep one audit event `talent.deleted` with a random id that is not linked to anything else. The 24-hour purge for live demo sessions runs the same routine.

## 10. Acceptance tests

1. **Given** a draft card, **when** the person edits the phrase "Kassapalvelu", **then** `phraseOwn` = "Kassapalvelu", `phrase` is English, `companyView` for it is regenerated, and the company preview shows the English text.
2. **Given** a signal citing T3.S2, **when** the person corrects T3.S2, **then** `sentencesOriginal` holds the old text, the evidence still resolves to T3.S2, and its rendering is regenerated before approval is enabled.
3. **Given** a correction that clears the only sentence a signal cites, **when** saved, **then** the signal is removed with an undo notice.
4. **Given** the person adds a signal with words, **when** saved, **then** a `review_note` turn exists, the signal cites it, `addedBy = person`, and others see "Added by the person".
5. **Given** a draft with all signals removed, **when** the person tries to approve, **then** approval is disabled with the `card.approve_empty` copy.
6. **Given** an approved card, **when** a company views it before opt-in, **then** the response contains no evidence sentences, no `lang`, no `inputMode`, no `phraseOwn`, no `hasExample` (check the API payload, not just the UI).
7. **Given** an approved card, **when** the organiser views it, **then** the payload equals the company-before-opt-in payload plus pool status, version and approval date.
8. **Given** a mutual opt-in, **when** the company views the card, **then** original quotes, language and input mode appear.
9. **Given** a Finnish interview and an English twin with the same content, **when** both cards are synthesised, **then** neither `companyView` reveals the language, and both show ESCO labels in both languages.
10. **Given** a person who said "in Lagos I did bookkeeping", **when** the card is synthesised, **then** no `companyView` text or phrase contains "Lagos" or "Nigeria".
11. **Given** an approved version 1, **when** the person edits and approves again, **then** only version 2 exists, `card.approved {version: 2}` is emitted, and the audit log shows both approvals.
12. **Given** the pool is off, **when** S3 drafts picks, **then** this person is never included.
13. **Given** the person opts out of the pool, **then** their `suggested` picks are removed and `requested` intros become `withdrawn`.
14. **Given** "Delete everything", **when** confirmed, **then** no row references the talent id, a published digest shows "This profile was removed.", and one `talent.deleted` audit event exists.
15. **Given** 1,000 generated handles, **then** all match `^[A-Z][a-z]+-\d{2,3}$`, all are unique, and none is in a given-names list used by the test.
16. **Given** the review page, **when** rendered, **then** no element shows a count, percentage, level, star or bar next to a signal.

## 11. Contract change requests

| # | Change | Reason |
|---|---|---|
| 1 | `SignalCard.status`: `draft` \| `approved`; at most one row of each per talent | Versioning (section 7) needs a draft beside the approved card. |
| 2 | `companyView` shape: `{label: string, summary: string, items: [{signalId, text, stale: boolean}]}` | The draft says "summary plus one rendering per signal"; this makes it concrete and lets approval wait for fresh renderings. |
| 3 | `Signal.phraseOwn?: string` | The person may write a phrase in Finnish or their own words; companies must see an English `phrase` without losing what the person wrote. |
| 4 | `Signal.evidence` may be empty only when `addedBy = person` (Zod refinement) | Person-added signals without words. |
| 5 | `Signal.id` short stable ids (`s1` …) | Referenced by extractor, synthesis and picks. |
| 6 | `lookingFor` enums: `workMode` `onsite\|hybrid\|remote\|any`; `startFrom` `now\|within_1_month\|within_3_months\|later` | The draft names the fields without values. |
| 7 | `Turn.kind` includes `review_note`; `Turn.sentencesOriginal[]` | Person-added evidence and transcript corrections (see `interview.md` requests 3 and 4). |
| 8 | Unique index on `Talent.handle` | Section 6. |
| 9 | Audit action names: `interview.started`, `interview.turn`, `interview.turn_redacted`, `interview.completed`, `cv.seeded`, `card.synthesised`, `card.synthesis_fallback`, `card.protected_dropped`, `card.signal_edited`, `card.signal_removed`, `card.signal_added`, `card.looking_for_edited`, `transcript.corrected`, `card.approved`, `card.draft_discarded`, `pool.opted_in`, `pool.opted_out`, `data.exported`, `talent.deleted` | One agreed list so the organiser console and export can rely on it. |
| 10 | A separate API projection per audience (`CardForPerson`, `CardForOrganiser`, `CardForCompany`, `CardForCompanyRevealed`) in `src/contracts` | Hidden fields must be absent from the payload, not just hidden in the UI (test 6). |
