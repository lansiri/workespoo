# Pitch notes

For the Junction 2026 jury: City of Espoo, "Rethinking Recruitment". Judging is impact 45%, innovation and user experience 35%, responsible and feasible execution 20%. The live demo is in `docs/specs/demo-script.md`; this page is what to say around it and how to answer questions. Every number here was measured on the build that is live; where something is not built or not checked, it says so.

## One line

WorkEspoo replaces the CV form of a matchmaking event with a four-minute conversation, and everything after it (the jobs a person sees, the people a company is shown) rests on what the person actually said, with an Espoo organiser approving every suggestion.

## The problem, in Espoo's terms

- CVs are written with AI and screened with AI. Both sides get more text and less signal.
- Companies describe their need late and in must-have lists that filter out people who could do the job. "Fluent Finnish" on a role whose material is in English is the usual case.
- Organisers of TalentMatch events get a pile of applications and have to judge capability from documents.
- International talent has skills that do not survive translation into a CV, and often no words for them in Finnish.

## What we built

| Thing | What it is | Who decides |
|---|---|---|
| **Signal Card** | A person's skills as short notes, each pointing at the sentences the person said. No scores, no levels, no name, no photo. | The person edits and approves it before anything uses it. |
| **Need Card** | A company's need, drafted from the real posting it already wrote: must-haves, nice-to-haves, and questions back to the employer with evidence from the pool. | The company answers or changes it. |
| **Daily Picks** | Per company, a short list of people worth a conversation, each with reasons that pair the card with a sentence of the posting. | An Espoo organiser approves each person one by one. Names appear only when both sides say yes. |

The interviewer is the front door: it asks about real work, follows up on what was just said, and while the person talks their notes appear and real open jobs in Espoo light up.

## Why it should win on each criterion

**Impact (45%)**
- Talent: skills get articulated without a CV, in English, Finnish or Swedish, by voice or typing. The person leaves with matched real open jobs whether or not any company picks them.
- Companies: nothing new to write. The need comes from their own posting, and their must-haves come back as questions with numbers ("2 of 4 people whose cards relate to this role speak to this; a hard filter would set aside 2").
- Organisers: a review queue instead of a pile, an exposure page that shows who has never been suggested, and an audit log of every decision.
- It runs on real data today: 1,338 open Espoo postings from Työmarkkinatori, matched through the ESCO skills taxonomy, which is what lets an English-speaking candidate meet a Finnish-language posting.

**Innovation and user experience (35%)**
- The live room: the person's own words are marked where they became notes, and the jobs board counts up as they speak.
- Reasons, not match percentages, on every screen. "Not mentioned does not mean missing" is said wherever something is absent.
- The requirement that comes back as a question is the part employers have not seen before.

**Responsible and feasible (20%)**
- The rules are in the code, not on a slide: a note without a sentence behind it is dropped; a company payload cannot carry a name, a quote, the interview language or whether the person spoke or typed; a list cannot be published while one person is undecided; there is no approve-all.
- Open-weight model (Kimi K3.1) served by Verda from Finland. No audio is stored and nothing analyses voice or emotion.
- One small server (2 cores, 4 GB) runs the whole thing: web, worker, database and the speech engine.

## The demo in one breath

A person talks for a minute, approves their card, and sees real jobs. The organiser runs today's picks, removes one with a reason, approves the rest one by one and publishes. The company sees people without names, is asked whether Finnish is really needed from day one, makes it a nice-to-have, and asks to meet. The person says yes, and only then gives a name. The audit log shows every step.

## What is real and what is not

| Real | Simulated or masked |
|---|---|
| The postings: 1,338 open Espoo jobs, ingested from Työmarkkinatori every six hours, with recruiter names, emails and phone numbers removed at ingestion | The people: 15 synthetic personas. Each was interviewed by the real interviewer and went through the real pipeline, and each is labelled "Synthetic person" |
| The model calls: every interview, card and Need Card in the demo world was made by the real model. Reasons on the lists that are restored with the demo are written by code; the list drafted live is worded by the model | The companies: 8 real postings shown as "Demo company 01" to "08" with the employer's name hidden, because no employer was asked |
| The matching, the review queue, the mutual consent, the audit log | Email: nothing is sent. A company's list is a private link |
| Whoever starts an interview on the site: a live demo session with consent, deleted after 24 hours | The event agenda and meeting slots: not built |

## Numbers worth knowing

| What | Number | How it was measured |
|---|---|---|
| Interviewer's reply | first word after 0.85 s, whole reply after 1.2 s on average (1.8 s at the 90th percentile) | 64 replies while building the demo world, from the model call log |
| Notes for an answer | 2.6 s on average for the model (3.4 s at the 90th percentile); on screen a few seconds after sending | 77 extractions in the same run |
| Card after the last answer | about 20 s (26 s at the 90th percentile) | 12 cards in the same run |
| Need Card from a posting | about 18 s | 47 drafts in the same run |
| Model calls per full interview | about 15, plus one per answer for skill labels | usage report of the seed |
| The whole demo as an automated test | 1.1 minutes on the live site | `e2e/golden-path.spec.ts`, 14 November |
| Automated tests | 1,396 passing | `npm run check` |
| Speech on the server | 0.2 to 0.65 s per sentence, three languages | measured on the server |

## What the evaluation shows

Twenty simulated interviews with the real model (15 in each persona's own mode and language, 5 express), scored by `npm run sim` against the interview rubric. Both runs pass every enforced check; the reports are in `evals/`.

| | Result |
|---|---|
| Notes on cards that point at the person's own sentences | 218 of 218 |
| Protected details planted in the answers (age, origin, family, health, religion, pregnancy) that reached a card | 0 of 20 |
| The skill said next to such a detail still noted | 20 of 20 |
| Interviewer turns with judging language or a protected question | 0 of 120 |
| Replies in the person's language (English, Finnish, Swedish) | 98 of 98 |
| Time to the interviewer's first words, median | 0.6 to 0.7 s |
| Notes with an ESCO skill label | 46% (full), 61% (express): below the 60% target on purpose, because a missing label is better than a wrong one |

## Questions the jury may ask

**Is this an automated decision about a person?** No. The model takes notes and words reasons. Who is suggested to a company is decided by an organiser, one person at a time, and a company's must-haves never remove anyone. A person's card is theirs to edit and approve, and they can download or delete everything.

**How do you stop the model inventing skills?** A note must point at sentences in the stored transcript, by turn and sentence number; code renders the quote from the transcript, never from the model. A note whose reference does not resolve is dropped. The model's own wording is shown separately and labelled "Written by AI".

**How does matching work without scores?** A person relates to a need when one of their notes speaks to one of its requirements: the same ESCO skill, an essential skill of the occupation, or the phrase itself. That gives a yes or no and the pairs that explain it. Lists are in no particular order, and a rotation rule makes sure the same few people are not shown every day.

**What about bias?** Names, age, gender, nationality, photo, the interview language and whether someone spoke or typed never reach a company or an organiser. Declared work languages reach companies as codes, never as the person typed them. Not built: a test that swaps names and languages and checks that picks do not change. The public "How this works" page does not claim it.

**Is it legal under the AI Act?** Recruitment is a high-risk use. We designed as if the obligations apply now: human oversight on every suggestion, logging, transparency to the person, no emotion recognition. We have not done a conformity assessment, and Espoo's lawyers would need to confirm the timeline.

**Could Espoo run this?** The job data comes from the website's own endpoints today; production needs the official Työmarkkinatori API, which Espoo as an employment authority can onboard to. The model can be any OpenAI-compatible endpoint, so it can move to the city's own provider. Before real people: a data protection impact assessment, a native check of the Finnish and Swedish wording, and a second model provider.

**What breaks under load?** One model key allows 40 requests a minute for everything. That carries the demo and a couple of people at once, not a hall of judges together. The fix is configuration (a higher limit or a second provider), not code.

**What would you build next?** The event day (agenda and slots), the name-and-language swap test, the organiser's "add a person" action, and email delivery of lists.

## Three sentences to end on

1. "Nothing about a person is scored or ranked: the AI only takes notes that point back to the person's own words, and the person approves their card before anyone sees it."
2. "Every suggestion is approved one by one by an Espoo organiser, must-haves never filter anyone out, and companies see no name and no original words until both sides say yes."
3. "Requirements come back to employers as questions with evidence from the pool, every decision is in the audit log, the model is open-weight and served from Finland, and every person here except me is synthetic."
