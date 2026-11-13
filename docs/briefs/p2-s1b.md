# Second pass, S1b: the Signal Card

Paths as in `s1b-card.md`: `src/features/card/**`, `src/app/api/card/**`, `src/app/api/me/**`, `src/app/(talent)/card/**`. Specs: `docs/specs/signal-card.md`, `docs/specs/prompts/card-synthesis.md`, `docs/specs/responsible-ai.md`, and `docs/specs/prompts/PATCHES.md` for the patches named below.

## Block A: what the real model needs

1. **CS-1 and CS-2** in prompt A; **CR-1 and CR-2** wherever the rules R4 and R7 appear in your prompt texts. R1 to R8 must read the same in prompt A and prompt B. Use the combined R4 text given under CR-2.
2. Finding synth-F4: run `findBannedEvaluative` over every rendering the model returns ("junior" was copied into one). On a hit, use the code-built sentence for that signal instead.
3. Finding render-B2: the sentence "They list <phrase> as a skill." for a signal with no described example is written by code, never asked of the model. Lower-case the phrase's first letter unless it is an acronym or a product name the person wrote that way.
4. Bound the waits: `deadlineMs: 45000` on synthesis, `deadlineMs: 15000` on a re-render. When synthesis fails or is late, the existing fallback card is used. A person who presses approve never waits on a model.
5. Finding synth-F5: add to prompt A's roles task "Studies, courses and shift preferences are not roles."

## Block B: an edited phrase must not reach companies as typed

6. Implement the decision in `docs/LEAD-DECISIONS.md` ("Decisions from the Signal Card review"): when the person edits a phrase or adds a signal of their own, their wording is stored in `phraseOwn` and shown to them; the English `phrase` and the company-view item are rewritten by prompt B (`card-synthesis.md`, role `analyst`, purpose `card.render`) from their wording and the signal's evidence, then checked with the same code checks as synthesis. Until prompt B has answered, and whenever it fails, companies and the organiser keep seeing the previous `phrase` and rendering; a signal with no previous text stays out of the company view until prompt B succeeds. Do the re-render as a queue job (`card.render`, payload `{ talentId, signalId, cardVersion }`) so the edit request returns at once, and make approval use whatever is current without waiting. Tests: an edit in Finnish never appears in `cardForCompany` or `cardForOrganiser`; the fallback paths; a stale job for an older version changes nothing.
7. The purge job follows the new retention rule: delete every person with `synthetic = false` whose `purgeAfter` has passed, whatever `liveDemo` says. Audit as today.

Report after block B. Then continue with block C.

## Block C: the person's data is theirs

8. `GET /api/me/export`: one JSON download with everything stored about the session's person: the card (draft and approved), signals, the transcript as stored (redacted turns stay redacted), consents, introductions and their status, and the audit rows about them. No other person's data, no model logs. Test id `export-data` on the card page.
9. `DELETE /api/me`: deletes the person and everything that hangs off them (interviews, turns, signals, cards, consents, matches, eligibility, picks, introductions, identity), writes one audit row with ids and counts only, clears the session cookie. A two-step control on the card page: `delete-data`, then `delete-data-confirm`. After it, `/card` shows the plain "nothing here" state. Test that no row with the person's id is left in any table except the audit log, and that the audit rows about them hold no text.

## Not now

Transcript correction, adding a signal with the person's own new evidence, card history.
