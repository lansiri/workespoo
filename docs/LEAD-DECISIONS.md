# Lead decisions

Where a spec in `docs/specs/` and this file disagree, this file wins. Where this file is silent, the spec wins. Contracts in `src/contracts` and the schema in `src/db/schema` are frozen; ask the lead for changes.

## How the specs' contract requests were resolved

Almost everything requested was adopted. The differences:

| Spec says | What exists | Why |
|---|---|---|
| Split sentences with `Intl.Segmenter` (interview 6.1) | `splitSentences` in `src/lib/sentences.ts`, regex-based, same contract: 1-based numbers, segments over 30 words cut into chunks of at most 25 | Identical results on every Node version; one splitter for the whole project |
| Table `talent_signal_index` (C7) | The `signal` table. Rows with `status = 'approved'` mirror the approved card; rebuild them when a card is approved. `phrase` has a trigram index. | One table instead of two |
| Table `demo_company_posting` (C16) | Derive it: a posting whose `need_card` has a masked company is a demo-company posting | No extra table |
| Table `settings` (C23) | `app_meta` rows keyed `settings:<eventId>:<key>`; defaults in `MATCHING_SETTINGS_DEFAULTS` | No extra table |
| Table `needcard_draft_cache` (C10) | A `need_card` row with `companyId = null` | Reuse |
| `Interview.uiLang` as a column | `Interview.state.uiLang` | Already in the state object |
| `job.search_tsv` | `job.search` (generated `tsvector`, `simple` config, over title and description) | Name only |
| Signal ids `s1`... "within an interview" | Unique per person: primary key `(talent_id, id)` | A person has one card |
| `Signal.evidence` refinement in Zod | `signalEvidenceIsValid()` helper; enforce in code | Zod refinements break `.omit()` and `.extend()` |
| Audit action list | `AUDIT_ACTIONS` in `src/contracts/trust.ts`. Names are past tense (`needcard.drafted`, `digest.published`); use those spellings | One agreed list |

Numbering, fixed for everyone:

- Transcript labels: turn index 0-based (T0 is the opening), sentence numbers 1-based. `EvidenceRef` stores the label numbers as written.
- Posting sentences: plain 0-based indexes into `Job.sentences`, shown to models as `P0`, `P1`, ...

## Open questions the spec writers raised, decided

1. **Exposure view**: bands, with handles listed alphabetically. Exact counts only on a person's own detail page. Accepted as specified.
2. **Organiser and original quotes**: hidden by default; a logged, time-limited reveal (`organiser.quotes_viewed`) is a later item, not part of the first cut. The organiser never sees interview language or input mode.
3. **Masked postings leave the public feed**: accepted.
4. **Name and contact** are collected only when the person accepts an introduction: accepted.
5. **Company-view text strips country, nationality and language words**: accepted. The person can still list work languages themselves.
6. **Thresholds** (trigram 0.6 for requirement-to-signal, 0.45 for ESCO top match, the 2-of-3 relevance rule) are starting values. Keep each as a named constant in one place per feature so the lead can tune them against real data.
7. **24-hour purge and log retention**: live demo sessions are purged after 24 hours; audit rows stay but hold ids and counts only. This tension is stated in `responsible-ai.md` and in the pitch; it is not hidden.
8. **Demo event date**: Thursday 26 November 2026.
9. **Other languages**: scripted lines and bank questions exist in English and Finnish; anything else falls back to English.

## Changes to the demo flow in `docs/specs/demo-script.md`

- No name is asked for at consent (step 1). The person types their name and a contact when they accept an introduction (step 8). That is the moment identity is collected.
- The pool opt-in is a checkbox on the card page at approval (step 3), not at consent.
- Audit action names in step 10 follow `AUDIT_ACTIONS`: `pick.drafted`, `pick.approved`, `digest.published`, `needcard.question_answered`, `intro.requested`, `intro.accepted`, `identity.revealed`.
- The agenda slot in step 8 is a second-pass item. The first cut shows "You both said yes" without a slot.

## Three languages: English, Finnish, Swedish

The owner requires the site and the interviewer to work in Finnish, English and Swedish. Wherever a spec says "English and Finnish", read "English, Finnish and Swedish" (`UiLang` is `en | fi | sv`).

- **Interface**: every visible string goes through `src/lib/i18n` (see `docs/LIB-API.md`). A language switcher in the header sets a cookie. No hardcoded interface text in pages or components, including test pages people will see. `data-testid` values never change with language.
- **Interviewer**: scripted lines, the fallback question bank and the stop, skip and delete commands exist in all three languages in `src/lib/i18n/content/interview-lines.ts`. The reply-language rule becomes: `en`, `fi` or `sv` detected gives "Reply in English / Finnish / Swedish."; anything else gives "Reply in the same language as the person's last message." Language detection includes a Swedish stopword list.
- **Guards**: `src/lib/lexicon.ts` covers all three languages.
- **Voice**: speech-to-text and text-to-speech get the locale from `UI_LANG_LOCALES` until the conversation language is detected.
- **Cards stay in English** (phrases, headline, company view), with Finnish labels from ESCO shown beside them. That is what lets a company read a card whatever language the person spoke.
- **Model prompts stay in English.** Only the conversation and the interface are multilingual.
- The Swedish language code is `sv`. `se` is the country code for Sweden and is not used.

## What to build first, per stream

The specs describe the full product. Build in this order and stop to report when the first block works end to end. Later blocks are picked up in a second pass.

### S1: interview engine and card review

1. Start interview (consent, handle, scripted opening), turn endpoint with the planner, live reply through the output guard, turn extractor with merge rules, events endpoint, express and full modes, scripted closing.
2. Card synthesis (prompt A) with the fallback path, ESCO pick (prompt C can start as trigram top match), draft card, review page: remove a signal, edit a phrase, approve; `signal` rows synced on approval; pool opt-in.
3. Later: re-rendering after edits (prompt B), transcript correction, add-your-own signal, redaction commands, CV seed, export and delete, Finnish scripted lines.

### S2: demand

1. ESCO import, Työmarkkinatori ingester with redaction and sentence splitting, `job_skill`, occupation-to-skill crawl, `src/lib/esco.ts`, `src/lib/jobs-lit.ts`.
2. Need Card drafting from a posting (prompt, validation, ESCO mapping, statutory rules, questions), stored as draft; pool evidence counts; the company's confirm and answer flow on an unstyled page.
3. Later: Kuntarekry and The Hub ingesters, editing requirements, staleness, de-duplication across sources.

### S3: matching, picks, introductions

1. Eligibility (yes/no and touched requirements), the person's job feed with reasons (retrieval SQL, reason prompt, code checks, code fallback), daily digest drafting with the rotation rule, organiser review queue with per-pick approve and remove, publish.
2. Company digest page from a signed link, "ask to meet", the person's accept or decline, reveal on acceptance.
3. Later: unmatched queue, exposure view, talent-initiated requests, agenda slots, notifications inbox, settings screen.

### S4: voice, then the synthetic world

1. Browser adapter and ElevenLabs adapter behind `VoiceAdapter`, push-to-talk, playback queue, the token and text-to-speech routes, a test page that runs a whole interview by voice or text against S1's endpoints.
2. Personas from the real job mix, the simulated-candidate agent that drives S1's API, seed script for the demo event and masked demo companies, evaluation report.
3. Later: counterfactual twins and the invariance number, hands-free mode.

## Page rules for Phase 2

Phase 2 pages are the real routes and hooks without styling: plain HTML elements, shadcn primitives where they save time, no design work. Every interactive element gets a stable `data-testid`. Phase 3 restyles these pages without changing routes, hooks or test ids.

## Decisions made while reviewing the first stream reports (13 Nov, 23:00)

- **Model.** One model is available: `kimi-k3-1-pro` on Verda. It serves all three roles; `reasoning_effort` is `none` for the live role and `low` for the others. Measured settings and verified prompt changes land in `docs/llm-capabilities.md` and `docs/specs/prompts/PATCHES.md`.
- **Language requirements and `touches`.** Follow `matching.md` 3.1: a person who holds the required language (evidenced or self-declared) touches a language requirement, so "Fluent Finnish" is not listed as "not mentioned" for someone who declared Finnish. Language requirements still never count towards eligibility.
- **Feed retrieval gate.** On real data most postings carry ESCO occupations but no direct skills, and common skills such as Python, Java and SQL are only optional skills of software occupations. So a posting enters a person's feed when any of these holds: at least one direct skill link; at least two of the person's skills linked through the posting's occupations, essential or optional; one occupation-linked skill, essential or optional, plus a text hit for one of the person's signal labels (English or Finnish) in the posting; or text hits for at least two different signals. Essential links order above optional ones. This widens the person's own feed only. Eligibility for picks keeps its own rule.
- **Introductions on the person's page.** `introsForTalent` returns each introduction together with the company's display name (masked in the demo) and the need's title, so the page can say who is asking and about what. The contract type is `IntroForTalent`.
- **Age and gender wording in postings.** Keyword lists cannot tell "we want a young person" from "work with young people", so the word lists are not extended for this. The drafting model is told to leave such sentences out and list them as dropped; the prompt lab tests that on real postings.
- **Reasons stay in English** in the Finnish and Swedish interfaces, like card renderings. The surrounding labels are translated.

## Decisions from the Signal Card review (13 Nov, 23:20)

- **An edited phrase must not reach companies as the person typed it.** A phrase the person edits or adds can be in any language and any register, which would leak language and fluency. So: the person's wording is kept in `phraseOwn` (shown to them, and to a company only after both sides agree). The English `phrase` and the rendering that companies and the organiser see are rewritten by prompt B from the person's wording and the evidence. Until prompt B has answered, and whenever it fails, companies keep seeing the previous English phrase and rendering for that signal; for a signal the person added themselves with no previous text, the signal is left out of the company view until prompt B succeeds. The interim rule in the S1b brief (use the typed text directly) is withdrawn.
- **Speech and interview words** live in `src/lib/lexicon.ts` as `SPEECH_CUES` with `findSpeechCue()`, like every other word list.
- **Opting in to or out of the pool** enqueues `matching.card_approved`, so eligibility is recomputed; the matching handler must drop eligibility for someone who has left the pool.

## Decisions from the interview, picks and synthetic-world reviews (14 Nov, 00:00)

- **Everyone who starts on the site is a live demo session.** The public start page requires both the interview consent and the live-demo acknowledgement, and `POST /api/interview` refuses a body with `consent.liveDemo: false`. `startInterview` sets `purgeAfter` (now plus `LIVE_SESSION_TTL_HOURS`) on every person it creates, whatever the flag says. The simulator calls `startInterview` directly and then, in the same update that sets `synthetic: true`, clears `purgeAfter` and `liveDemo`. The purge job deletes every person with `synthetic = false` whose `purgeAfter` has passed. A person row that is neither synthetic nor due for purging must not exist.
- **Out-of-date picks in a digest that already has decisions.** A re-run of drafting refreshes the undecided, out-of-date picks of a draft digest (new reasons, new versions) even when other picks in it are decided. Decided picks are never touched, and a published digest never changes. This replaces the rule "a digest with any decision is left alone" in `picks-and-intros.md` section 2 and its test P2. Nobody has to be removed because the text behind a suggestion moved on.
- **"ideal" and "qualified"** stay in the picks reason check only. They are not added to the shared `BANNED_EVALUATIVE` list, because "qualified electrician" is a fact about a person and must survive on cards and in interviewer replies.
- **Seeded demo history** is written by actor `system` with `seeded: true` in the audit detail, and the organiser pages label it "Seeded demo history". The seed never writes an approval as if an organiser had made it.
- **Resetting the demo** restores the snapshot taken after the first real seed (`restoreDemoSnapshot`), so a reset needs no model. The organiser's "Reset demo" button calls it.
- **Model disclosure on the consent page** names what actually runs: an open-weight model (Kimi K3.1) served by Verda from Finland. No other vendor is named unless it is configured.
- **Model calls and the shared rate limit.** The key allows 40 requests a minute for everything. The gateway paces requests per provider, serves live calls first and bounds every call with `deadlineMs` (see `docs/briefs/p2-gateway.md`). Callers pass `deadlineMs` and handle a failed call with their coded fallback; nobody adds their own retry loop or sleep around a model call.
- **Durable retry ids, the shared SSE `id:` helper, and a contract field for "synthetic"** were requested and are not being done: one web process serves the demo, and the simulator labels its own people.

## Decisions from the second-pass reviews and the first real run (14 Nov, 01:30)

- **A rewrite never changes an approved card.** When the rewrite of an edited phrase (prompt B) finishes after the person has approved their card, its result goes into a new draft for the person to approve; the approved card, and what companies see, keep the previous text. A signal with no previous text stays out of the company view until the person approves again. "Approved by them" must be true of every word a company reads.
- **ESCO labels.** `escoTopMatch` accepts only near-exact labels (0.75). On the full ESCO list the old threshold labelled "Excel" as "demand excellence from performers" and "React" as "react to mining emergencies". Looser but right labels are chosen by the model among candidates (prompt C), once per card. No label is better than a wrong one: labels drive matching.
- **The job feed** counts and orders postings by how many different notes of the person a posting relates to, with text evidence by whole phrase (the person's phrase or the ESCO label in English or Finnish), never by single words from inside a label. One tool by itself (SAP, Excel) does not bring a posting in. See `docs/briefs/p3-s3a.md`.
- **"Open jobs mention this"** in the interview means what it says: postings whose text mentions the phrase or its ESCO label, plus postings linked through ESCO (`jobsLitForSignals`).
- **A reply the guard cuts after its question is a completed model call**, not a failure, in logs and reports.
- **Model roles are priorities.** `live`: the interviewer's reply and the turn extractor (the person is watching the notes appear). `analyst`: calls a person is waiting on (card synthesis, a rewrite, feed reasons, picks the organiser asked for, a company's Need Card). `bulk`: everything nobody is waiting on. Web and worker split the request budget 70 to 30 (`LLM_RPM_SHARE`).
- **The organiser's audit page** shows the actor kind and the subject type in the page's language (labels), followed by the stored id. The stored row stays as written.
- **Interview audit rows** must not carry the voice flag: the organiser never learns whether someone spoke or typed.
- **Country and nationality words in requirement text** pass only as places of work ("work in Norway") or in front of a business word ("the Norwegian market"). Everything else is treated as being about a person's origin and is refused, Finland included ("must be Finnish").
- **Recruiter names in postings**: a sentence is removed when it has a contact marker or a clear contact cue; a weak cue needs a name pattern next to it. When unsure, the sentence stays: a lost job sentence costs a Need Card its evidence.
- **What the public page may claim.** Every sentence on `/how-it-works` and on the consent page must be true of the product as built. Not built, so not claimed: correcting a transcribed sentence, adding a note of one's own, and testing the same answers under different names and languages.
- **Eligibility threshold is one.** `matching.md` 3.2 asked for two related anchor requirements when a need has three or more. On the first real data nobody in the pool reached two for any of eight real needs: real requirements are specific, and few notes link to them mechanically. One related skill, experience or education requirement now makes a person eligible for an organiser's look (`ANCHOR_THRESHOLD_LARGE = 1`). Test M4 changes accordingly. The organiser still decides every suggestion, and the rotation rule still chooses whom to draft.

## Decisions from moving speech recognition to our own server (14 Nov, 10:30)

- **Speech is turned into text on our own server.** The browser's `SpeechRecognition` heard the first word of an answer on phones and nothing after it (the level meter took the microphone from it on Android, Android ends recognition at the first pause, and Firefox and iOS do not have it reliably). The browser now captures the audio itself, once, and sends it to `POST /api/voice/stt`; the `stt` container (sherpa-onnx with Parakeet TDT 0.6b v3) answers with text. Measurements, protocol and limits: `docs/research/voice-stt.md`. The browser engine stays as the fallback when the container is down, and `VOICE_ADAPTER=browser` forces it.
- **The audio is never stored, on either hop.** It is held in memory in the web process for the length of the request and in the `stt` container for the second it takes, and dropped. The container has a read-only file system, no volume, no secrets and no route to the internet. Neither audio nor recognised text is logged anywhere.
- **Loudness is the only thing measured about the audio**, in the browser, for two purposes: the level meter, and finding a pause at which the speech so far can be sent. This is not voice analysis in the sense of rule 9: nothing about the speaker is derived, and nothing is kept.
- **The endpoint is not public.** It needs a talent session whose person gave the voice consent (kind `voice_vendor`, kept under that name), or an organiser session for the test page. A caller gets at most 90 seconds of audio a minute.
- **Consent wording, version `2026-11-v2`.** With the `server` adapter the person is told that the audio goes to WorkEspoo's own server, is turned into text there and deleted at once. The old wording stays for the other adapters.
- **A spoken answer is sent as it was heard.** There is no step to correct the text before it is sent (it was never built, and the public page does not claim it). The person sees the words, can remove the answer and say it again, and checks every note on the card.
- **The interviewer's voice plays straight from the audio element.** The level meter that routed it through a Web Audio context is gone (it fed only the test page, and on a phone a suspended context means a silent interviewer). A clip that stops moving is asked to play again after a second and skipped after four, so one stalled sentence cannot silence the rest of a reply.
- **A press of the talk button ends when the finger lifts**, not when React has drawn the listening state.
- **The speech image is its own image** (`infra/stt/Dockerfile`), tagged with the runtime and the model and built by the deploy hook only when that tag is missing, so an ordinary deploy never downloads the model again and a problem with it cannot break the app image.
