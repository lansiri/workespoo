# Prompt patches from the live-model lab

Evidence from `evals/prompt-lab/` (2026-11-13, `kimi-k3-1-pro` on Verda). Each finding below was re-run by an independent verifier; only changes the verifier recommended are in the first section. Settings and latency are in `docs/llm-capabilities.md`.

## Open blockers

1. **Shared-key rate limit (no fix verified).** 40 requests per minute for the whole key. Every prompt lost runs to HTTP 429, and retries stall calls for 20 to 48 s. Lowering concurrency and a 2 s fail-fast were tested and did not help. Remedy is operational and untested: a key used only by the demo, no lab or batch traffic during it, Need Cards and picks computed in advance.
2. **Live interviewer planning leak.** Closed only when the revised guard (patch IL-1) is implemented in code. The prompt line alone still leaks (1 of 17, plus 1 of 3 on a regression case). The guard was checked only by offline replay of 97 recorded outputs.
3. **Need Card drafting** is broken as specified (truncation and schema failures). Patches NC-1 and NC-2 fix it in testing; until they are applied, treat it as a blocker.

Patches were each tested on their own. Where two patches touch the same line or interact, that is noted; the combination is untested.

---

## Verified changes

### Live interviewer (`interviewer-live.md`, `interview.md`) — S1a, interview engine

**IL-1. Planning leak: buffer until the question, plus a prompt line.** Verdict: apply_modified (guard is the fix, prompt line supports it).

- `docs/specs/interview.md`, section 7, replace step 4:
  > 4. Emit sentences until the first sentence ending in `?`, then abort the stream. Emit at most 2 sentences and 40 words.

  with:
  > 4. Buffer completed sentences and emit nothing until a sentence ending in `?` arrives; then emit the buffered sentences up to and including that one and abort the stream. Emit at most 2 sentences and 40 words. If 40 words arrive without a `?`, discard the buffer, abort the stream and emit the fallback question (step 5).
- `docs/specs/prompts/interviewer-live.md`, User message, replace `Write your next reply now.` with:
  > Write only your next reply, exactly as the person will hear it. No planning or notes.
- Evidence: leak in 6 of 18 baseline runs (en-people 3/5); prompt line alone 1 of 17, and 1 of 3 on a regression case; guard replayed on 97 recorded outputs lets 0 of 16 leaks through and changes none of 81 valid replies (longest valid reply before its `?` is 29 words, shortest leak 46). Costs about 0.3 to 0.5 s before the first spoken word.

**IL-2. Bound the live call at 6 s, including 429 backoff; keep the key clear.** Verdict: apply_modified (the proposed 2 s fail-fast did not help).

- Operations during the demo: nothing else runs on the key the live role uses (stop all `npm run lab` runners and batch jobs). If a second key exists, give `LLM_LIVE` its own provider entry.
- Code, live reply caller in `src/features/interview`:
  ```ts
  const ac = new AbortController();
  const deadline = setTimeout(() => ac.abort(), 6000); // clear on first token
  const stream = chatStream({ role: "live", ..., signal: ac.signal });
  // on abort, or error with no emitted question: emit the target's fallback question (interview.md 7 step 5)
  ```
  Aborting already cancels the backoff sleep in `src/lib/llm/core.ts`; no change there.
- Evidence: 12 of 25 original runs broke the 6 s rule (6 hard 429 failures, 6 first tokens at 22 to 38 s). 2 s fail-fast: 10/10 fine under light load, 10/10 fallbacks under load, and would also cut healthy 2.6 to 3.6 s replies. The 6 s bound itself was not run; this only enforces the existing spec rule. It does not lower the fallback rate under load: see open blocker 1.

### Turn extractor (`turn-extractor.md`) — S1a, interview engine

**TE-1. Only the latest turn is new.** Verdict: apply.

- System prompt, rule 1: after `Never guess or add facts.` add the line:
  > `   Only the latest turn (the highest T number) is new. The earlier turn is context: never return a signal that cites only earlier sentences, and base coverage and flags on the latest turn only.`
- Merge rules (code), replace rule 2 `2. Drop a signal with no resolving refs.` with:
  > 2. Drop a signal with no resolving refs, or with no resolved ref in the current turn (turnIndex equal to the current participant turn).
- Evidence: stale signals or wrong coverage on empty answers in 14 of 14 runs; 0 of 10 with the prompt line; known-id reuse kept in 2 of 2 regression runs. The code guard was not run against the model (deterministic).
- Interaction: in sv-04-distress the false `wants_stop` rose from 3/5 to 5/5 with this line. Apply TE-3 together with it (combination untested).

**TE-2. Phrases always in English.** Verdict: apply.

- System prompt, rule 2, replace `"phrase": English, 2 to 6 words,` with:
  > `"phrase": always English (translate Finnish or Swedish), 2 to 6 words,`

  Rest of the line (from `what they can do or know`) unchanged.
- Evidence: fi-03-protected Finnish phrases and note in 3 of 4; 0 of 4 after (note also became English); 0 regressions in 6 en/sv runs.

**TE-3. `wants_stop` means the whole interview.** Verdict: apply.

- System prompt, rule 9: after `Empty list if none.` append:
  > ` "wants_stop" only when they ask to end the whole interview, not to skip one topic.`
- Evidence: "Jag vill helst inte prata om chefen" flagged `wants_stop` in 4 of 4 (trial said 1 of 3); 0 of 5 after; real stop requests en/fi still flagged 4 of 4.

### Card synthesis, prompt A (`card-synthesis.md`) — S1b, Signal Card

**CS-1. No "diagnosed" for work tasks.** Verdict: apply.

- Prompt A only, replace `R8. No protected information (see NEVER).` with:
  > `R8. No protected information (see NEVER). No health words for work tasks: write "found the cause of", not "diagnosed".`
- Evidence: en-full-software's debugging signal dropped by the `diagnos*` lexicon hit in 6 of 6 valid runs; 0 of 5 after; 0 regressions in 6 runs. Prompt B's R8 is worded differently and was not changed or tested.

**CS-2. Traits and preferences are not signals.** Verdict: apply.

- Prompt A, replace `6. At most {{maxSignals}} signals. Prefer things the person described doing over things only named.` with:
  > `6. At most {{maxSignals}} signals. Prefer things the person described doing over things only named. Personality traits and work preferences ("team player", "I like working alone") are not signals. A skill the person only names, with nothing they did, gets the rendering "They list <phrase> as a skill."`
- R4: append ` Never write "strength".` (see the combined R4 text under CR-2; R1 to R8 must stay identical in A, B and `signal-card.md` section 5).
- Evidence: sv-exp-noroles preference kept 2 of 5, then 0 of 5; en-exp-buzzwords trait or personality signals 5 of 5, then 0 of 5, all schema-valid. "key strength" itself reproduced only 1 of 5. Cosmetic: "They list Communication as a skill." keeps the capital (4 of 5). Prompt B with the R4 line not tested.

### Card re-render B and ESCO pick C (`card-synthesis.md`, `signal-card.md`) — S1b, Signal Card

**CR-1. Translation work can be described.** Verdict: apply.

- Replace R7 in three places (prompt A rules, prompt B system prompt in `card-synthesis.md`, and rule 7 of `signal-card.md` section 5). Old:
  > `R7. Never mention the interview, speaking, typing, translation, accent or language.`

  New:
  > `R7. Never mention the interview or how the person spoke or typed: no speaking, typing, accent or interview language. If their work was translating or interpreting, say so, and write "between two languages" instead of naming the languages.`

  (In `signal-card.md` keep its numbering: `7. Never mention ...`.)
- Evidence: b-en-09 named the languages in 4 of 4 (under old R6/R7 no compliant output keeps the skill); 0 of 5 after; 0 regressions attributable in 8 runs. Prompt A with the new R7 not tested. Also update the lab checker's `translat*` pattern.
- Left open for the lead: "Finnish" is not in `lexicon.ts`, so a language name can still slip through, and the code fallback "They list Arabic translation as a skill." names the language.

**CR-2. No performance claims; phrases read as activities.** Verdict: apply_modified (R4 alone left job titles in 1 of 3).

- Prompt B, replace `If it is already English, return it unchanged except for removing quality words.` with:
  > `If it is already English, return it unchanged except for removing quality words. Skills read as activities ("Driving forklifts"), not job titles.`
- R4 in prompt A, prompt B and `signal-card.md` section 5 rule 4. Combined with CS-2, the new text is:
  > `R4. No praise, levels, years, durations, or comparisons, and no claims about how well they did it (such as "without accidents" or "always on time"). Never write "strength".`

  In `signal-card.md`: `4. No praise, levels, years, durations or comparisons, and no claims about how well they did it (such as "without accidents" or "always on time"). Never write "strength".`
- Evidence: "without accidents" 5 of 5 and job-title phrases in 6 of 8, then 0 of 5 and 0 of 14 with both lines; 0 regressions in 5 runs. The combined R4 (CR-2 plus CS-2) was not run as one text.

### Need Card draft (`need-card-draft.md`) — S2, Need Cards

**NC-1. List every requirement key.** Verdict: apply.

- System message (verbatim block), new line after rule 13:
  > `14. Every requirement has all of these keys: text, kind, category, sentence, esco, language, years, statutory, questionType, question, why. Use null for language, years, question and why when they do not apply.`
- Evidence: final schema failures 2 of 7 (first attempts 4 of 7, missing `language`, repaired to `""`); 0 of 10 after; 0 regressions in 6 runs. Trial's "about half the cards" overstated it.
- Optional safeguard (offline only): a `coerce` that nulls `language` unless `/^[a-z]{2}$/` and `years` unless an integer would have saved 7 of 7 original first attempts.

**NC-2. Set max tokens to 4000.** Verdict: apply.

- `need-card-draft.md` line 3, replace `validate with Zod, one repair retry. Temperature 0.2.` with:
  > `validate with Zod, one repair retry. Temperature 0.2. Max tokens 4000 (reasoning counts toward it; the gateway default of 800 truncates the card).`
- Code (when `draftNeedCard` is written): `chatJson({ role: 'analyst', purpose: 'needcard.draft', schema: NeedCardDraftOutput, temperature: 0.2, maxTokens: 4000, messages })`.
- Evidence: truncated mid-JSON in 8 of 8 runs that got a reply at 800; 0 of 9 at 4000. fi-cards-tiler then failed on `language`, which NC-1 fixes. Regression runs skipped (budget). Single attempts stay under the 30 s analyst timeout (max 21.3 s).

### Match reasons (`match-reasons.md`) — S3a, matching

**MR-1. Ask for 130 characters, keep Zod at 160.** Verdict: apply.

- System message, replace `3. Write 1 to 3 reasons. Each reason is one sentence, at most 160 characters, in this shape:` with:
  > `3. Write 1 to 3 reasons. Each reason is one sentence, at most 130 characters, in this shape:`

  Leave `MatchReasonsOutput` text `.max(160)` in `src/contracts/matching.ts` unchanged.
- Evidence: 5 of 14 first attempts over 160 (sv-care-12 5/5), then 0 of 12, longest 134; no rule broken in 6 regression runs. Small loss of detail (one run gave 2 reasons instead of 3).

**MR-2. Say how the posting puts it.** Verdict: apply.

- System message rule 3, replace the shape line `"Your card mentions <what the signal says>; the posting asks for <what the sentence asks>."` with:
  > `"Your card mentions <what the signal says>; the posting <asks for | lists as a plus | lists> <what the sentence says>."`
  > `Use 'lists as a plus' when the sentence says it is an advantage. For a null sentence use 'the posting lists'.`
- Evidence: nice-to-have or null-sentence pair written as "asks for" in 7 of 7; 0 of 6 after; no rule broken in 5 regression runs. Some required items now say "lists" (weaker, not false). Matches the code fallback wording in `matching.md` 2.3. MR-1 and MR-2 both edit rule 3; not run together.

### Picks reasons (`picks-draft.md`) — S3b, picks

No verified changes. All three findings were rejected (below).

---

## Reported but not confirmed

| Finding | Prompt / stream | Verifier result | Verdict |
|---|---|---|---|
| interviewer-live-F2: after distress, skipped the topic and asked the target | interviewer-live, S1a | 0 of 12 valid runs (1 of 10 overall). Proposed wording adds "or carry on", which changes the spec. | do_not_apply |
| synth-F3: synthesis latency and timeouts; raise timeout to 45 s, tokens to 2400 | card-synthesis, S1b | 1 of 25 failed (a 429), 0 timeouts, max single attempt 19 s. Timeout does not help with 429s. Watch item: tokens reached 93% of 1800. | not_a_real_problem |
| render-B1b: employer and city kept in an English phrase | card-render B, S1b | 0 of 5 (1 of 8 overall). Prompt B tells the model to pass English phrases through, so it followed the spec. Whether phrases must be cleaned is a lead decision. | do_not_apply |
| needcard-F3: cards exceed the 30 s timeout; set 60 s | need-card-draft, S2 | 0 of 36 timed out; max single attempt 21.3 s. Long totals were 429 waits plus repair retries summed. | not_a_real_problem |
| match-reasons-F2: lower feed concurrency 4 to 2 | match-reasons, S3a | 429s reproduced (3 of 30), but the limit is per minute per key, so lower concurrency only slows the feed. | do_not_apply |
| picks-draft-F1: concurrency 2 and a 5 s 429 cap | picks-draft, S3b | Reproduced (3 of 10), but concurrency 1 was no better, and a 5 s cap would turn late-but-correct reasons into fallbacks. | do_not_apply |
| picks-draft-F2: numbers from the signal repeated in reasons | picks-draft, S3b | Happens 5 of 5, but the spec allows it ("about 80 guests" is the person's own evidence). Fix removed relevant evidence. | not_a_real_problem |
| picks-draft-F3: "ahead of schedule" kept | picks-draft, S3b | 1 of 10 (2 of 17 overall). Input violated card-synthesis R4 on purpose; act upstream (CR-2). | do_not_apply |

Untested ideas raised by verifiers (not recommendations):
- Pace Verda requests in `src/lib/llm/core.ts` the way NVIDIA is paced (for example `VERDA_MAX_RPM`, default 36), and raise `MAX_RETRY_AFTER_MS` to 60 s for background roles: the 20 s cap retries inside the same exhausted window (match-reasons-F2).
- A narrower interviewer rule 9 without "carry on" (interviewer-live-F2).
- A code check on returned phrases against employer and place names, with one regeneration (render-B1b).

## Not verified

Reported by the trials, beyond the three findings per prompt that were verified. Rates are the trial's own, mostly 1 to 3 runs.

| Finding | Prompt / stream | Severity | Summary | Proposed change (untested unless stated) |
|---|---|---|---|---|
| interviewer-live-F4 | interviewer-live, S1a | minor | Skip offer comes after the question, so the guard cuts it (3/3). | Probe target and distress_seen: "Instead of an acknowledgement, start with a few words saying they can skip it, then ask." Earlier wording placed it first 3/3 but ran to 3 sentences 1/3. |
| interviewer-live-F5 | interviewer-live, S1a | minor | FACTS line contains "score", so the guard drops the model's answer (2/3). | Replace `- Nobody gets a score or a ranking. You do not rate answers.` with `- You do not rate, compare or rank people or answers.` (0/2 in trial). |
| extractor-F4 | turn-extractor, S1a | minor | Off-topic answer still marks areas `thin`; Finnish question to AI flagged `short` (2/3). | Rule 8: "If the answer has no work content ..., return \"coverage\": {}." |
| extractor-F5 | turn-extractor, S1a | minor | One-word phrases (12/55); spec examples contradict the 2-word minimum; "Wolt" as a tool. | Rule 2: "1 to 6 words (a tool or software name alone is fine; never a company or employer name)". Conflicts with TE-2's edit of the same text. |
| extractor-F6 | turn-extractor, S1a | minor | 429 retries 22 to 42 s against the 8 s spec timeout. | Pass `timeoutMs: 8000` on the extractor call; see open blocker 1. |
| synth-F4 | card-synthesis, S1b | minor | "junior" copied into a rendering (verifier F1 also saw it 3/3). | Run `findBannedEvaluative` on renderings; regenerate with prompt B on a hit. |
| synth-F5 | card-synthesis, S1b | minor | A wish to study returned as a role (1/3). | Task 5: "Studies, courses and shift preferences are not roles." |
| render-B2 | card-render B, S1b | minor | Fixed "They list ... as a skill." sentence not reproduced exactly (2/3). | Code writes that sentence for items with no evidence. |
| gateway-429 | card-render B, S1b | minor | 429s on analyst calls; approve could hang 19 to 34 s. | Fallback role for analyst; approve falls back to code text after a bounded wait. |
| needcard-F4 | need-card-draft, S2 | major | "native-level Finnish", "in Finland" copied into requirement text (2/2). | Rule 12: "\"Native speaker\", \"mother tongue\" and \"experience in Finland\" count as nationality: never write them in \"text\"; name the language level or the work instead." |
| needcard-F5 | need-card-draft, S2 | major | Reversed language question on an English posting's English requirement (1/1). | Rule 9 language bullet: "Never for English when the posting is written in English." |
| needcard-F6 | need-card-draft, S2 | major | Statutory missed for 7 of 14 law items; a public employer's Finnish got a question. | Implement the 4.3 keyword override as OR with the model; null the question when statutory. |
| needcard-F7 | need-card-draft, S2 | minor | At the 12 cap, must-haves dropped for nice-to-haves (1/1). | Rule 4: "At most 12. If there are more, keep every \"must\" first, then \"nice\" in posting order." |
| needcard-F8 | need-card-draft, S2 | minor | `vague` question type on skills (4/39). | Ensure the 7.4 trigger check is implemented. |
| needcard-F9 | need-card-draft, S2 | minor | Protected lints flag "English", "Swedish", "Norway", "health centre" in Need Card text. | Exempt language names and places; `health` lint ignores "health care/centre/sector/services". |
| match-reasons-F4 | match-reasons, S3a | minor | Word-collision pairs force a nonsensical reason (4/4). | Build pairs only from Need Card touches or a shared ESCO URI; or allow an empty reasons list. |

Side observations by verifiers, not filed as findings:
- Picks: 5 of 10 runs needed a schema repair; four reasons sat at exactly 160 characters. An MR-1-style 130-character instruction probably applies (untested).
- Interviewer: the spec has no Swedish entry in `replyLanguageRule`, and `interview.md` 7 step 5 sends an English fallback to Swedish speakers although Swedish fallbacks exist in `interview-lines.ts`.
- Card synthesis: express buzzword cases fed drafts that the extractor would not produce; a `(none)`-drafts case is built but not run.
- Need Cards: ingestion left 3 recruiter names in fixture posting sentences and an `&nbsp;` sentence.
