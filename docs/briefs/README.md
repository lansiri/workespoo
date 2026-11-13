# Stream briefs: rules shared by every Phase 2 stream

Read this file, then your stream's brief in this folder.

## Where you work

- Your launch message gives you a git worktree path and branch. Work only there. Start every shell command with `cd <your worktree> && ...` and use absolute paths under it with the file tools. Never modify the main checkout at `/home/lansiri/junction26/duuniespoo`.
- Dependencies are installed in your worktree. Do not run `npm install` and do not add dependencies. If you truly need one, stop and say so in your report.
- Commit on your branch as you go, with clear messages. Do not push, merge or deploy.

## Read before writing code

`CLAUDE.md`, then `docs/LEAD-DECISIONS.md` (it overrides the specs), `docs/LIB-API.md`, `docs/FEATURE-API.md`, `docs/ROUTES.md`, `docs/PATTERNS.md`, then the specs your brief names. The stack is newer than you may remember (Next 16, React 19, Zod 4, Tailwind 4, Vitest 5): check `docs/PATTERNS.md` and the installed packages before writing an API from memory.

## What is frozen

- `src/contracts`, `src/db/schema`, `drizzle/`, `src/lib`, root config and `package.json` are lead-owned. If you need a change there, do not make it: list it under "Requests for the lead" and work around it locally for now.
- Signatures in `docs/LIB-API.md` and `docs/FEATURE-API.md`, paths and test ids in `docs/ROUTES.md`.
- Your own feature's `index.ts` already exists as a stub. Replace the stub bodies; keep the exported signatures.
- Other features: import only from `@/features/<name>` and only what `docs/FEATURE-API.md` lists. Their stubs throw "not implemented" until their stream is merged, so in tests mock them with `vi.mock`, and in real code handle their failure gracefully where your brief says so.

## Rules that are easy to break

1. **No scores, levels or rankings of people**, anywhere: not in the database, not in a payload, not in a sort order, not in a CSS class name.
2. **Evidence is rendered by code** from stored sentences through `EvidenceRef` and `renderEvidence`. Model-written text is never shown as a quote.
3. **Hidden means absent.** Build the payload for each audience from the projection types in `src/contracts/signal.ts`. Never send a field and hide it in the UI.
4. **Three languages.** Every string a person can see comes from a `Messages` object in English, Finnish and Swedish (see `docs/LIB-API.md`, `src/lib/i18n`). Use the shared content in `src/lib/i18n/content/` first; put your feature's extra strings in `src/features/<name>/messages.ts`. Write real Finnish and Swedish. Model prompts stay in English.
5. **Word lists** come from `src/lib/lexicon.ts`. Do not copy lists out of the specs.
6. **Audit** every state change that matters to a person with `audit()` and an action from `AUDIT_ACTIONS`. `detail` holds ids and counts only.
7. **Model calls** go through `@/lib/llm` only, each with a `role` and a `purpose`, and pass `db` so the call is logged. Tests install `setLlmFake`; they never reach a model.

## Pages

Phase 2 pages are the real routes with real behaviour and no design: semantic HTML, shadcn primitives from `src/components/ui` where they save time, a little spacing. Give the elements listed in `docs/ROUTES.md` their `data-testid`. Phase 3 restyles these pages without changing routes, hooks or test ids, so keep data loading and state in hooks or server functions, not tangled into markup.

## Tests

- Vitest, next to the code. Database tests use `createTestDb()` from `tests/helpers/db.ts`; `loadJobFixtures(db)` from `fixtures/load.ts` gives you about 40 real postings with their ESCO concepts.
- Timeouts are already generous in `vitest.config.mts`; the machine is shared with other agents, so do not add sleeps or real timers, and inject the clock where time matters.
- Turn the acceptance tests in your specs into real tests wherever they fall inside your first blocks.
- `npm run check` must pass before you report.

## How far to go

Your brief lists blocks in order. Finish block 1 completely (code, tests, page, check passing) before starting block 2. Report when the blocks marked "report after this" are done; do not start later blocks unless your brief says to continue. A smaller thing that works end to end is worth more than a larger thing that almost works.

## Report

Short and factual: what works end to end and how you verified it; what is built but unverified; what is not done; deviations from specs or the API documents, with reasons; requests for the lead; `git log --oneline -8`.

## Second pass (from 14 Nov)

All six streams are merged on `main`. The second-pass briefs are the `p2-*.md` files in this folder. Everything above still applies, with these additions:

- Your worktree starts from `main` with every stream merged, so the other features are real now, not stubs. Keep mocking them in unit tests where that keeps a test small, but nothing may depend on a "not implemented" error any more.
- `docs/specs/prompts/PATCHES.md` overrides the prompt specs. Where your brief names a patch (IL-1, NC-2 and so on), apply its text exactly as written there. `docs/LEAD-DECISIONS.md` has new sections at the end; read them. Do not edit anything under `docs/`.
- **No real model calls.** Do not run `npm run lab`, and do not run `npm run sim` or `npm run seed` against a model. The key allows 40 requests a minute for everything; the lead runs the real-model pass alone after merging.
- Pass `deadlineMs` on model calls where your brief says so. It is declared in `LlmOptions` today and enforced once the gateway pass is merged. On a failed or late call, use the coded fallback your spec defines; never add your own retry loop or sleep around a model call.
- Work through the numbered items in order and commit after each block with `npm run check` passing. If an item turns out much bigger than it looks, finish the earlier ones, say so and stop.
- In your report, list every numbered item as done, not done, or changed (with the reason).
