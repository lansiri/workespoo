# Second pass, S3b: picks, the organiser's console, introductions

Paths: `src/features/picks/**`, `src/features/intros/**`, `src/app/api/picks/**`, `src/app/api/digests/**`, `src/app/api/intros/**`, `src/app/api/organiser/**`, `src/app/(organiser)/**`, `src/app/(company)/c/[token]/page.tsx`, `src/app/dev/s3/**`. Specs: `docs/specs/picks-and-intros.md`, `docs/specs/organiser-console.md`, `docs/specs/prompts/picks-draft.md`, `docs/specs/company-view.md`.

## Block A: decisions from the review

1. Out-of-date picks (`docs/LEAD-DECISIONS.md`, 14 Nov): a re-run of drafting refreshes the undecided, out-of-date picks of a draft digest, also when other picks in it are decided. Decided picks are never touched; a published digest never changes. Replace test P2 accordingly, keep the row lock and the re-check the review added, and make the message the organiser gets for an out-of-date pick true: "Run today's picks again" must now work.
2. The reasons prompt asks for at most 130 characters per reason (the schema keeps 160), as the lab recommends for the same model. Pass `deadlineMs: 20000`; a failed or late call uses the code-written reasons.
3. `src/features/picks/mask.ts` is now a re-export of `@/lib/mask`. Import from `@/lib/mask` directly and delete the file. The intros feature keeps its own constants; that duplication is accepted.

## Block B: what the organiser needs to see (report after this)

4. **Audit log**: `GET /api/organiser/audit` and `/organiser/audit`. Newest first, 100 at a time (`?before=`), filter by action (`?action=`). Each row: time, actor, action in plain words (three languages), subject, and the detail as stored (ids and counts). Rows whose detail has `seeded: true` carry the label "Seeded demo history". Test ids `audit-row` (with `data-action`) and `audit-filter`.
5. **Exposure**: `GET /api/organiser/exposure` and `/organiser/exposure`, as `organiser-console.md` describes it and as decided: bands (for example never suggested, suggested once, suggested several times), handles listed alphabetically inside a band, no numbers next to a person, no ordering by anything else. Test ids `exposure-band` (with `data-band`) and `exposure-handle`. This page exists so the organiser can see who is being left out; it must not become a ranking.
6. **Reset demo**: `POST /api/organiser/reset-demo` (organiser session) calls `resetDemoFromSnapshot` from `@/features/synth` and answers with its result; a two-step control on `/organiser` (`reset-demo`, then `reset-demo-confirm`) shows the outcome, including the plain message when no snapshot exists. Audit it as `system` with counts only if `AUDIT_ACTIONS` has a fitting action; otherwise say so in your report.
7. `/organiser` after the passcode: a short overview with links to the review queue, the audit log and the exposure page, and three counts: people in the pool, companies taking part, digests waiting for review.

## Not now

The pool, unmatched and settings pages, a person's detail page, talent-initiated requests, agenda slots, withdrawing and expiry routes.
