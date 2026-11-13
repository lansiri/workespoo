# Second pass, shared library: employer masking that respects words, and no recruiter names in postings

## Yours

`src/lib/mask.ts`, `src/lib/redact.ts`, `src/features/jobs/**` (the ingester and its queue jobs; S2 leaves this folder alone in this pass), `fixtures/jobs/**`. These are lead-owned paths handed to you for this task. Keep every exported signature that exists today.

## 1. Employer masking (`src/lib/mask.ts`)

Today `maskEmployer` replaces every case-insensitive occurrence of each term anywhere in the text, with no word boundaries. For an employer called "Kone Oyj" it turns "koneasentaja" into "the companyasentaja"; for "Real Oy" it breaks "really". It also misses inflected names such as "Nokialla" or "ABB:n" only by luck. Make it:

- match a term only at a word start (no letter or digit before it);
- allow a Finnish or Swedish case ending after the term, then require a word end: up to six lower-case letters, optionally after a colon or apostrophe ("Koneen", "Nokialla", "ABB:n", "Acmes"); the ending is swallowed by the replacement;
- for a term that is a single word, match only when the occurrence starts with an upper-case letter, so the common noun "kone" in the middle of a sentence is left alone; multi-word terms stay case-insensitive;
- keep `employerTerms()` returning the whole names, the names without a leading or trailing legal form, and a long first word, longest first.

Tests: the cases above, the existing tests, names with regex characters, a name at the very start and end of the text, and text in which the name appears inside a longer word.

## 2. Contact sentences in postings (rule 8 in `CLAUDE.md`)

Ingestion removes the structured recruiter field and redacts emails and phone numbers, but a sentence such as "Lisätietoja tehtävästä antaa palvelupäällikkö Maija Meikäläinen, puh. [removed]" keeps the recruiter's name. The prompt lab found three such names in the 40 fixture postings.

- In `src/lib/redact.ts` add `scrubPostingText(text: string): string`: run `redactContacts`, then remove every sentence (and every list line) that contains the `[removed]` marker or a contact cue. Cues in Finnish, English and Swedish, as stems so inflected forms match: for example `lisätie*`, `tiedustelu*`, `yhteyshenkilö*`, `yhteydenot*`, `ota yhteyttä`, `kysy lisää`, `more information`, `further information`, `for questions`, `contact person`, `please contact`, `mer information`, `ytterligare information`, `upplysningar`, `kontaktperson`, `frågor besvaras`. Also remove a short line (under 60 characters) that directly follows a removed line and consists of a capitalised first name and surname, with or without a job title after a comma. Never remove a sentence only because it contains a capitalised word. Export `containsContactCue(text)` for tests.
- Use it in `src/features/jobs/tmt.ts` for the description before it is split into sentences, and for every string of the stored raw posting.
- Read the 40 postings in `fixtures/jobs/tmt-sample.json` and list every sentence that names a contact person. All of them must be gone after your change, and no sentence that describes the job may be lost: check the before and after by reading, and put both counts in your report. Other streams' tests point at fixture sentences by index, so change the fixture **in place**: a removed sentence becomes the single text `[removed]` at the same index, and the stored description loses the sentence. Do not regenerate the fixture from the network.
- Stored postings on the server need the same treatment once: export `rescrubStoredPostings(db): Promise<{ postings: number; changed: number }>` from `@/features/jobs` and register a queue job `jobs.rescrub` with payload `{}` that runs it. For a posting that already has a Need Card, keep sentence positions the way the fixture does; otherwise recompute the sentences. It must be safe to run twice.
- Also fix the `&nbsp;` sentence the lab saw: entities are decoded before splitting, and a sentence of only whitespace or punctuation is dropped.

Tests: each cue in each language; a contact block of three lines; a job-describing sentence with a capitalised product or place name survives; idempotence; the fixture has no contact cue and no `[removed]`-adjacent name left; `rescrubStoredPostings` on a small PGlite database, with and without a Need Card.

## Watch out for

- Over-removal is a real cost: a Need Card is drafted from these sentences. When unsure whether a sentence is about a contact person, keep it unless it has a cue or a marker.
- `npm run check` runs every stream's tests against the fixture; they must still pass.
