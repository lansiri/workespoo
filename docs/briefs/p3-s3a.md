# Third pass, S3a: a job feed that makes sense on real postings

Paths as before: `src/features/matching/**`, `src/app/api/matches/**`, `src/app/(talent)/matches/**`, plus `evals/matching-lab/**` (new, yours). Spec: `docs/specs/matching.md` sections 2.1 to 2.3, as changed by this brief and by `docs/LEAD-DECISIONS.md`.

## What the first real run showed (14 Nov, the live site, 1,338 real postings)

A synthetic warehouse worker (signals: warehouse logistics, order picking, receiving incoming goods, warehouse management system, SAP, Excel, reach truck operation) got 40 postings. The first three were right: a warehouse worker, logistics work, a forklift driver. Most of the other 37 were IT roles: ServiceNow Developer, Control Software Engineer, Senior IT Architect, Verification Lead. Three causes, all in `retrieveCandidates`:

- Text search uses single words taken from inside ESCO labels. "use a warehouse management system" contributes "management" and "system", which appear in most postings, so `text_hit` is true almost everywhere.
- One optional occupation link through a tool (SAP) plus that weak text hit passes the gate.
- The order adds up link types and never asks how many different signals of the person a posting relates to.

Signals without an ESCO label (now more common, because the label matcher only accepts sure matches) contribute nothing at all, although a posting that says "React" in so many words is the clearest link there is.

## A lab with the real postings

A local Postgres holds a copy of the public job and ESCO tables from the live site: `postgres://postgres:lab@127.0.0.1:55433/workespoo` (tables `job`, `job_skill`, `esco_concept`, `esco_occupation_skill`; no people). Treat it as read-only. Build a small harness in `evals/matching-lab/` that takes a profile (a list of `{ phrase, kind, escoUri | null }`), runs the retrieval query against that database without writing to it, and prints the first 12 postings with the links that brought each one in. Write at least ten profiles as fixtures from the synthetic personas in `seed/` and from everyday cases: a warehouse worker, a practical nurse, a cleaner, a cook, a data engineer (Python, SQL, data pipelines), a web developer (React, TypeScript), a sales assistant, an electrician, an accountant, a bus driver. Resolve ESCO labels with `escoTopMatch` against the lab database. Run the harness before you change anything and keep the output: it is your baseline.

## Build

1. **Text evidence is a phrase, not a word.** A signal is mentioned by a posting when the posting's text contains the person's phrase, or the signal's ESCO label in English or Finnish, as adjacent words; use `phraseQuery` from `@/lib/jobs-lit`. No single words from inside a label.
2. **Per posting, per signal, the strongest link**: the posting lists the skill directly; an essential skill of the posting's occupation; a mention in the text; an optional skill of the occupation. Signals without an ESCO label can still be mentioned.
3. **Gate.** A posting enters the feed when at least two different signals link to it, or when one signal that is not of kind `tool` links by a direct skill, an essential occupation skill or a mention, or when a self-declared role matches the title as today. One tool by itself (SAP, Excel) is not enough.
4. **Order**: more different signals linked first; then stronger links; then Espoo; then newer. This orders postings for one person. It is never stored as a number and never compares people.
5. `FEED_SIZE` becomes 20.
6. **Reasons** follow the links: for a mention, the code-written reason cites the posting sentence that contains the phrase; for a direct or occupation link, as today. Keep the two-step feed and the rule that a reason needs a real link.
7. Run the harness again. For every profile the first eight postings should be ones a careful person would agree relate to the profile; where they are not, find out why and fix the rule, not the profile. Put the before and after lists for all profiles in your report.

## Watch out for

- Unit tests still run on PGlite with the fixtures and never touch the lab database. The harness is a script (`npx tsx evals/matching-lab/run.ts`), not a test.
- Nothing here may read or rank people. The feed is one person's view of postings.
