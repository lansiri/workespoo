# Third pass, S1b: ESCO labels chosen with the model, and no lost evidence

Paths as before: `src/features/card/**`, `src/app/api/card/**`, `src/app/(talent)/card/**`. Spec: `docs/specs/prompts/card-synthesis.md` (section C and "Code after A"), `docs/specs/signal-card.md`.

## What the first real run showed (14 Nov, the live site, the real model)

A synthetic warehouse worker told the interviewer how the handheld scanners kept losing their connection near the cold storage, how they mapped where it happened, moved two access points and wrote a one-page guide for the shift. The card that came back had seven signals and none of that story. The audit row says one signal was dropped as protected: the model wrote "diagnosed", the health word list matched, and the person's best evidence was deleted with it. On the same card "Excel" was labelled with the ESCO skill "demand excellence from performers", because the label was chosen by text similarity alone.

`escoTopMatch` in `src/lib/esco.ts` is now strict (0.75): it accepts near-exact labels only, so "Excel", "React" and "data pipelines" get no label instead of a wrong one, and correct but looser matches ("order picking" for "pick orders for dispatching") are lost. Prompt C brings those back.

## Build

1. **Prompt C, as the spec's section C describes, in one call per card.** After synthesis (step 7 of "Code after A") and in the re-render job after an edit: for each signal take up to 6 candidates from `escoCandidates(db, phrase, { type: "skill", limit: 6 })`, keeping those with similarity 0.3 or more; signals with no candidate get no label and are left out of the call. `chatJson` with `EscoPickOutput` from `@/contracts`, role `analyst`, purpose `card.esco_pick`, temperature 0, `maxTokens: 400`, `deadlineMs: 15000`. Map each choice to `{ uri, labelEn, labelFi }`; choice 0, a number outside the list or a missing item means no label. When the call fails or is late, fall back to `escoTopMatch` for each signal. No call at all when no signal has candidates.
2. **A word-list hit must not delete evidence.** In step 2 of "Code after A": when only the rendering of a signal hits the card lexicon, keep the signal and replace the rendering with the code-built sentence. When the phrase hits, use the phrase of a live signal listed in `from` that is clean (the longest one), with the code-built rendering; drop the signal only when no clean phrase exists. `card.protected_dropped` is audited only for a signal that is really dropped; add a count `salvaged` to the `card.synthesised` detail. The person's own sentences are never checked or changed here: this is about the model's wording.
3. **A rewrite never changes an approved card** (`docs/LEAD-DECISIONS.md`, 14 Nov 01:30). Today a rewrite that finishes after approval is written into the approved card, so companies read text the person never saw. Change the re-render job: when the card it belongs to is approved by the time the result arrives, put the result into a new draft (the next version, copied from the approved card with the rewrite applied) and leave the approved card and the `signal` rows alone. The card page then shows the draft with a plain line saying that the edit has been reworded for companies and needs a look. A signal with no previous text stays out of the company view until the person approves that draft. The prompt C pick for the rewritten signal follows the same path.
4. Tests with `setLlmFake`: a rewrite that lands after approval leaves `cardForCompany` and `cardForOrganiser` exactly as approved and creates a draft with the new text; approving that draft publishes it; plus the cases below.
5. More tests with `setLlmFake`: the pick mapping, choice 0, an out-of-range choice, a missing item, a failed call falling back to `escoTopMatch`; "React" with the candidate "react to mining emergencies" and a pick of 0 ends with no label; a signal whose rendering says "diagnosed" keeps its phrase and evidence with the code-built sentence; a signal whose phrase is not clean takes the clean phrase of its source signal; nothing protected reaches `cardForCompany` or `cardForOrganiser` in any of these cases.

## Watch out for

- The pick is about meaning, not about the person. The prompt gets phrases and candidate labels only: no transcript, no handle.
- One call per card. Never one call per signal.
