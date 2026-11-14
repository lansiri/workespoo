# Fourth pass, interview: skill labels chosen during the conversation, so the jobs board lights up for everyone

Paths: `src/features/interview/**`; a new `src/lib/esco-pick.ts` with its test; `src/features/card/esco-pick.ts` (it becomes a re-export, nothing else changes there); one optional field in `src/contracts/interview.ts`; a line each in `docs/LIB-API.md` and `docs/FEATURE-API.md`. Nothing else. The interview room's components already handle the events named below: do not change `InterviewRoom.tsx`, `useInterview.ts` or the kit unless a test proves an event is mishandled, and then say so in the report.

## What the real cards showed (14 Nov, fifteen simulated interviews with the real model)

The jobs board in the interview room ("Real open jobs light up here as you talk") is fed by `jobsLitForSignals` in `src/lib/jobs-lit.ts`: postings linked to a note's ESCO skill, and postings whose text mentions the note's phrase or its ESCO label. During the interview a note gets an ESCO skill only from `escoTopMatch`, which accepts near-exact labels (0.75). The looser, correct labels are chosen by the model among candidates (prompt C, `pickEscoLabels`), but only once, when the card is synthesised at the end.

Measured on the fifteen cards, postings lit during the interview against postings lit with the final labels:

| Person | During the interview | With the final labels |
|---|---|---|
| developers and engineers (six people) | 38 to 72 | 45 to 413 |
| a nurse | 0 | 42 |
| an early childhood teacher | 0 | 77 |
| a cook | 0 | 134 |
| a customer service specialist | 0 | 263 |
| a warehouse worker | 1 | 7 |

Phrases such as "Python" are found in posting text. Phrases such as "Monitoring patients after surgery" are in no posting, and the Finnish postings a nurse should see are reached only through the ESCO skill. So for most people the board stays empty until the interview is over, which is the opposite of what the screen promises. A reviewer who ran the room with the real model saw exactly that.

## Build

1. **Move prompt C to the shared library.** `pickEscoLabels`, `buildEscoPickMessages`, the prompt and its constants move from `src/features/card/esco-pick.ts` to `src/lib/esco-pick.ts`, unchanged in behaviour. `pickEscoLabels(db, items, opts?)` gains `opts: { purpose?: string; deadlineMs?: number }` (defaults: what the card uses today, `card.esco_pick` and `ESCO_PICK_DEADLINE_MS`). The role stays `analyst`. `src/features/card/esco-pick.ts` re-exports the same names so the card feature and its tests do not change. Move or copy the unit tests that exercise the function itself to `src/lib/esco-pick.test.ts`.

2. **Choose labels for new notes after each extraction.** In `src/features/interview/extractor.ts`, after an extraction has stored its notes and published its events (today's `signal.proposed`, `signal.updated`, `coverage.updated` and the first `jobs.lit` stay exactly as they are and are not delayed):
   - Take this interview's notes that are not removed, have no ESCO skill and have not been asked about before. Remember which note ids were asked in the interview state: add `escoAsked: z.array(z.string()).optional()` to `InterviewState` in `src/contracts/interview.ts`, and record the ids before the call so a failed call is not repeated for the same notes forever (one attempt per note).
   - Nothing to ask: no call.
   - One call for all of them: `pickEscoLabels(db, items, { purpose: "interview.esco_pick", deadlineMs: 10_000 })` with `key` the note id.
   - For each note that got a label: write it to the note's row (`escoUri`, `escoLabelEn`, `escoLabelFi`), only if the row still has no label and is not removed, and publish `signal.updated` with the note as it now is.
   - If at least one label was written: look the board up again with `jobsLitForSignals` over all the interview's notes that are not removed, and publish `jobs.lit`. Do not publish a second `jobs.lit` when nothing changed.
   - A failed, late or empty answer changes nothing and raises nothing: the board stays as it was. No retry loop and no sleep around the call (`docs/LEAD-DECISIONS.md`, "Model calls and the shared rate limit").

3. **It never delays the end of the interview.** The card is synthesised when the interview closes, and synthesis runs prompt C for the whole card itself. So: do not start the label call when the interview's stage is `closing` or `synthesising`, or its status is no longer `active`; and the code that waits for extractions before synthesis must not wait for a label call that is still running (look at how `track`, `waitForPending` and `finishInterview` work in `engine.ts`: give the label call its own kind if that is the clean way). `settleInterview` does wait for it, so the simulator and the tests see a settled interview. A label that arrives after the interview has closed is dropped.

4. **An answer that was removed.** If the person removes the answer a note rests on while the call is running, the note's row is gone or marked removed by the time the result arrives: write nothing for it. Follow the pattern the extractor already uses for a removed answer (re-read under the lock).

5. **Tests** with `setLlmFake` (the fake receives `purpose`, so it can answer `interview.extract` and `interview.esco_pick` differently):
   - a note with no exact label gets the picked label on its row, `signal.updated` is published for it, and a second `jobs.lit` follows whose count comes from the postings linked to that skill (seed one posting linked through `job_skill` or an occupation, and check the count went from 0 to 1);
   - a pick of 0 ("none") writes nothing, publishes no second `jobs.lit`, and the note is not asked about again after the next answer (count the calls by purpose);
   - a failed call (the fake throws) and a late call (deadline) leave everything as it was, and the note is not asked about again;
   - notes that already have a label from `escoTopMatch` are left out of the call, and there is no call at all when none is left;
   - one call covers several new notes;
   - in the closing stage no label call is made, and `finishInterview` does not wait for one that is running (make the fake's label answer slow and check that synthesis starts without it);
   - a removed answer's note gets no label;
   - the moved library function: the existing prompt C tests still pass from the new location, and the card feature's tests are unchanged and pass.

## Watch out for

- The pick is about meaning, not about the person: the prompt gets phrases and candidate labels only, as today. Do not add transcript text or the handle.
- One call per extraction, never one per note. The key allows 40 requests a minute for everything; an interview already makes two calls per answer.
- The first `jobs.lit` (phrases and exact labels) must still go out as soon as the notes are stored. The label call comes after it and can only add.
- `signal.updated` is an existing event the room handles by replacing the note in its list. Check in `pages.test.ts` or `useInterview`'s tests that a label-only update does not make the room treat the note as new again (no second "new" mark). If it does, say so under requests for the lead instead of changing the room.
- The label on a live note is a starting point only. Synthesis still chooses the card's labels itself; do not make synthesis depend on the live label beyond the fallback it already has.
- Evidence, phrases and the note's status are never changed by this step.
