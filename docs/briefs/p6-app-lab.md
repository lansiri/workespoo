# Job interviews: trying the three prompts on the real model

Read first: `evals/prompt-lab/README.md` (how the lab works and its rules, which bind you), `docs/specs/prompts/application.md` (the three prompts and their checks), `docs/specs/job-interview.md` (sections 2, 5 and 6), `src/contracts/application.ts` (the output schemas: `ApplicationPlanOutput`, `ApplicationTurnOutput`, `ApplicationAssessOutput`), `src/lib/lexicon.ts` (the word lists the checks use).

Paths: `evals/prompt-lab/application-plan/`, `evals/prompt-lab/application-turn/`, `evals/prompt-lab/application-assess/` only. You do not edit specs or source code. At most 90 model calls in all.

## Do

1. Build case files from the spec's wording, unchanged, with realistic inputs: postings from `fixtures/jobs/tmt-sample.json` (pick three different kinds of work; write the requirements a Need Card would hold for them, in English, each with its sentence of the ad), and answers the way people talk in English, Finnish and Swedish: a strong concrete example, a vague claim, "we did" without the person's part, a plain "I have not done that", an answer with a protected detail in it, an answer in broken but clear English, a long confident answer with no example.
2. Prompt A: do the questions name something concrete from the ad, ask for the person's own work, stay within two sentences, stay clear of the word lists, and come out in the requested language? Prompt B: is `concrete` right, is a follow-up proposed only when it should be, does it pass the word lists? Prompt C: do the levels follow the anchors; do the vague, the "we" and the "have not done" answers get the levels the scale says; does the broken-English answer get the same level as the same content in clean English; does a long confident answer without an example stay at level 1; do the evidence labels resolve; are the three reasons the same sentence in three languages and free of praise and blame? Check mechanically wherever you can (the schemas, the word lists, the labels).
3. Where the spec's wording fails, change one thing, run that case again and record both. Run each JSON case at least twice to see whether the output is stable.
4. Report: per prompt, what held, what failed and how often, the exact rewording you recommend (old line, new line) with the evidence, the time each call took, and anything the checks by code should additionally catch.
