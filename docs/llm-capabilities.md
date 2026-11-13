# LLM capabilities

Measured 2026-11-13 against the real model in `evals/prompt-lab/`. Raw results are in each item's folder there; the changes they lead to are in `docs/specs/prompts/PATCHES.md`.

## Open blockers for the live demo

1. **Rate limit on the shared key (not solved).** The provider allows 40 requests per minute for the whole key, shared by every role, process and person using it. When it runs out, the gateway waits out `Retry-After` (up to 20 s, 2 retries), so a call that normally takes 1 to 5 s takes 20 to 48 s or fails. This hit every prompt in every lab run. No settings change tested here removes it: lowering our own concurrency did not help (picks: 3 of 10 failed at concurrency 2, 1 of 5 at concurrency 1), and a 2 s fail-fast on the live role turned 10 of 10 replies into the fallback question under load. The only remedy is operational and untested: a key that nothing else uses during the demo, no lab or batch jobs during the demo, and Need Cards and picks computed beforehand.
2. **The live interviewer leaks its planning into the spoken reply (fixed only once the guard code exists).** With `reasoning_effort: "none"`, about 1 in 6 replies is English meta-text ("I need respond as interviewer per instructions...") instead of a question, Swedish sessions included. The guard as written in `interview.md` section 7 would speak two of those sentences before the fallback. A prompt line cuts the rate (6/18 to 1/17) but does not remove it; the revised guard in PATCHES.md stops it in an offline replay of all 97 recorded outputs. That guard is not yet implemented or tested in code.
3. **Need Card drafting fails without two patches.** At the gateway default of 800 tokens every card is cut off mid-JSON, and without a key list in the prompt about 2 in 7 cards fail the schema. Both patches are verified (PATCHES.md).

## Model and endpoint

| | |
|---|---|
| Model | `kimi-k3-1-pro`, the only model available |
| Endpoint | Verda, `https://inference.verda.com/v1`, OpenAI-compatible, hosted in Finland |
| Roles | `live`, `analyst` and `bulk` all use it |
| Provider limits (response headers) | 40 requests and 3,000,000 tokens per window of about 60 s, per key. The token limit was never close; the request limit was the one hit. |
| Reasoning | Hidden reasoning comes in a separate `reasoning_content` field, which the gateway drops. It still counts toward `max_tokens`. |

## Recommended settings

```
LLM_LIVE=verda:kimi-k3-1-pro
LLM_ANALYST=verda:kimi-k3-1-pro
LLM_BULK=verda:kimi-k3-1-pro
LLM_EXTRA_BODY_LIVE={"reasoning_effort":"none"}
LLM_EXTRA_BODY_ANALYST={"reasoning_effort":"low"}
LLM_EXTRA_BODY_BULK={"reasoning_effort":"low"}
LLM_MAX_CONCURRENCY=8
# LLM_JSON_MODE: leave unset (json_object) for the demo; see "JSON modes"
```

| Role | Setting | Why |
|---|---|---|
| `live` | `reasoning_effort: "none"` | First word at 0.64 s p50, against 2.4 s for `low`. With the default (unset), 18 of 20 replies came back empty because hidden reasoning used the whole 300-token budget. Cost: slightly more praise in replies ("That's great hands-on experience!") and the planning leak above. `low` mirrors the person's words better but adds about 1.7 s. |
| `analyst`, `bulk` | `reasoning_effort: "low"` | All JSON prompts were tested with this. |
| all | never leave `reasoning_effort` unset | Default reasoning silently eats a small `max_tokens` and returns empty text that the gateway reports as success. |
| per call | explicit `maxTokens` | Need Card drafting needs 4000 (the default 800 truncates every card). |
| gateway | `LLM_MAX_CONCURRENCY=8` or lower | Keep total traffic well under 40 requests a minute on the key. |

Before the demo, make one cheap warm-up call: the first burst after an idle gap got 429s in both concurrency runs, and we could not tell why.

## Latency per role

Times exclude calls that hit a 429 unless the row says otherwise. JSON calls are not streamed, so they have no time to first word.

| Role / prompt | Mode | Time to first word | Total | Notes |
|---|---|---|---|---|
| live, interviewer (reasoning none) | stream, 300 tokens | p50 0.64 s, p90 1.65 s | p50 1.5 s, p90 2.6 s | Probe, 20 calls. One 8.2 s outlier. |
| live, interviewer (reasoning none) | stream, 90 tokens | p50 0.61 s, p90 1.14 s (51 calls without retry) | p50 1.3 s; p90 13.3 s with 429 retries | Trial. Spec target: first sentence under 1.2 s at p50. |
| live, interviewer (reasoning low) | stream, 300 tokens | p50 2.4 s, p90 2.8 s | p50 3.1 s, p90 3.8 s | Probe, 20 calls. |
| live, interviewer (default reasoning) | stream, 300 tokens | only 2 of 20 had text (3.0 and 3.4 s) | p50 6.4 s, p90 26.8 s | Do not use. |
| live, turn extractor | JSON | n/a | p50 2.3 s, p90 3.4 s, max 4.4 s | Inside the 8 s spec timeout. |
| live, ESCO pick (card prompt C) | JSON-shaped text | n/a | p50 1.4 s | |
| analyst, card synthesis A | JSON | n/a | express 4 to 10 s, full 12 to 19 s (median 7.8 s); a few full cards 27.7 s | Spec timeout 30 s. Full cards used up to 1668 of 1800 tokens. |
| analyst, card re-render B | JSON-shaped text | n/a | 2.4 to 5 s | |
| analyst, Need Card draft | JSON, 4000 tokens | n/a | 10.7 to 21.3 s per attempt (p50 17.5 s, p90 20 s); 2x when the repair retry runs | |
| analyst, match reasons | JSON | n/a | about 3.4 s median | |
| analyst, picks reasons | JSON | n/a | 3.3 to 5.3 s; 7.5 to 26 s when the repair retry runs | |
| any role, after a 429 | | 20 to 42 s | 20 to 48 s, or failure after 3 attempts | Gateway honours Retry-After up to 20 s, 2 retries. |

## Concurrency

Measured through `chatStream`, role live, reasoning none, 60 tokens, with `LLM_MAX_CONCURRENCY` raised to 32 so the gateway's own queue did not hide the provider.

| In flight | Run A (5 s apart) | Run B (65 s apart) |
|---|---|---|
| 4 | 2 of 4 got 429; the rest first word at 42 s | 4 of 4 ok, but 3 retried after a 429; first word p50 32.6 s |
| 8 | 8 of 8 ok, first word p50 1.1 s, p90 1.4 s | 8 of 8 ok, p50 0.8 s, p90 0.9 s |
| 16 | 0 of 16 (all 429) | 16 of 16 ok, p50 2.6 s, p90 3.4 s |

What this means: with the request window clear, 8 at once is fine and 16 at once costs about 3x the first-word time. Whether a call succeeds depends on how many requests the whole key has made in the last minute, not on how many we have in flight. Other lab runners were using the key during all of these runs, so the demo may see fewer 429s, but nothing measured here shows it. Note the gateway timer includes the wait for its own semaphore (default 8).

Other faults seen: one 68 s timeout, a few "network error" failures, and one 8.2 s first-word outlier.

## JSON modes

| Schema | `json_object` | `json_schema` |
|---|---|---|
| ExtractorOutput | valid (after infrastructure retries) | valid, 3.4 s |
| SynthOutput | valid, 3.4 s | valid, 6.2 s |
| NeedCardDraftOutput | valid (after 429s) | valid, 4.9 s |
| MatchReasonsOutput | valid (after 429s) | valid, 10.8 s (one retry) |
| PicksDraftOutput | valid, 1.8 s | valid, 1.7 s |

All five contract schemas convert with `z.toJSONSchema` and the provider accepted `response_format` every time (no HTTP 400). One sample per cell, so latency differences are not meaningful. **All seven prompt trials ran with `json_object`** (`LLM_JSON_MODE` unset), so every validity number below is for `json_object`. `json_schema` might also prevent the missing-key failures in Need Cards, but that is untested; switching modes for the demo would need a re-run first.

## How the seven prompts performed

"Validity" is the trial's own strict measure (schema plus its hard checks); the column next to it says what failed.

| Prompt (stream) | Validity | Languages | What works | Main problems |
|---|---|---|---|---|
| Live interviewer (S1a) | 0.67 (0.72 of replies with text) | en, fi, sv | Right language every time, including switches and Swedish. Protected facts never repeated (3/3). Injection ignored (2/2). Stop paraphrases gave `[[STOP]]` (3/3). | Planning leak (blocker 2). 429 stalls past the 6 s timeout in 12 of 25 runs under shared load. |
| Turn extractor (S1a) | 0.34 strict; 55 of 55 schema-valid | en, fi, sv | Injection and protected facts flagged every time and never extracted. Known ids reused. No quality words in phrases. | Re-extracts from the earlier turn on empty answers (14/14). Finnish phrases kept in Finnish (3/4). Topic-skip flagged as `wants_stop` (4/4). All three fixed. |
| Card synthesis A (S1b) | 0.66; all failures were 429 or timeout | en, fi, sv input, English card | Protected facts kept out in 9 of 9; injection ignored 3/3; merges and empty roles correct; card always English. | "diagnosed" in a work story hits the protected lexicon and drops the signal (6/6). Trait-only signals for buzzword answers. Both fixed. |
| Card re-render B and ESCO pick C (S1b) | 0.85 | en, fi, sv input | C: valid 14/14, agreed with the expected pick 13/14, never forced a match. B: one sentence, third person, English, years and quality words removed, injection ignored. | Translation work cannot be described under R6/R7 (4/4). "without accidents" and job titles (5/5). Both fixed. |
| Need Card draft (S2) | 0.46 | fi, en postings; sv only as a required language | ESCO ids never invented; statutory items called law; age-18 sentence dropped; question patterns exact. | Truncated at 800 tokens (8/8 with a reply). Missing `language`/`years` keys (2 of 7 cards fail). Both fixed. Statutory flags missed half the time (code override needed, not verified). |
| Match reasons (S3a) | 0.76 | fi, en, sv postings; English output | No disallowed pairs, no banned words, no grading; trap words dropped; Finnish and Swedish described accurately. | Reasons 1 to 4 characters over 160 force a repair (sv-care 5/5). Nice-to-haves described as "asks for". Both fixed. |
| Picks reasons (S3b) | 0.89; all 34 completed outputs valid | en, fi, sv | Every hard check passed in 75 of 75 reasons; judgement words in inputs dropped; consistent across identical inputs. | No confirmed prompt defect. Many reasons land exactly at 160 characters, which seems to trigger repair retries (seen, not verified). |

## Not yet tested

- The revised live guard in real code (only replayed offline on recorded outputs), and voice transcripts without punctuation through it.
- A dedicated key or rate budget for the live role, and any 429 behaviour without other lab runners on the key.
- `json_schema` mode for the prompt trials.
- Several fixes together: each verified patch was tested on its own. Shared rule changes (R4, R7 in card synthesis) and the extractor's rule 1 plus rule 9 were not run combined.
- Prompt A with the new R7; prompt B with the new R4 "strength" line; an interpreting case.
- Interviewer: CV-seed and reask targets, the `skipped` situation, the distress wording change.
- Extractor: Swedish injection and off-topic, merge-step dedupe and ESCO grounding.
- Need Cards: Swedish-language postings, work-permit requirements, stability over repeats (most cases ran once), the 12-cap ordering fix.
- Matching: the 12-call feed burst; picks: language pairs that rest only on a self-declared language.
- Code post-processing that several prompts rely on (statutory override, lexicon checks on renderings, fallback sentences): the code is not built yet.
- The prompt-lab runner counts an empty text reply as ok and computes first-word percentiles from replies with text only. This hid 18 of 20 empty replies in the default-reasoning probe; read its summaries with that in mind.
- The probe that generates this file uses `max_tokens` 120 with default reasoning, so its first table reported "no text"; that run is replaced by the numbers above.

## Operations note

A Verda API key was pasted in plain text into a chat session during this work. It was not used or copied by the lab agents, but it should be treated as exposed and rotated.
