# WorkEspoo

Hackathon build for Junction 2026, City of Espoo challenge "Rethinking Recruitment". An AI interviewer turns a short conversation into a **Signal Card** (skills backed by the person's own words), shows matched real open jobs, and drafts **Daily Picks** for companies that an Espoo organiser approves before anything is sent. A person can then choose one job of the event and take a **job interview** whose questions come from that job's ad; the applicants for the job are rated against the ad and ranked, and an organiser checks the order before the company sees it.

Read in this order before writing code:

1. `docs/LEAD-DECISIONS.md`: what overrides the specs, and what each stream builds first
2. `docs/LIB-API.md`: the shared library in `src/lib` (binding signatures)
3. `docs/ROUTES.md`: every page and API path, and the test ids pages must carry
4. `docs/PATTERNS.md`: code patterns for this stack's versions
5. The specs for your stream in `docs/specs/`
6. `docs/research/` before calling any external API

Background: `docs/PLAN.md`, `docs/PLAN-AMENDMENTS.md`. Progress board: `docs/STATUS.md`. The early sketch in `docs/DATA-MODEL.md` is superseded by `src/contracts` and `src/db/schema`.

Live site: https://workespoo.aichat.fi (VPS 2.29.206.251). The app is built and run on the VPS; locally we only edit, lint, type-check and test.

## Rules that are never negotiable

1. **No Anthropic SDK or Anthropic API in app code.** Every model call goes through the gateway in `src/lib/llm` (OpenAI-compatible endpoints: NVIDIA Nemotron, DeepSeek or Kimi on Verda).
2. **No secrets in the repo.** Keys live in `/opt/workespoo/env/.env` on the VPS and in an untracked `.env.local`. Never print a key in logs or reports.
3. **People data is synthetic.** A live demo session needs explicit consent and is purged after 24 hours.
4. **One thing about a person is rated, and only with their knowledge: a job application.** A person who chooses a job and takes its job interview is told beforehand that the answers will be rated against the ad's requirements and that the applicants for that job will be ranked. The model rates the evidence for each requirement and writes reasons that point at the person's own sentences; code computes the order from those ratings; the person sees their own ratings and reasons. Everything else stays unscored and unordered: no levels on the Signal Card, no match percentages in the job feed, Daily Picks in no particular order. The interviewer never evaluates out loud and never comments on emotion. (The owner decided this on 14 November 2026; until then nothing was rated at all. See `docs/LEAD-DECISIONS.md`.)
5. **Evidence is cited by reference.** The model points at a turn and sentence index; code renders the text from the stored transcript. Model-written text is never presented as a quote.
6. **Protected attributes and their proxies are never stored or shown**: age, gender, nationality, ethnicity, religion, health, family status, photo. Names stay off cards. Original quotes, interview language and input mode are hidden from companies until both sides opt in. A rating never uses any of them: the assessor reads the job interview's answers without name, nickname, interview language or input mode, and a sentence that carries a protected detail is left out of what it reads.
7. **A human approves every pick individually** before a digest is published. There is no "approve all". Must-have requirements never filter anyone out of the pool. A ranked list of applicants reaches a company only after an organiser has checked it: the organiser can move a person, with a reason, and approves the list. A rating never removes anyone: every applicant stays on the list.
8. **Job ingestion drops personal data**: recruiter names, emails and phone numbers, including those inside description text.
9. **No voice, tone or emotion analysis.** Audio is never stored.

## Stack

Next.js 16 (App Router) + React 19 + TypeScript strict, Tailwind 4, shadcn/ui, Zod 4, Drizzle with Postgres 17 (`pg_trgm`), PGlite for tests, Vitest, Playwright. One package, npm. Docker Compose on the VPS: `caddy`, `web`, `worker`, `db`.

Your training data is probably older than these versions. Check `docs/PATTERNS.md` and the installed package before writing against an API from memory.

## Commands

| Command | What it does |
|---|---|
| `npm run check` | type check + lint + unit tests. Must pass before you finish. |
| `npm test` | unit tests (Vitest, PGlite) |
| `npm run dev` | local dev server (needs `.env.local`) |
| `npm run db:generate` | generate a migration from the schema. Lead only. |
| `npm run e2e` | Playwright against `E2E_BASE_URL` (defaults to the live site) |

## Layout and ownership

| Path | Owner |
|---|---|
| `src/contracts/`, `src/db/`, `drizzle/`, `src/lib/`, `src/components/ui/`, `src/app/layout.tsx`, `src/worker/index.ts`, `fixtures/`, `e2e/`, root config, `package.json`, lockfile, `infra/`, `docs/` | Lead only |
| `src/features/interview/`, `src/features/card/`, `src/app/api/interview/`, `src/app/api/card/`, `src/app/api/me/`, `src/app/(talent)/interview/`, `src/app/(talent)/card/`, `src/app/dev/s1/` | Stream S1 |
| `src/features/jobs/`, `src/features/needs/`, `src/app/api/jobs/`, `src/app/api/needs/`, `src/app/(company)/c/[token]/need/`, `src/app/dev/s2/` | Stream S2 |
| `src/features/matching/`, `src/features/picks/`, `src/features/intros/`, `src/app/api/matches/`, `src/app/api/picks/`, `src/app/api/digests/`, `src/app/api/intros/`, `src/app/api/organiser/`, `src/app/(organiser)/`, `src/app/(talent)/matches/`, `src/app/(company)/c/[token]/page.tsx`, `src/app/dev/s3/` | Stream S3 |
| `src/features/voice/`, `src/app/api/voice/`, `src/app/dev/voice/`, `src/features/synth/`, `seed/`, `evals/` | Stream S4 |
| `src/features/application/`, `src/app/api/application/`, `src/app/api/organiser/applicants/`, `src/app/api/applicants/`, `src/app/(talent)/apply/`, `src/app/(room)/apply/`, `src/app/(organiser)/organiser/applicants/`, `src/app/(company)/c/[token]/applicants/` | Stream S5 (job interviews and ranked applicants, `docs/specs/job-interview.md`) |

Route groups in parentheses do not appear in URLs: `src/app/(talent)/card/page.tsx` serves `/card`.

## Conventions

- `src/contracts` is the source of truth for every shape that crosses a boundary (API, DB json, SSE, LLM output). Import types from there; do not redefine them.
- Card bodies are stored as Zod-validated `jsonb`. Parse on read and on write.
- Feature code lives in `src/features/<name>/` and must not import from another feature's internals. Share through `src/lib` or `src/contracts`.
- Route handlers stay thin: parse input with Zod, call a feature function, return.
- Every model call states its role (`live`, `analyst` or `bulk`) and, for JSON, a Zod schema. Use the gateway's replay mode in tests; tests never hit a live model.
- Every state change that matters to a person writes an audit event through `src/lib/audit`.
- Tests sit next to the code as `*.test.ts`. DB tests use the PGlite helper in `tests/helpers/db.ts`.
- User-facing text is plain and non-judgemental. English first; Finnish strings come later.

## Working as a subagent

- You are in your own git worktree on your own branch. Commit there. Do not push, do not merge, do not deploy, do not touch `main`.
- Stay inside the paths your brief gives you. If you need a change in a lead-only path (a contract, a table, a dependency), do not make it. List it under "Requests for the lead" in your final report.
- Do not add npm dependencies unless your brief names them.
- Run `npm run check` before you finish and paste its summary into your report.
- Final report: what you built, what you verified and how, what is not done, requests for the lead, and the branch name with `git log --oneline -5`.

## Build orchestration (lead)

Sonnet subagents write code; Opus subagents write specs, explore design and set up infra. The lead owns contracts, schema, merges, deploys and verification. Deploy is `git push vps main`, lead only. Merge streams often, at least every two hours.
