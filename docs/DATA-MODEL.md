# Data model (draft v0)

The Zod contracts in `src/contracts/` are the source of truth once they exist. This sketch lets spec writers and builders agree on names first. Propose changes under "Contract change requests" in your report; do not invent parallel shapes.

## People and conversations

- **Talent**: `id`, `handle` (pseudonym such as "Maple-42"), `synthetic` (bool), `liveDemo` (bool), `purgeAfter`, `inPool` (opted in to being suggested). Identity (name, contact) lives in a separate `talent_identity` row and is revealed only after a mutual opt-in.
- **Interview**: `id`, `talentId`, `mode` (`express` | `full`), `lang`, `status` (`active` | `completed` | `abandoned`), timestamps.
- **Turn**: `id`, `interviewId`, `index`, `role` (`interviewer` | `participant`), `text`, `sentences[]` (the text split into sentences at storage time), `inputMode` (`voice` | `text`), `at`.
- **EvidenceRef**: `{ turnIndex, sentenceFrom, sentenceTo }`. The model sees sentences labelled like `[T3.S2]` and cites those labels. Code renders the text from `Turn.sentences`. A reference that does not resolve is dropped.
- **Signal**: `id`, `phrase` (short, in English), `kind` (`skill` | `tool` | `knowledge` | `domain`), `esco` (`{uri, labelEn, labelFi}` or null), `evidence: EvidenceRef[]`, `hasExample` (internal only: tells the interviewer whether to ask for a concrete example; never displayed), `status` (`proposed` | `approved` | `removed`), `addedBy` (`agent` | `person`).
- **SignalCard** (stored as validated jsonb): `handle`, `headline`, `signals[]`, `lookingFor` (`roles[]`, `workMode`, `startFrom`, `workLanguages[]`, all self-declared and optional), `companyView` (`summary` plus one neutral English rendering per signal, labelled as a rendering), `approvedAt`, `version`.

## Demand

- **Job** (a public posting): `id`, `source` (`tmt` | `thehub` | `kuntarekry` | `workinfinland`), `sourceId`, `url`, `title`, `employerName`, `employerBusinessId`, `municipality`, `region`, `lang`, `description`, `postedAt`, `expiresAt`, `escoOccupationUris[]`, `escoSkillUris[]`, `active`, `raw` (jsonb).
- **Company**: `id`, `displayName` (masked in the demo, such as "Demo company 07"), `source` (`posting` | `synthetic`), `participating` (bool), `digestToken`.
- **NeedCard** (stored as validated jsonb): `id`, `jobId`, `companyId`, `title`, `summary`, `requirements[]`, `status` (`draft` | `confirmed`).
- **Requirement**: `id`, `text`, `kind` (`must` | `nice`), `category` (`skill` | `language` | `education` | `experience` | `authorisation` | `other`), `escoSkillUris[]`, `postingSentence` (index into the posting's sentences), `question` (optional `{text, why}`, phrased as a question to the company), `pool` (`{speakTo: n, hardFilterWouldExclude: n}`).

## Matching and introductions

- **JobMatch** (for the person's own job feed): `talentId`, `jobId`, `reasons[]` (`{text, evidence?: EvidenceRef, postingSentence?}`), `notMentioned[]` (requirements the conversation did not cover). Jobs may be ordered for the person; that ranks postings, not people.
- **Digest**: `id`, `companyId`, `date`, `status` (`draft` | `published`), `publishedBy`, `publishedAt`.
- **Pick**: `id`, `digestId`, `companyId`, `needCardId`, `talentId`, `reasons[]`, `notMentioned[]`, `status` (`suggested` | `approved` | `removed`), `decidedBy`, `decidedAt`, `decisionNote`. Picks have no score and no order.
- **Intro** (the opt-in state machine): `id`, `talentId`, `companyId`, `needCardId`, `initiatedBy` (`company` | `talent`), `status` (`requested` | `accepted` | `declined` | `withdrawn`), `revealedAt`, `agendaItemId`.
- **Event**, **AgendaItem**: `event {id, name, date, format}`; `agenda_item {id, eventId, talentId, companyId, startsAt, endsAt, place, status}`.

## Trust and plumbing

- **Consent**: `id`, `subjectType`, `subjectId`, `kind` (`interview` | `pool` | `voice_vendor` | `live_demo`), `textVersion`, `grantedAt`, `withdrawnAt`.
- **AuditEvent**: `id`, `at`, `actor` (`system` | `agent:<role>` | `organiser` | `talent` | `company`), `action`, `subjectType`, `subjectId`, `detail` (jsonb).
- **LlmCall**: `id`, `at`, `role`, `provider`, `model`, `purpose`, `latencyMs`, `tokensIn`, `tokensOut`, `ok`.
- **JobQueue**: `id`, `kind`, `payload`, `runAfter`, `attempts`, `lockedAt`, `doneAt`, `error`.
- **ESCO**: `esco_concept {uri, type, labelEn, labelFi, labelSv, isco, retired}`, `esco_occupation_skill {occupationUri, skillUri, relation}`.

## Server-sent events during an interview

`turn.delta` (interviewer text chunk), `turn.done`, `signal.proposed`, `signal.updated`, `jobs.lit` (`{count, sample[]}`), `coverage.updated`, `interview.completed`, `error`.
