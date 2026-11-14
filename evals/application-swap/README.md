# Language swap check for job interviews

The pitch says an applicant should not be rated differently for answering in Finnish, Swedish or
English. This is the check that tests it. It uses the real model and costs requests, so it is run
by hand and is never part of `npm run check`.

## Run it

Point `DATABASE_URL` (and the model settings, in `.env.local`) at a database that holds assessed
applications, for example a rehearsal copy of the demo world after `npm run seed`:

    npx tsx evals/application-swap/run.ts --limit 10
    npx tsx evals/application-swap/run.ts --limit 10 --baseline --out evals/application-swap/results/run-1.json

For each assessed application it:

1. puts the interview's words (every question and answer) into the two other languages with the
   model (role `bulk`, "meaning kept, nothing added");
2. rates each version with the product's own assessor (`assessApplication`: the same input, the
   same prompt, the same checks) on a throwaway person and application that are deleted afterwards;
3. compares the level of each requirement with the stored level.

Use a rehearsal database: the copies are removed, but they exist for a moment next to real rows.
Budget: about two model calls per version (one translation, one rating), the key allows 40
requests a minute.

## Reading the result

The report lists every requirement (`stored level -> level`) and a summary: how many ratings
stayed, moved by one, moved by more, split by language and by direction.

- Ratings that stay: the scale does not depend on the language.
- Moved by one: expected now and then, because the model is not perfectly steady.
  Add `--baseline`, which rates the unchanged words again: if the baseline moves as often as the
  translated versions, it is the model's noise, not the language.
- Moved by more than one, or moves that are mostly in one direction for one language: a failure.
  The assessor treats a language differently, or the translation changed what was said. Read the
  applications named in "with a big move" before concluding which.
- Versions that could not be rated are listed and left out of the numbers. Many of them mean the
  run says little: run it again.

A failure is a reason to change the assessment prompt (and bump `APPLICATION_RUBRIC_VERSION`), not a
reason to hide the numbers.
