# Job interview and ranked applicants

Decided by the owner on 14 November 2026 (`docs/LEAD-DECISIONS.md`): after the general interview a person chooses one job of the event and takes a job interview whose questions come from that job's ad. The model rates each job interview against the ad's requirements and the applicants are ranked, with written reasons; an organiser can reorder and must approve before the company sees the list.

Contracts: `src/contracts/application.ts`. Tables: `application`, `application_turn`, `applicant_ranking` (`src/db/schema/application.ts`). Prompts: `docs/specs/prompts/application.md`. Feature code: `src/features/application/`.

## 1. Words

| Word | Meaning |
|---|---|
| Job interview | The second, job-specific interview a person takes for one job of the event. |
| Application | That job interview once it exists, with its plan, turns and, later, its assessment. One per person and job. |
| Assessment | The model's ratings of one application: one level per covered requirement, each with a reason and the person's sentences it rests on. |
| Points | Computed by code from the levels and the requirements' weights. |
| Ranked list | The applicants to one job in order. Computed as a draft, changed and approved by an organiser, then shown to the company. |

## 2. What must hold (these are the feature, not decoration)

1. **The person knows before they start.** The start screen says that the answers will be rated by an AI against the ad's requirements, that applicants are ranked, that an organiser reads the answers and checks the order, and that the company sees no name and none of their own words unless both agree to meet. A separate consent (`job_assessment`) is recorded. Without it nothing starts.
2. **Everyone is asked the same questions.** Which requirements a job interview covers is decided by code from the Need Card, the same for every applicant (section 4). The model words the question for each requirement once per job, Need Card version and language; that wording is kept and every applicant in that language gets it. Only follow-up questions depend on what a person said.
3. **A level is about evidence, never about the person.** Four levels with written anchors (`RATING_LEVELS`). Fluency, grammar, length, confidence, the language of the answers and whether the person spoke or typed play no part.
4. **Every level above the lowest points at the person's own sentences.** Code resolves every reference against the stored turns; a level whose references do not resolve becomes level 0.
5. **The assessor does not know who it is reading.** It gets requirement texts and the person's answers with sentence labels. It never gets the name, the nickname, the interview language as a field, or the input mode. A sentence in which `findProtectedCard`-style checks find a protected detail is replaced by `[left out]` before the model reads it, and can therefore never be cited.
6. **Each application is rated by itself**, against the scale, never against another applicant. The order is computed by code (section 7), so one person's levels do not move when another person applies.
7. **Nobody is removed by a rating.** Every assessed application is on the list. Must-haves weigh more; they never filter.
8. **A human decides what the company sees.** The organiser sees the levels, the reasons and the person's own words behind them, can move a person to another position with a written reason, and approves the list. Until then the company sees nothing; after a change it sees the last approved list.
9. **The person sees their own assessment**: levels, reasons and the sentences they rest on, and, once a list has been approved, their position on it.
10. **Everything else in the product stays unrated**: no levels on the Signal Card, no numbers in the job feed, Daily Picks in no particular order.
11. **The employer stays masked.** For a masked company the person sees "Demo company 03", never the real employer's name, and no text of the ad that names it: every posting sentence shown or given to a model that writes for the person goes through `maskEmployer`, and a question that contains one of `employerTerms` is replaced by the code's wording.

## 3. Who can apply to what

- The jobs: postings that have a Need Card whose company takes part in the event (`event_company`, `participating`). Today these are the eight demo companies' postings. A job is shown with the company's display name, the Need Card's title and summary, and the requirements the interview will cover.
- The person: has a talent session and an approved Signal Card. Being in the pool is not required: an application is its own, narrower consent.
- One application per person and job. A person can apply to several jobs.
- A person can withdraw an application at any time: it is deleted with its turns, and it leaves every list, the approved one included.

## 4. Which requirements a job interview covers

Code, not the model, and identical for every applicant of the job at the same Need Card version:

1. Take the Need Card's requirements in their stored order.
2. Leave out any with `statutory !== "none"` and any with category `authorisation` (the employer checks those at hiring; asking a person about permits, licences or clearances is not this interview's business).
3. Must-haves first, then nice-to-haves, keeping the stored order within each group.
4. Keep at most `APPLICATION_MAX_REQUIREMENTS` (6).

A language requirement is covered like any other: the question asks how the person has used that language at work, and the level rests on what they say about that, never on the language they answer in.

If no requirement is left, the job cannot be applied to and says so.

## 5. The conversation

The interviewer is the same character as in the general interview: it asks, listens and takes notes. It does not praise, judge or comment on how the person sounds, and it never asks about protected matters. The scripted lines exist in English, Finnish and Swedish; the interview runs in the language the person chose on the start screen.

| Step | Who words it | What happens |
|---|---|---|
| Plan | model (`application.plan`, analyst, JSON), checked by code | One question per covered requirement, made once per job, Need Card version and language and kept in `app_meta` (key `application:questions:<needCardId>:<version>:<lang>`), so every applicant gets the same wording. Each question names something concrete from the ad (a task, tool or setting from the requirement's sentence), asks for the person's own work, cannot be answered with yes or no, is at most two sentences. A question that fails a check, or a failed call, is replaced by the scripted question for that requirement. |
| Opening | script | Says which job this is about, how many things will be asked, that an AI rates the answers afterwards and an organiser checks the order, and then asks the first question. |
| After each answer | model (`application.turn`, live, JSON), decided by code | The model marks which sentences of the answer speak to the requirement, says whether the answer holds a concrete example of the person's own work, and may propose one follow-up question. Code asks the follow-up only if the answer was not concrete, the requirement has had fewer than `APPLICATION_MAX_FOLLOW_UPS` follow-ups, and the question passes the checks; otherwise it moves on. If the call fails or is late, it moves on. |
| Next question | script plus the planned question | A short neutral bridge ("Next.", "The ad also asks for this.") and the planned question. Never a comment on the answer. |
| Skip | script | "Skip question" marks the requirement skipped and moves on. |
| Remove an answer | code | The person can remove any answer of theirs: its text is blanked, what was noted from it goes, and the requirement counts as unanswered. |
| Stop | script | The person can stop at any time: the rest are left unanswered and the application goes to review. |
| Closing | script | "That was the last one. Look through your answers, then send your application." The application is now in `review`. |

Spoken input works as in the general interview (the same voice adapter and consent). The pre-checks of the general interview apply to every answer: a request to delete, a request to stop, an empty answer.

What the person sees while it runs: the conversation on the left, the question and their own words in the middle (the words that were noted for the requirement are marked), and on the right "What the ad asks for": the covered requirements, each showing whether it is waiting, asked, answered or skipped. No level is shown during the interview.

## 6. Review, sending and the assessment

- **Review** (`review`): per requirement, the question(s) and the person's answer(s) in their own words, with "Remove this answer". Nothing has been sent. "Send my application" needs at least one answer.
- **Sending** sets `submitted`, writes `application.submitted` and enqueues `application.assess`.
- **Assessment** (`application.assess`, analyst, JSON, one attempt of up to 75 s, retried by the queue): the model gets the job title, the covered requirements labelled R1…, each with its text and (masked) ad sentence, the questions, and the person's answers as labelled sentences (`T3.S2`), with protected sentences left out. It returns for every requirement a level, the labels it rests on and a reason in English, Finnish and Swedish, plus a two-sentence summary in the three languages.
- **Checks by code**, in this order, for each rating: the requirement is one of the plan's; the level is 0 to 3; every label parses and points at a sentence of a participant turn of this application that is not removed and not left out; a level above 0 with no valid reference becomes 0. A reason that names a protected detail, judges the person (`findBannedEvaluative`) or names the employer is replaced by the code's sentence for that level. A requirement the model did not return gets level 0. A skipped or unanswered requirement is level 0 without asking the model.
- The stored `ApplicationAssessment` holds one rating per covered requirement in the plan's order, the `rubricVersion`, and when it was made. Status becomes `assessed`, `application.assessed` is written.
- **The person's view** (`assessed`): per requirement the level with its anchor, the reason (marked as written by AI) and their own sentences it rests on; their points; "An organiser checks the order of applicants before the company sees it"; after an approval, "You are number N of M on the list the company sees". Withdraw is always there.

## 7. Points and order

```
weight(requirement)   = RATING_WEIGHT[kind of that requirement in the Need Card now]     must 2, nice 1
points(application)   = sum over its ratings of weight × level
maxPoints             = sum over the same requirements of weight × 3
```

- A requirement that is no longer on the Need Card (the company removed it) counts for nothing. A requirement the company made nice-to-have counts 1 from then on: the draft order changes at once, the company's list only when the organiser approves again.
- **Draft order**: points, highest first; then the number of must-haves at level 2 or 3; then the earlier `submittedAt`.
- **Pins**: an organiser's move puts one application at a position (`PinnedPosition`, with a reason). The order is the draft order of the unpinned applications with the pinned ones inserted at their positions, lowest position first; a position beyond the end means last. A pin whose application no longer exists is ignored. Removing a pin puts the person back where the points put them.
- **Approving** stores the list exactly as shown (`PublishedRanking`) with the time. The company sees that list, minus anyone whose application no longer exists, until the next approval. The organiser's page says when the draft differs from the approved list.

## 8. Who sees what

| | The person (own application) | Organiser | Company |
|---|---|---|---|
| The answers in the person's own words | yes | yes: the person agreed to it on the start screen | no, until both agreed to meet |
| Levels and reasons | yes | yes | yes, on the approved list |
| Points | own | yes | yes, on the approved list |
| Position | own, after an approval | yes (draft and approved) | yes (approved) |
| Nickname | own | yes | yes |
| Name and contact | own | no | after both agreed to meet |
| Interview language as a field, input mode | no | no | no |
| Reason for an organiser's move | no | yes, and in the audit log | no: only "position set by the organiser" |

The company's "Ask to meet" on an applicant follows the existing introduction flow.

## 9. Pages, routes and test ids

| Path | Who | What |
|---|---|---|
| `/apply` | person | The event's jobs: company, title, what the ad asks for, and per job "Apply with a job interview", "Continue" or "See your application". Test ids: `apply-job` (with `data-job-id`), `apply-start`, `apply-continue`, `apply-open`. |
| `/apply/[id]` | person | By status: the start screen for a job (`/apply/new?job=<jobId>`: `apply-consent`, `apply-language`, `apply-begin`), the room (`interviewer-text`, `answer-input`, `send-answer`, `talk-button`, `apply-requirement` with `data-requirement-id` and `data-progress`, `apply-skip`, `apply-stop`), review (`apply-review`, `apply-answer`, `apply-remove-answer`, `apply-send`), result (`apply-result`, `apply-rating` with `data-requirement-id` and `data-level`, `apply-points`, `apply-position`, `apply-withdraw`). |
| `/organiser/applicants` | organiser | Jobs with applicants and their counts (`applicants-job` with `data-job-id`). |
| `/organiser/applicants/[jobId]` | organiser | The ranked list: `ranked-applicant` (with `data-application-id` and `data-position`), `ranked-points`, `ranked-rating`, `ranked-evidence` (the person's own words, opened on demand), `ranked-move` / `ranked-move-position` / `ranked-move-reason` / `ranked-move-confirm`, `ranked-unpin`, `ranked-approve`, `ranked-status`. |
| `/c/[token]/applicants` | company | The approved list for the company's job: `company-applicant` (with `data-position`), `company-rating`, `ask-to-meet`; `applicants-link` on `/c/[token]` leads here. |

| API | What |
|---|---|
| `GET /api/application/jobs` | The event's jobs for the signed-in person, with the status of their own application to each. |
| `POST /api/application` | `StartApplicationRequest` → `StartApplicationResponse`. |
| `GET /api/application/[id]` | The person's own application: plan, turns, state, and the assessment once it exists. |
| `POST /api/application/[id]/turn` | `ApplicationTurnRequest`; answers with a server-sent stream of `ApplicationEvent`. |
| `POST /api/application/[id]/skip`, `/stop`, `/remove`, `/submit` | The actions of section 5 and 6. `DELETE /api/application/[id]` withdraws. |
| `GET /api/organiser/applicants`, `GET /api/organiser/applicants/[jobId]` | The organiser's lists. |
| `POST /api/organiser/applicants/[jobId]/move`, `/unpin`, `/approve` | `MoveApplicantRequest`; unpin `{ applicationId }`; approve. |

## 10. Audit

`application.started`, `application.submitted`, `application.assessed`, `application.withdrawn`, `ranking.moved`, `ranking.unpinned`, `ranking.approved`. Details hold ids, counts, positions and the organiser's reason, never answers, levels or reasons. Every event about one application carries `talentId` in its detail so that it appears in the person's export.

## 11. The demo world

Every simulated person who is eligible for a demo company's job applies to it (at most two jobs per person, at most five applicants per job), through the real engine with the real model: the simulated candidate answers the job interview's questions from its persona sheet, and says so plainly when the persona has not done something. The applications are assessed and stored in the snapshot, and "Reset demo" restores them. The pitch company's job has four simulated applicants; the person on stage becomes the fifth.

## 12. Not in this build

A practice interview for postings outside the event; comparing applicants pair by pair; weights other than must and nice; e-mail about a result; re-interviewing after a company adds a requirement (a requirement added later simply is not part of existing applications).

## 13. Acceptance

1. Without the `job_assessment` consent, `POST /api/application` is refused and nothing is stored.
2. Two people applying to the same job at the same Need Card version get the same covered requirements in the same order.
3. A statutory or `authorisation` requirement is never asked and never rated.
4. A model question that names the masked employer, asks about a protected matter or judges is replaced by the scripted one.
5. A follow-up is asked at most once per requirement, and never when the answer was concrete.
6. A rating whose references do not resolve is stored as level 0; a reason that judges the person or names a protected detail is replaced.
7. The assessor's input holds no name, nickname, language field or input mode, and no sentence with a protected detail.
8. Points and order follow section 7 exactly, including the change when a must-have becomes nice-to-have, pins, and ties.
9. The company's page shows nothing before an approval, the approved list after it, and no own words and no name before both agreed to meet.
10. Withdrawing, "delete my data" and the 24-hour purge remove the application everywhere, the approved list included.
11. The golden path of the existing demo still passes unchanged.
