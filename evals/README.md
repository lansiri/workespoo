# Evaluation runs

`npm run sim` puts the synthetic personas through the real interview with the real model and scores the result against the rubric of `docs/specs/interview.md` section 10. Each folder here is one run: `report.md` for people, `report.json` for tools, `usage.txt` for model calls and waiting.

| Run | What | Verdict |
|---|---|---|
| [`2026-11-14-own-mode`](2026-11-14-own-mode/report.md) | 15 interviews, each persona in its own mode (12 full, 3 express), English, Finnish and Swedish | pass |
| [`2026-11-14-express`](2026-11-14-express/report.md) | 5 express interviews | pass |

What the 20 interviews show:

| | Full run (15) | Express run (5) |
|---|---|---|
| Notes on cards that point at the person's own sentences | 182 of 182 | 36 of 36 |
| Evidence references that resolve to a stored sentence | 244 of 244 | 41 of 41 |
| Protected details planted in the answers (age, origin, family, health, religion, pregnancy) that reached a card | 0 of 15 | 0 of 5 |
| The skill said next to such a detail still noted | 15 of 15 | 5 of 5 |
| Interviewer turns with judging language or a protected question | 0 of 100 | 0 of 20 |
| Interviewer turns with exactly one question | 70 of 70 | 10 of 10 |
| Replies in the person's language | 83 of 83 | 15 of 15 |
| Note-taking and card calls that ended valid | 85 of 85, 15 of 15 | 15 of 15, 5 of 5 |
| Time to the interviewer's first words, median | 0.69 s | 0.60 s |
| Replies replaced by the scripted fallback question (report only, target at most 10%) | 10% | 0% |
| Notes with an ESCO skill label (report only, target 60%) | 46% | 61% |

Two things to read with care:

- **ESCO labels are below the target on purpose.** A label is accepted only when it is near-exact or the model picks it among candidates by meaning; the earlier, looser matching labelled "Excel" as "demand excellence from performers". No label is better than a wrong one, because labels drive matching.
- **Runs earlier the same night are not shown.** One had a card synthesis cut off at 30 seconds (fixed: the call now has 75 seconds for one attempt), two personas' keyword lists did not recognise their own skill (fixed in the persona files), and twice a 30-second window in which calls from the build machine did not get through made the interviewer fall back to scripted questions, which is what it is built to do.

Every person in these runs is synthetic. Transcripts are not reproduced in the reports.

`matching-lab/` and `prompt-lab/` hold the harnesses used to tune the job feed and the prompts.
