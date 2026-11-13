# Prompt: picks-draft (need to person reasons)

Role: `analyst`. Purpose tag: `picks.reasons`. One call per pick. JSON mode, Zod, one repair retry. Temperature 0.2. The same reasons are shown to the organiser and, after approval, to the company (`matching.md` 3.5). The reader is an employer, so the text describes the card in the third person, without a name or pronouns that imply gender.

The model does not choose who is picked: selection is done by code before this call (`matching.md` 3.3). The model only words reasons from pairs code has already computed. It sees no transcript, no name, no handle, no interview language, no input mode.

## System message (verbatim)

```
You explain to an employer why one anonymous card from a talent pool relates to their need. You write JSON only.

Rules:
1. Write plain English. Short sentences. Refer to the person only as "the card" or "this person". Never use he, she, him or her.
2. You may ONLY use the pairs listed under "Allowed pairs". Each reason uses one pair: one requirement id (like "R3") and one signal id (like "S2").
3. Write 2 or 3 reasons if at least 2 pairs exist, otherwise 1. Each reason is one sentence, at most 160 characters, in this shape:
   "The card describes <what the signal says>, which relates to <the requirement>."
4. Describe, never judge. Do not praise, grade or compare the person. Never use: strong, excellent, great, impressive, perfect, ideal, expert, talented, skilled, qualified, senior, junior, fit, match, best, top, highly, recommend, score, percent.
5. Do not say whether the person meets the requirement in full. Do not mention years, levels or fluency unless the signal text says them.
6. Do not mention anything that is not in the signal text. Do not guess age, background, nationality or language.
7. Prefer pairs that cover different requirements, and must-have requirements before nice-to-have ones.
```

## User message template

```
Need: {{needCard.title}}
{{needCard.summary}}

Requirements:
{{for r in needCard.requirements}}{{r.id}} ({{r.kind}}): {{r.text}}
{{end}}

Card signals (English renderings):
{{for s in touchingSignals}}{{s.id}}: {{s.phrase}}. {{s.rendering}}
{{end}}

Allowed pairs (requirement, signal):
{{for pair in allowedPairs}}{{pair.req}}, {{pair.signal}}
{{end}}

Return JSON: {"reasons": [{"req": "R1", "signal": "S1", "text": "..."}]}
```

- `R` ids are positions in the Need Card version the pick was drafted against; code maps them back to requirement ids.
- `touchingSignals` contains only signals that appear in an allowed pair. `S` ids are local to this call.
- `allowedPairs` = every `(r, s)` with `r ∈ touchedRequirementIds` and signal `s` the one that made `touches(p, r)` true (`matching.md` 3.1), excluding `language` pairs that rest on a self-declared work language only (those are not evidence and are shown in the requirement chip instead: "named Finnish as a work language").

## Output schema

```json
{ "reasons": [ { "req": "R1", "signal": "S1", "text": "string <= 160" } ] }
```

Zod: length 1 to 3; `req` `/^R\d+$/`; `signal` `/^S\d+$/`.

## Code checks after parsing

1. Drop a reason whose pair is not allowed.
2. Drop a reason matching `/\b(he|she|him|her|his|hers|strong|excellent|great|impressive|perfect|ideal|expert|talented|skilled|qualified|senior|junior|fit|match(es|ed)?|best|top|highly|recommend(ed)?|score|percent)\b|%|\d+\s*\/\s*\d+/i`.
3. Dedupe by requirement.
4. If none survive: code-rendered reasons, one per allowed pair up to 3: "The card describes {signal.phrase}, which relates to {requirement.text}."
5. Store `{text, requirementId, signalId, evidence: signal.evidence[0], postingSentence: requirement.postingSentence}`.
6. `notMentioned` = requirement ids of the Need Card version not in `touchedRequirementIds`, computed by code.

## Example

Input:

```
Need: Data engineer
Builds and runs data pipelines that feed forecasting models. The team works in English.

Requirements:
R1 (must): Python programming
R2 (must): SQL and relational databases
R3 (must): 4 years of data engineering
R4 (must): Fluent Finnish
R5 (must): Communication skills
R6 (nice): Apache Airflow
R7 (nice): Energy sector knowledge

Card signals (English renderings):
S1: Python data pipelines. Built pipelines in Python that load sensor data into a database every night (English rendering).
S2: SQL. Wrote SQL queries to check data quality and build reports (English rendering).
S3: Explaining data to non-specialists. Presented weekly data summaries to the operations team (English rendering).

Allowed pairs (requirement, signal):
R1, S1
R3, S1
R2, S2
R5, S3
```

Output:

```json
{"reasons": [
  {"req": "R1", "signal": "S1", "text": "The card describes building nightly Python pipelines that load sensor data, which relates to Python programming."},
  {"req": "R2", "signal": "S2", "text": "The card describes writing SQL queries for data-quality checks and reports, which relates to SQL and relational databases."},
  {"req": "R5", "signal": "S3", "text": "The card describes presenting weekly data summaries to an operations team, which relates to communication skills."}
]}
```

Rendered "not mentioned" (code): "Not mentioned in the conversation: Fluent Finnish · Apache Airflow · Energy sector knowledge". R3 is touched (the work is described; years are not assessed), so it is not listed.

## Bad outputs the checks must catch

| Output text | Dropped by |
|---|---|
| "She has strong Python experience." | pronoun and forbidden word |
| "This person is a great fit for the team." | forbidden words; also no allowed pair cited |
| "The card describes 6 years of Python, which relates to R3." when S1 says nothing about years | not caught by regex; caught by the eval set (`evals/picks-reasons`, S4): human-labelled fixtures, target 0 unsupported claims in 20 |
