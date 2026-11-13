# Responsible AI

Scope: the talent side (interview, Signal Card, data rights). Matching, picks and the organiser console are specified by Stream S3 and must keep the same principles. The legal notes below are a design alignment by the team, not legal advice.

## 1. Principles and the mechanisms that enforce them

| # | Principle | Mechanism (where) |
|---|---|---|
| 1 | People know they are talking to an AI | Scripted opening says so before the first question (`interview.md` §5); consent screen; "How this works" page; rubric metric 15. |
| 2 | Nothing about a person is scored, ranked or levelled | No level field exists in `Signal`; quality words and years stripped from phrases in code; signals ordered by when they were said; test that no count, bar or percentage is rendered (`signal-card.md` test 16). |
| 3 | The interviewer elicits, never evaluates | Prompt rules plus a code guard that drops any interviewer sentence with a banned evaluative pattern before it is spoken (`interview.md` §7, §10.3); scripted fallback questions. |
| 4 | No emotion, voice or tone analysis | Only the transcript text reaches our models; audio is never stored by us; prompts forbid comments on feelings, accent or fluency; distress is answered with an offer to skip or stop, never a label. |
| 5 | Claims rest on the person's own words | Evidence by reference: models cite `[T3.S2]` labels; code resolves them and drops any that do not resolve; code renders the quote text; a CV never becomes evidence. |
| 6 | The person is in control of their card | Edit, remove, add, correct transcript, approve; nothing is used until approval; pool opt-in is separate and off by default. |
| 7 | A human decides about every introduction | The person approves the card; an organiser approves each pick individually with no "approve all" (S3); identities are revealed only after both sides opt in. |
| 8 | Same treatment whatever the language, accent, education or career path | Companies and organisers see a neutral English rendering with no quotes, language or input mode; place, school and employer names are generalised; no question about years, dates or gaps; the `beyond` question invites studies, volunteering and earlier careers; counterfactual twins measure invariance. |
| 9 | Protected attributes are never asked, stored on cards or shown | Prompt rules; a question lexicon in the output guard; a card lexicon that drops phrases and renderings; planted-fact tests (`interview.md` §10.4, §10.5). |
| 10 | Minimal data, short retention | No name or contact until an introduction is accepted; CV processed in memory only; live demo sessions purged after 24 hours; only the latest approved card and one draft are kept. |
| 11 | Every important change is traceable | Audit events for each state change (ids and counts, not content); one `LlmCall` row per model call with guard actions. |
| 12 | Robust to manipulation | Participant text is wrapped and declared as data; injected instructions cannot create evidence; output guard; JSON validated and retried once. |

## 2. Data inventory

| Data | Why | Stored where | Retention (demo) | Who sees it |
|---|---|---|---|---|
| Handle, `synthetic`, `liveDemo`, `inPool` | Pseudonymous identity of a card | `talent` | live demo: 24 h; synthetic: until the event ends | person, organiser, companies |
| Name and contact | Only to arrange an accepted meeting | `talent_identity`, filled when the person accepts an intro | as above | person; organiser and company after mutual opt-in |
| Consent records | Proof of consent and its wording version | `consent` | with the talent row | person, organiser (status only) |
| Turns: text, sentences, originals, kind | Evidence for the card; the person's corrections | `turn` | 24 h (live demo) | person; quotes to a company only after mutual opt-in |
| Interview state (coverage, counters, flag counts, CV seeds) | Running the conversation | `interview.state` | 24 h | nobody in the UI |
| Signal Card (draft and approved) | The person's approved account | `signal_card` | 24 h; at most one draft and one approved | per `signal-card.md` §4 |
| Audio | Speech-to-text only | **not stored by us**; processed by the voice vendor | vendor's policy (assume retained) | voice vendor |
| CV file and text | To suggest up to two questions | memory only, discarded after the seed call | none | the model provider (one call) |
| Model prompts and outputs | Debugging and evaluation | `fixtures/llm/` and logs **for synthetic sessions only** | until the event ends | team |
| `LlmCall` metadata (role, model, latency, tokens, ok, guard) | Monitoring, cost, reliability | `llm_call` | 30 days | team |
| Audit events (ids, actions, counts) | Traceability | `audit_event` | live demo: deleted with the talent except one unlinked `talent.deleted` event | organiser, team |
| Flags such as `protected_info`, `distress` | Steering the next question | counts in `interview.state` | 24 h | nobody in the UI |

Processors: model provider(s) configured for each role (Verda, hosted in Finland; or NVIDIA API, hosted in the USA), the voice vendor (ElevenLabs, USA; or the browser's speech engine, which sends audio to the browser vendor), and the VPS host. The consent screen names the ones in use.

## 3. What the system deliberately does not do

1. It does not score, rank, level, rate or compare people, and shows no match percentages.
2. It does not analyse voice, tone, emotion, facial expression or typing behaviour.
3. It does not store audio.
4. It does not ask about or record age, gender, nationality, ethnicity, religion, health, family status, residence-permit status or native language, and it uses no photos.
5. It does not ask for years of experience, dates or career gaps.
6. It does not treat a CV as evidence, keep the CV, or show it to anyone.
7. It does not put model-written text in quotation marks or present it as the person's words.
8. It does not verify claims; it labels the card as the person's own account.
9. It does not send anything about a person to a company without the person's approval of the card, pool opt-in, and an organiser's approval of that individual pick.
10. It does not use must-have requirements to filter anyone out (S3).
11. It does not use interview language or input mode in matching or show them before mutual opt-in.

## 4. Known limitations and mitigations

| Limitation | Effect | Mitigation | Residual risk |
|---|---|---|---|
| Speech-to-text accuracy varies with accent, noise and language | Wrong words in the transcript and in evidence | Push-to-talk; text input always available; the person corrects any sentence before approval; companies see a rewritten English rendering, so recognition errors and grammar do not reach them; extractor told to ignore disfluency | Errors the person does not notice; extra effort falls on accented speakers. Test with real accented speakers, which the team cannot fully do in 36 hours. |
| Extraction bias | Models may note more, or more polished, skills for fluent English speakers | Same prompt rules for all languages; phrases always English with ESCO labels from the taxonomy; counterfactual twins (same content, different name and language) report differences in signal count and ESCO overlap; the person can add signals | Twins cover only languages and names we generate; small sample. |
| Career-path and education bias | Non-linear careers or informal work under-represented | `beyond` question; no dates or years; schools and employers generalised in renderings | Phrasing still reflects what people feel entitled to say. |
| ESCO coverage gaps | New tools, Finnish-specific or informal roles get no ESCO match | The signal stays on the card with "No ESCO match"; matching also uses phrase text search (S3) | Fewer job matches for those signals. |
| Open-model reliability | Invalid JSON, language drift, slow first token, praise slipping in | Zod validation with one retry; fallbacks for every call; scripted opening and closing; output guard with fallback questions; record and replay; probe script picks models by measurement | Occasional generic fallback questions. |
| Invented evidence | A model cites sentences that do not exist | References resolved by code; unresolved ones dropped; text rendered from storage | A real sentence cited for a skill it only weakly supports; the person reviews. |
| Prompt injection | Someone tries to make the AI write a better card | Data wrapping, guard, evidence-by-reference; a card holds only what the person said and approved | A person can still claim anything; claims are labelled as self-reported. |
| Volunteered sensitive information stays in the transcript | Their own words are kept for evidence | Never on the card or in renderings; transcript visible only to the person until mutual opt-in; the person can clear any sentence; 24-hour purge | Revealed to a company with quotes after mutual opt-in if cited and not cleared. The extractor is told not to cite such sentences when avoidable. |
| Organiser bias | The human in the loop could be swayed by language cues | Organisers see the company-level view only | Name and other cues after an intro is accepted. |
| Vendor retention | Voice vendor may keep audio and text | Stated in consent; text input avoids it; production would use an EU-hosted speech service | Demo audio may be retained by the vendor. |

## 5. EU AI Act alignment

Timing, stated cautiously: the prohibitions (including emotion recognition in the workplace, Art. 5(1)(f)) and AI-literacy duties have applied since 2 February 2025. The high-risk obligations for Annex III systems were originally due on 2 August 2026; secondary sources say the 2026 Digital Omnibus moved them to 2 December 2027. **We have not checked this against the Official Journal.** The design assumes the high-risk obligations apply now.

Classification: AI used for recruitment or selection, in particular to analyse and filter applications and to evaluate candidates, is listed in Annex III point 4(a). Matching and picks fall there; the interview and card feed them. We treat the whole system as high-risk.

| Expectation | Article | How the design meets it | Gap for production |
|---|---|---|---|
| Risk management | 9 | This document; rubric and harness; limitations table | A maintained risk register with owners |
| Data and data governance, bias | 10 | Synthetic personas from the real job mix; counterfactual twins; protected-attribute lexicons; no protected data collected | Evaluation on real, consented, diverse speakers |
| Technical documentation | 11 | `docs/specs/`, `docs/research/`, capability table from the probe script | Formal Annex IV documentation |
| Record-keeping, logging | 12 | Audit events per state change; `LlmCall` rows with guard actions | Deployers keep logs at least six months (Art. 26(6)); the demo's 24-hour purge is a demo choice and would be revisited with Espoo's DPO |
| Transparency to deployers and people | 13, 50(1) | AI disclosure in the first utterance; "How this works" page; labelled renderings | Instructions for use for Espoo staff |
| Human oversight | 14 | Person approves the card; organiser approves every pick individually with a logged reason; no "approve all"; organiser can see the whole pool and who has no picks | Training for organisers (Art. 4 AI literacy) |
| Accuracy, robustness, security | 15 | Evidence by reference; validation and retries; guards; injection handling; fallbacks | Load and adversarial testing at scale |
| No emotion recognition at work | 5(1)(f) | No voice, tone or emotion analysis; audio never stored by us | none |
| Fundamental rights impact assessment | 27 (public bodies deploying high-risk AI) | Inputs ready: this document, data inventory, limitations | Espoo would carry out the FRIA before production |
| Explanation of decisions | 86 | Every pick reason cites the person's evidence and the posting's sentence (S3) | — |

## 6. GDPR alignment

| Topic | Design |
|---|---|
| Lawful basis | Demo: explicit consent per purpose (`interview`, `voice_vendor`, `live_demo`, `pool`), each with a text version. Production: Espoo's DPO decides; public task (Art. 6(1)(e)) may be more suitable for a city service, with consent kept for the pool. |
| Special categories (Art. 9) | Not asked for, not recorded on cards; volunteered information handled as in §4. |
| Minimisation (Art. 5(1)(c)) | Handle instead of name; identity only after an accepted intro; CV in memory only; no audio; flags stored as counts. |
| Storage limitation (Art. 5(1)(e)) | Live demo: 24 hours. One approved card and one draft. `LlmCall` metadata 30 days. |
| Information (Art. 13) | Consent screen and "How this works" page name purposes, processors and retention. |
| Access and portability (Art. 15, 20) | "Download my data" JSON export. |
| Rectification (Art. 16) | Edit phrases, correct transcript sentences, edit "looking for". |
| Erasure and withdrawal (Art. 17, 7(3)) | "Delete everything" at any time; pool opt-out at any time. |
| Automated decisions (Art. 22) | No decision about a person is made solely by automated means: the person approves the card, an organiser approves each pick, and both sides opt in before identities are shared. |
| Privacy by design (Art. 25), DPIA (Art. 35) | The mechanisms above; a DPIA is needed before production. |
| International transfers | NVIDIA API and ElevenLabs are US services. The demo states this at consent; production would use EU-hosted models (Verda) and an EU speech service. |

## 7. Public page: "How this works"

> **How WorkEspoo works**
>
> WorkEspoo is a hackathon prototype made for Junction 2026 and the City of Espoo challenge "Rethinking Recruitment". It is not an official City of Espoo service. People shown in the demo are synthetic unless they took part live and agreed to it.
>
> **A short conversation instead of a CV.** You talk or type with an AI interviewer. It asks a few short questions about your work: what you do, one example, the tools you use, who you work with, and what you are looking for. It tells you at the start that it is an AI.
>
> **The AI takes notes. It does not judge.** It does not score you, rate your answers, guess your level or comment on how you speak or feel. It does not ask about your age, gender, background, nationality, religion, health, family, residence permit or native language. If you mention any of these, it is not written down on your card.
>
> **Your words are the evidence.** Each note on your Signal Card points to sentences you said. The computer shows your sentences exactly as they were transcribed; the AI cannot invent a quote. Speech recognition makes mistakes, especially with accents, so you can correct any sentence.
>
> **You decide.** You can change any note, remove it, add your own, and approve the card only when you are happy with it. Nothing is used before you approve it.
>
> **What companies see.** Companies see your card under a nickname such as "Birch-27", with a short, neutral English description of each note written by AI and approved by you. They do not see your name, your own words, which language you spoke or whether you spoke or typed. If a company asks to meet you and you agree, they see your name and your own words.
>
> **People decide about introductions.** You choose whether to join the pool of people companies can be suggested. An Espoo organiser reviews every suggestion one by one before a company sees it. Requirements in a job ad never filter anyone out automatically.
>
> **Your data.** We do not store audio. Your voice is turned into text by {{voiceVendor}}, which may keep it under its own terms; you can type instead. Your text is processed by AI models from {{modelProviders}}. A CV, if you add one, is only used to suggest up to two questions and is not stored. Live demo sessions are deleted after 24 hours. You can download your data or delete everything at any time.
>
> **Limits we know about.** Speech recognition is less accurate for some accents. AI models can miss things or describe them differently for different people; that is why you review everything, and why we test the same answers in different languages and with different names. Some skills have no match in the European ESCO skills list; they stay on your card anyway.
>
> **Questions.** Ask the organisers at the event.
>
> Skills taxonomy: ESCO, European Commission.
