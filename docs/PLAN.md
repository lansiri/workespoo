# WorkEspoo: build and orchestration plan

## Context

Junction 2026, City of Espoo challenge "Rethinking Recruitment". Espoo runs TalentMatch-style matchmaking events and wants more signal and less noise between companies and talent, now that CVs are AI-written and screening is AI-assisted. Judging: impact 45%, innovation and UX 35%, responsible and feasible execution 20%. Hard rules from the brief: synthetic data for people, minimal personal data, no automated decisions about individuals without a human involved.

What you asked for:

- an eye-catching AI interviewer that asks a few questions, can read a CV, and then shows real open jobs from public APIs
- company demand taken mostly from those APIs, with an agent that matches candidates to companies and sends daily picks
- three phases in this order: foundation, features, UI
- built and run directly on the VPS, at `workespoo.aichat.fi`
- no Anthropic models inside the app: Nemotron, or DeepSeek/Kimi on Verda
- the build fanned out to subagents: Sonnet for coding, Opus for ideas, feature design and infra

The project folder is empty, so everything below is new. Assumed deadline: Sunday about 10:00, roughly 36 hours. Tell me if it differs.

## What we are building

Registration for an Espoo matchmaking event becomes a four-minute conversation with an AI interviewer instead of a CV form. Everything downstream (jobs shown, companies suggested, picks sent) rests on what the person actually said.

Three objects carry the product:

| Object | What it is | Who controls it |
|---|---|---|
| **Signal Card** | A person's skills, each mapped to the ESCO taxonomy and backed by a verbatim quote from their interview. No scores, no name, no age, nationality or photo. | The person reviews, edits and approves it before anything uses it. |
| **Need Card** | A company's need, drafted by the agent from its real public job posting: must-haves, nice-to-haves, and requirements worth questioning (for example "fluent Finnish" on an English-language R&D role), with a count of how many candidates each hard requirement excludes. | The company confirms or edits it. |
| **Daily Picks** | Per company, a short list of people worth a conversation, each with reasons quoting both sides. | An Espoo organiser approves every list before it is sent. Identities stay hidden until both sides say yes. |

Your daily-picks idea is in here with one change: a person approves each list before it goes out, because the brief rules out automated decisions about individuals. Approval is one click, so it still runs daily.

The flow:

1. **Talent** opens the site, consents, and talks to the interviewer by voice (push-to-talk, any language) or text. An uploaded CV only seeds questions; a CV claim becomes a signal only when the conversation backs it.
2. **During the interview**, skills appear on screen as a growing constellation and real open jobs light up around the speaker as each skill is recognised. This is the demo moment.
3. **After the interview**, the person approves their Signal Card and immediately sees matched open jobs in Espoo and Uusimaa, plus event companies worth meeting, each with a plain-language reason.
4. **The agent** runs every morning and on demand: ingests new postings, drafts Need Cards, drafts Daily Picks.
5. **The organiser** works a review queue: approve, edit or remove picks, see why each was suggested, see who is being under-exposed.
6. **The company** gets a digest link, sees anonymised cards with reasons, and asks to meet. The person accepts or declines. Only then are identities revealed and a slot booked.
7. **Event day**: each participant has a pre-computed agenda page, served statically so nothing stampedes at the opening minute.

How this maps to the judging criteria:

| Criterion | What answers it |
|---|---|
| Impact 45% | Companies get relevant people early, from postings they already wrote. Talent get help articulating skills. Organisers get a queue instead of a pile of applications. |
| Innovation and UX 35% | Live voice interview, the constellation, reasons instead of match percentages, a requirement-impact meter for companies. |
| Responsible and feasible 20% | Human approval before anything is sent, evidence quotes enforced in code, no voice or emotion analysis, pseudonymous cards, audit log, open-weight models on EU infrastructure, official API path for production. |

## Decisions already made

| Topic | Decision | Why |
|---|---|---|
| Host | VPS `2.29.206.251`, domain `workespoo.aichat.fi` | DNS already resolves there. Ports 80 and 443 are closed, so I treat it as a fresh box. |
| Where code lives | Edited in this folder, pushed to the VPS, built and run there | Meets "build directly on the VPS" while keeping fast local tooling and worktrees for subagents. Nothing runs locally except lint, type checks and tests. |
| App LLM | Any OpenAI-compatible endpoint, chosen by config. No Anthropic SDK in the app. | Your instruction. Verda and NVIDIA both speak this format. |
| Main job source | Työmarkkinatori (national job board) | Works without a key, about 1,300 Espoo and 3,700 Uusimaa postings, each tagged with ESCO occupations. |
| Other job sources | The Hub, Work in Finland, Kuntarekry (City of Espoo's own jobs) | English-language and startup coverage. All verified working today. |
| Duunitori | Not ingested | Its API works, but its terms forbid storing or scraping and `robots.txt` disallows `/api/`. Say so if you want a live, non-stored search anyway. |
| Skills taxonomy | ESCO, loaded from Työmarkkinatori's public code lists (15,152 skills, 3,039 occupations, Finnish, Swedish and English labels) | One download, no form. ESCO bridges an English-speaking candidate to Finnish-language postings. |
| Voice | Push-to-talk by default, text always available | The venue is loud. Anthropic has no speech API, so voice is a separate service regardless. |
| People data | Synthetic personas only, clearly labelled | Brief requirement. |

Two caveats to keep honest in the pitch:

- The Työmarkkinatori endpoints I verified are the website's own, undocumented ones. The official API needs a key and IP allowlisting, which takes weeks. Production path: Espoo, as the employment authority, onboards to the official API.
- Recruitment AI is a high-risk use under the EU AI Act. Secondary sources say the 2026 Digital Omnibus moved those obligations to 2 December 2027. I have not checked the Official Journal text, so confirm with Espoo's mentors. The design assumes the obligations apply now.

## Inputs I need from you

| # | Input | Blocks |
|---|---|---|
| 1 | First login on the VPS, new root password, then `ssh-copy-id -i ~/.ssh/id_ed25519.pub root@2.29.206.251` (you said you are doing this now) | All of Phase 1 infra |
| 2 | LLM keys: a Verda key (DeepSeek, Kimi) and/or an NVIDIA key for Nemotron. Any other OpenAI-compatible base URL also works. | Every AI feature |
| 3 | Voice: an ElevenLabs key (about $22 covers the hackathon), or any OpenAI-compatible speech endpoint. Without one, voice falls back to the free browser engine: Chrome only, robotic. | Voice quality, not the build |
| 4 | Optional: an email provider key if picks should arrive as real email. Otherwise the digest is a web page with a link. | Nothing |

You said the model choice is still open, so the gateway takes any of these by config and the probe script picks by measurement. My starting suggestion:

| Role | With a Verda key | With only an NVIDIA key |
|---|---|---|
| Live interviewer turns (speed matters) | DeepSeek V4.1 Flash, thinking off | `nvidia/nemotron-3.5-lightning-30b-a3b` or `deepseek-ai/deepseek-v4.1-flash` |
| Analysis: signal extraction, Need Cards, match reasons | Kimi K3.1 Pro | `nvidia/nemotron-3-ultra-550b-a55b` or `moonshotai/kimi-k2.6` |
| Bulk synthetic interviews | DeepSeek V4.1 Flash | `nvidia/nemotron-3-super-120b-a12b` |

The NVIDIA model IDs are from its public model list today. Its free tier throttles at roughly 40 requests a minute, best effort, and is meant for evaluation, so the live demo should not rest on it alone. Verda gives the pitch a clean line: open-weight models served from Finland.

## Architecture

One TypeScript package, four containers on the VPS.

| Piece | Choice |
|---|---|
| Web | Next.js 16 (App Router): pages, API routes, server-sent events |
| Worker | Same codebase, separate process: ingestion schedule, Need Card drafting, matching, digests |
| Database | Postgres 17 with `pg_trgm` and pgvector, Drizzle for schema and migrations |
| Proxy | Caddy, automatic HTTPS for `workespoo.aichat.fi`, response buffering off for streams |
| Deploy | `git push vps main` to a bare repo on the VPS. Its hook builds images, runs migrations, swaps containers, health-checks, and rolls back to the previous image on failure. |
| Mirror and CI | Private GitHub repo `workespoo`, GitHub Actions for lint, type check and unit tests |
| Tests | Vitest with PGlite (in-process Postgres, so each worktree tests without a DB server), Playwright against the live URL with a fake microphone fed from a WAV file |

Key design points:

- **LLM gateway** (`src/server/llm/`): three roles (`live`, `analyst`, `bulk`), each mapped by env to a provider and model. It handles streaming, JSON output validated against Zod with one repair retry, per-provider rate limits, a fallback chain, and an audit row per call. A probe script measures each configured model (time to first token, JSON validity, Finnish sample) and writes a capability table, which is how we pick models quickly.
- **Interview engine** (`src/server/interview/`): two loops. The fast model speaks each turn. After every answer the stronger model extracts signals in the background and leaves a note steering the next question. Code then checks every evidence quote is a substring of the transcript and drops any that is not, strips protected attributes, and maps skills to ESCO.
- **Voice** (`src/lib/voice/`): one client interface with swappable adapters. The browser engine is the baseline. The premium adapter is ElevenLabs realtime speech-to-text (live partial transcript, manual commit on button release) plus sentence-chunked text-to-speech. With ElevenLabs the user's audio goes from the browser straight to the speech service and never touches our server.
- **Matching** (`src/server/match/`): retrieval by ESCO skill and occupation overlap plus bilingual full-text search, then the analyst model reranks and writes reasons. No numeric score on a person anywhere. Picks rotate so the same few profiles are not always shown.
- **Synthetic world** (`src/server/synth/`): about 50 generated personas are interviewed by the real engine through a simulated-candidate agent. That produces the demo data and doubles as the regression test for the interviewer.
- **Trust layer** (`src/server/trust/`): consent records, audit log, export and delete, retention job, redaction. Access is demo-grade: anonymous talent session, organiser passcode, magic links for companies.

Repo layout: `src/contracts` (Zod schemas), `src/db`, `src/server/{llm,interview,voice,jobs,esco,match,trust,synth}`, `src/worker`, `src/app`, `src/components`, `src/lib/voice`, `infra/`, `docs/specs/`, `scripts/`, `tests/`.

## How I run the build

- I am the lead: contracts, DB schema, merges, deploys, verification, and talking to you.
- **Opus subagents** write feature specs (conversation design, prompts, rubrics, acceptance tests), explore design directions, and set up infra.
- **Sonnet subagents** write code, each in its own git worktree, against a spec and the shared contracts.
- Per feature: Opus spec, then Sonnet build, then review against the spec, then I merge, deploy and smoke-test on the VPS.
- Shared files (`src/contracts`, `src/db`, `package.json`, config) are lead-only. Each workstream owns its own directories, so merges do not collide.
- `CLAUDE.md` holds conventions and these rules. `docs/STATUS.md` is the live progress board you can read at any time.
- I continue through the phases without waiting, post a short status at each gate, and stop only for blockers: missing keys, access, or anything outward-facing not covered below.
- An independent review of this plan is still running. I will fold its findings into the Phase 1 briefs and tell you if anything changes scope.

## Phase 1: foundation, tooling, pipeline (about 4 hours)

Wave 1a, in parallel:

| Agent | Model | Delivers |
|---|---|---|
| Infra | Opus | VPS bootstrap script (Docker, firewall for 22, 80, 443, fail2ban, swap if memory is small), Caddy, the push-to-deploy hook with rollback, nightly DB backup, runbook. Key-only SSH after key login is verified. |
| Scaffold | Sonnet | Next.js app, Tailwind, shadcn/ui, ESLint, Prettier, Vitest with PGlite, Playwright, Dockerfile, compose file, CI workflow, health route |
| Product spec | Opus | `docs/specs/`: interview conversation design, signal rubric, Need Card rubric with the requirement challenger, match-reason style, responsible-AI rules, acceptance tests per feature |
| Lead | me | Contracts, DB schema, `CLAUDE.md`, workstream briefs, first deploy |

Wave 1b, in parallel once the scaffold is merged:

| Agent | Model | Delivers |
|---|---|---|
| LLM gateway | Sonnet | Gateway, provider profiles, probe script, capability table |
| Data foundation | Sonnet | ESCO import, Työmarkkinatori ingester (search plus detail, recruiter contact data dropped), worker schedule |
| Voice spike | Sonnet | Browser adapter, streaming turn endpoint, bare test page |

**Gate 1**: the live URL serves over HTTPS; a deploy and a forced rollback both work; CI is green; one streamed model turn and one voice round trip work in the browser; at least 1,000 Espoo postings and the ESCO lists are in the database.

## Phase 2: features (about 11 hours)

Each workstream is an Opus spec followed by a Sonnet build, and ships code, unit tests and a plain `/dev` test page.

| Workstream | Scope |
|---|---|
| A. Interview engine | Session state, prompts for talent and company modes, background analyst, coverage tracking, CV text as question seeds, language mirroring, Signal Card synthesis and approval |
| B. Voice | Premium adapter for whichever key you provide, push-to-talk and hands-free, playback queue, interruption |
| C. Jobs and search | The Hub, Work in Finland and Kuntarekry ingesters, de-duplication, ESCO occupation-to-skill cache, bilingual search |
| D. Matching and picks | Talent-to-job matching with reasons, Need Card drafting, requirement challenger and its impact count, Daily Picks drafting, review-queue logic, digest, mutual opt-in, agenda builder |
| E. Synthetic world | Personas, simulated interviews, demo event seed, counterfactual fairness check (swap name and interview language, confirm picks do not change) |
| F. Trust layer | Consent, audit log, export and delete, retention, redaction, passcode and magic links |

**Gate 2**: the full path runs on the VPS through the `/dev` pages: simulated candidate, interview, card, matched real jobs, Need Cards, draft picks, organiser approval, digest, company interest, mutual reveal, agenda. An evaluation report covers at least 20 simulated interviews: JSON validity, quote faithfulness, latency.

## Phase 3: app, UI, website (about 11 hours)

1. **Design direction** (Opus, two or three explorations in parallel): visual identity, typography, motion, the orb and constellation concept. I pick one and write the design system. The site is branded WorkEspoo and labelled as a hackathon prototype, not an official City of Espoo service.
2. **UI builders** (Sonnet, in parallel): landing page; interview experience (orb, transcript, push-to-talk, constellation, card reveal); Signal Card and matches; organiser console (queue, supply and demand, fairness, audit); company digest and Need Card editor; event-day mobile agenda.
3. **Polish** (lead plus Sonnet): mobile layouts, empty, loading and error states, English and Finnish UI text, accessibility pass, demo mode with a reset button, pitch script.

**Gate 3**: Playwright runs the golden path on the live site with the fake microphone; screenshots reviewed on desktop and phone sizes; a load test on agenda pages; a tagged demo freeze.

The remaining hours are buffer, pitch material and submission.

## Cut list if we run behind

Drop in this order: event-day agenda and QR check-in, real email sending, the fairness check, the public-services panel, CV upload, the extra job sources, Finnish UI text, the company voice interview.

Never cut: the live interview, the Signal Card with enforced quotes, matched real jobs, organiser approval of picks, the audit and transparency page.

## Risks

| Risk | Mitigation |
|---|---|
| LLM keys arrive late, or a provider throttles | Gateway fallback chain, probe on arrival, recorded fixtures so builders are not blocked, seeded demo data that does not need a live model |
| Open models return broken JSON or weak Finnish | Schema validation with repair, small schemas, English as default interview language, Finnish terms on cards come from ESCO rather than the model |
| Voice fails in a loud hall | Push-to-talk default, text fallback, browser engine as baseline |
| An undocumented job endpoint changes | Raw responses stored, serving decoupled from ingestion, frozen snapshot for the demo |
| UI comes last and UX problems surface late | Design tokens and layout shell land in Phase 1, the interview test page uses real components from Phase 2, phase gates are hard time boxes |
| A bad deploy breaks the live site | Health-checked swap with automatic rollback, demo freeze tag |
| VPS is small | Check at bootstrap, add swap, no local embedding model by default |

## Verification

- `npm run check`: type check, lint, unit tests. Runs locally, in each worktree, and in CI.
- `npm run llm:probe`: capability table for every configured model.
- `npm run sim -- --n 20`: simulated interviews and the evaluation report.
- `scripts/smoke.sh` after every deploy: health, database, posting count, model ping.
- Playwright end-to-end on `https://workespoo.aichat.fi` with the fake microphone.
- One thing only you can check: I cannot hear audio, so you judge how the voice sounds and whether the microphone works on a real phone.

## What approving this plan authorises

- Commits on `main` and pushes to the VPS remote, which deploy.
- Creating a private GitHub repo named `workespoo` under your account and pushing to it. I will ask again before making it public.
- Running the bootstrap on the VPS as root, including switching SSH to key-only once key login is verified.
- Installing local tooling, using sudo where needed. Passwords you gave me stay in chat and are never written to a file.
- Running parallel subagents: about three to six at a time, Sonnet for code, Opus for specs, design and infra.
- No real emails to real companies. Digests go to demo addresses only.

## Sources

- EU AI Act timeline: [Gibson Dunn on the Omnibus agreement](https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/), [Cloud Security Alliance research note](https://labs.cloudsecurityalliance.org/research/csa-research-note-eu-ai-act-omnibus-vii-deadline-delay-20260/)
- Espoo events: [TalentMatch events](https://www.espoo.fi/en/talentmatch-events), [Espoo Talent Hub](https://www.espoo.fi/en/working-life/talent-espoo), [Work in Finland feat. Espoo Talent Match online](https://www.workinfinland.com/en/events-talent/talent-match-online-2025/)
- Job data and terms: [Työmarkkinatori job-posting APIs](https://tyomarkkinatori.fi/ohjeet-ja-tuki/rajapinnat/tyopaikkailmoitusten-rajapinnat), [API terms of use](https://tyomarkkinatori.fi/ohjeet-ja-tuki/rajapinnat/tyopaikkailmoitusten-rajapinnat/tyomarkkinatorin-tyopaikkailmoitusten-rajapintojen-kayttoehdot), [Duunitori terms of service](https://duunitori.fi/compliance/en/terms-of-service), [The Hub terms](https://thehub.io/terms), [Work in Finland terms](https://www.workinfinland.com/en/terms-of-use)
- ESCO: [ESCO download page](https://esco.ec.europa.eu/en/use-esco/download), [Työmarkkinatori code-list documentation](https://tyomarkkinatori.fi/jobposting-new/documentation/KIPA-manage-jobpostings-en.html)
- Models: [Verda Inference](https://verda.com/inference), [Verda pricing](https://verda.com/pricing), [DeepSeek V4.1 Flash on Verda](https://verda.com/blog/deepseek-v4-1-flash), [NVIDIA free-tier rate limit thread](https://forums.developer.nvidia.com/t/rate-limit-increase-request-40-rpm-200-rpm-build-nvidia-com-free-tier/384546)
- Voice: [ElevenLabs API pricing](https://elevenlabs.io/pricing/api), [ElevenLabs streaming speech-to-text](https://elevenlabs.io/docs/cookbooks/speech-to-text/streaming), [ElevenLabs models](https://elevenlabs.io/docs/overview/models)
