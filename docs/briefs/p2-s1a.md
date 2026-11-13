# Second pass, S1a: the interview engine

Paths as in `s1a-interview.md`: `src/features/interview/**`, `src/app/api/interview/**`, `src/app/(talent)/interview/**`, `src/app/dev/s1/**`. Specs: `docs/specs/interview.md`, `docs/specs/prompts/interviewer-live.md`, `docs/specs/prompts/turn-extractor.md`, `docs/specs/prompts/cv-seed.md`, `docs/specs/responsible-ai.md`, and `docs/specs/prompts/PATCHES.md` for the patches named below.

The engine has only ever run against a fake model. The prompt lab ran its prompts on the real one; blocks A and B apply what that found.

## Block A: what the real model needs

1. **IL-1**, the planning leak: the guard buffers completed sentences and shows nothing until a sentence ending in `?` arrives; at 40 words without one it discards the buffer, aborts and uses the fallback question. Apply the prompt line too. Keep the review fix that holds or drops a statement so the reply stays within 2 sentences and 40 words.
2. **IL-2** through the gateway: pass `deadlineMs: 6000` on the live call. On any failure with no question shown, use the target's fallback question. Remove any timer of your own that duplicates this.
3. **TE-1, TE-2, TE-3** in the extractor prompt, and the new merge rule 2 of TE-1 in code. TE-2 and finding extractor-F5 edit the same line; use this text: `"phrase": always English (translate Finnish or Swedish), 1 to 6 words (a tool or software name alone is fine; never a company or employer name),`. Pass `deadlineMs: 20000` on the extractor call.
4. Finding interviewer-live-F5: in the interviewer's FACTS, replace `- Nobody gets a score or a ranking. You do not rate answers.` with `- You do not rate, compare or rank people or answers.` (the old line made the guard drop the model's own honest answer).
5. Reply language: check that `sv` gives "Reply in Swedish." and that a Swedish speaker gets the Swedish fallback questions and scripted lines, as `docs/LEAD-DECISIONS.md` says; add the tests if they are missing.
6. When the extractor flags `wants_stop`, the next planning step closes the interview with the scripted closing (the model's own `[[STOP]]` stays as the immediate path).

## Block B: decisions and contract alignment

7. Consent and retention (`docs/LEAD-DECISIONS.md`, 14 Nov): the start page requires `consent-interview` and `consent-live-demo` before `start-interview` is enabled; `POST /api/interview` answers 400 for `consent.liveDemo: false`; `startInterview` sets `purgeAfter` for every person it creates, whatever the flag. Keep `startInterview` callable with `liveDemo: false` (the simulator does that).
8. The contract now has `TurnRequest.clientTurnId`, and `InterviewState.lastExtracted` and `recentFlags`. Remove the casts around `clientTurnId`, drop the local `EngineState` extension in `store.ts`, and remove `opts.idempotencyKey` and the `Idempotency-Key` header path: the body field is the only retry id. `isKnownTurnKey` stays exported.
9. Text on the consent page, all three languages: the model line says what really runs, "an open-weight AI model (Kimi K3.1) run by Verda on servers in Finland"; the voice line must not contain an untranslated English fragment (today the Finnish text reads "your browser's speech service"): name the service from the voice configuration in the page's language.
10. After a normal ending, `recentFlags` can be written back by a late extraction. Clear it after the last extraction has settled.

Report after block B. Then continue with block C if nothing is broken.

## Block C: the CV as a source of questions, and removing an answer

11. **CV seeds** (`prompts/cv-seed.md`, `interview.md` sections 3 and 4): a text area `cv-text` on the start page ("Paste your CV if you like. It is only used to choose questions and is not kept."); `startInterview` runs the seed prompt (role `analyst`, purpose `interview.cv_seed`, `deadlineMs: 8000`) and stores at most two validated seeds in the state; the CV text is never stored, logged or sent anywhere else; a failed or late call means no seeds and the interview starts normally. The planner uses a seed as the spec says. A CV claim never becomes a signal by itself. Include the spec's injection test.
12. **Removing an answer** (`interview.md` 6.2 and 6.3, acceptance test 13): the spoken or typed command in all three languages, and a `turn-remove` control on each of the person's own turns; redact as section 6.3 says, drop signals left without evidence, publish the events, audit it, confirm with the scripted `deleted` line and re-ask the same target with the fallback question.

## Not now

Transcript correction, transcript export (export belongs to S1b's `/api/me/export`), hands-free voice, durable retry ids.
