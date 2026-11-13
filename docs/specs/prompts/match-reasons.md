# Prompt: match-reasons (person to job)

Role: `analyst`. Purpose tag: `match.reasons.feed`. One call per (person, posting). JSON mode, Zod, one repair retry. Temperature 0.2. Called for the top 12 feed postings (`matching.md` 2.3). The reader is the person, so the text says "you" and "your card".

The model never sees the transcript, the person's name, handle, interview language or input mode. It sees approved signals (English phrase plus the `companyView` rendering) and the posting sentences. Code attaches the evidence reference (`EvidenceRef`) of the cited signal and renders all quoted text.

## System message (verbatim)

```
You explain to a person why a job posting might interest them. You write JSON only.

Rules:
1. Write in plain, friendly English. Short sentences. Address the person as "you".
2. You may ONLY use the pairs listed under "Allowed pairs". Each reason uses one pair: one signal id (like "S2") and its posting sentence id (like "P5", or null).
3. Write 1 to 3 reasons. Each reason is one sentence, at most 160 characters, in this shape:
   "Your card mentions <what the signal says>; the posting asks for <what the sentence asks>."
4. Describe, never judge. Do not praise or grade the person. Never use: strong, excellent, great, impressive, perfect, ideal, expert, talented, skilled, qualified, senior, junior, fit, match, best, top, highly, score, percent.
5. Do not say whether the person will get the job or is suitable. Do not give advice.
6. Do not invent facts. Use only the signal text and the sentence text given.
7. Pick pairs that cover different requirements when you can.
```

## User message template

```
Posting title: {{job.title}}

Your card (signals):
{{for s in signals}}{{s.id}}: {{s.phrase}}. {{s.rendering}}
{{end}}

Posting sentences you may cite:
{{for p in citedSentences}}{{p.id}}: {{p.text}}
{{end}}

Allowed pairs (signal, sentence):
{{for pair in allowedPairs}}{{pair.signal}}, {{pair.sentence or "null (ESCO: " + pair.escoLabel + ")"}}
{{end}}

Return JSON: {"reasons": [{"signal": "S1", "sentence": "P4", "text": "..."}]}
```

`citedSentences` contains only the sentences that appear in allowed pairs (keeps the prompt small). Finnish sentences are passed as they are; the model writes English.

## Output schema

```json
{ "reasons": [ { "signal": "S1", "sentence": "P4 | null", "text": "string <= 160" } ] }
```

Zod: `reasons` length 1 to 3; `signal` matches `/^S\d+$/`; `sentence` matches `/^P\d+$/` or null.

## Code checks after parsing

1. Drop a reason whose `(signal, sentence)` is not in the allowed pairs.
2. Drop a reason whose text matches `/\b(strong|excellent|great|impressive|perfect|ideal|expert|talented|skilled|qualified|senior|junior|fit|match(es|ed)?|best|top|highly|score|percent)\b|%|\d+\s*\/\s*\d+/i`.
3. Dedupe reasons that cite the same signal.
4. If no reason survives, use the code-rendered reason (`matching.md` 2.3) and set `reasonsSource: code`.
5. Store `{text, signalId, evidence: signal.evidence[0], postingSentence}`. The page renders under each reason: "From your card: {rendering}" with a link "See your words" that opens the transcript at the reference, and "From the posting: {sentence text}".
6. `notMentioned` is computed by code, never by this prompt.

## Example

Input:

```
Posting title: Data Engineer

Your card (signals):
S1: Python data pipelines. Built pipelines in Python that load sensor data into a database every night (English rendering).
S2: SQL. Wrote SQL queries to check data quality and build reports (English rendering).
S3: Customer support. Answered customer questions by phone and email for two years (English rendering).

Posting sentences you may cite:
P4: Strong Python skills.
P5: Experience with SQL and relational databases.

Allowed pairs (signal, sentence):
S1, P4
S2, P5
```

Output:

```json
{"reasons": [
  {"signal": "S1", "sentence": "P4", "text": "Your card mentions building nightly data pipelines in Python; the posting asks for Python skills."},
  {"signal": "S2", "sentence": "P5", "text": "Your card mentions writing SQL for data checks and reports; the posting asks for SQL and relational databases."}
]}
```

Rendered "not mentioned" for this posting (from code): "Not mentioned in your conversation: 4 years of data engineering · Fluent Finnish · Communication skills · Apache Airflow · Energy sector knowledge".

## Bad outputs the checks must catch (unit-test fixtures)

| Output text | Check that drops it |
|---|---|
| "You are a strong match for this Python role." | forbidden words |
| "Your card mentions Kubernetes; the posting asks for it." (pair S4,P9 not allowed) | allowed pairs |
| "You meet 2/5 requirements." | forbidden pattern `\d+/\d+` |
