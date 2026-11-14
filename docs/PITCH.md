# Pitch notes

For the Junction 2026 jury: City of Espoo, "Rethinking Recruitment". Judging is impact 45%, innovation and user experience 35%, responsible and feasible execution 20%. The live demo is in `docs/specs/demo-script.md`; this page is what to say around it and how to answer questions. Every number here was measured on the build or in the prompt lab named next to it; where something is not built or not checked, it says so. The job interview and the ranked applicants are on the live site since Saturday 14 November, 15:37.

## One line

WorkEspoo replaces the CV form of a matchmaking event with a four-minute conversation, and everything after it rests on what the person actually said: the jobs they see, the people a company is shown, and, when they choose to apply for one job, a job interview made from that job's ad whose ratings point back at their own sentences, with an Espoo organiser approving every suggestion and every ranked list.

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
| **Daily Picks** | Per company, a short list of people worth a conversation, in no particular order, each with reasons that pair the card with a sentence of the posting. | An Espoo organiser approves each person one by one. Names appear only when both sides say yes. |
| **Job interview** | For one job of the event that the person chooses: one question per requirement of the ad (at most six), at most one follow-up each, only when an answer has no example. Every applicant is asked about the same requirements of the ad, in the same wording for the same language. The person is told beforehand that the answers will be rated and ranked, and agrees to that separately. | The person chooses the job, can remove any answer, sends it, and can withdraw it at any time. |
| **Ranked applicants** | Per requirement, a level for the evidence in the answers (four levels, each with a written anchor) and a reason that points at the person's own sentences. Code computes points and the order. | An Espoo organiser can read the answers behind each rating, can move a person with a written reason, and approves the list. Only then does the company see it: order, levels and reasons, no name and none of the person's words until both agree to meet. |

The interviewer is the front door: it asks about real work, follows up on what was just said, and while the person talks their notes appear and real open jobs in Espoo light up. The general interview is not scored. The job interview is the one place where anything about a person is rated, and the person knows it before they start.

## Why it should win on each criterion

**Impact (45%)**
- Talent: skills get articulated without a CV, in English, Finnish or Swedish, by voice or typing. The person leaves with matched real open jobs whether or not any company picks them. When they apply, they see their own level and the reason for each requirement, with the sentences it rests on: feedback an applicant rarely gets.
- Companies: nothing new to write. The need comes from their own posting, and their must-haves come back as questions with numbers ("2 of 4 people whose cards relate to this role speak to this; a hard filter would set aside 2"). For a job of the event they get a ranked list of applicants with a reason per requirement of the ad they wrote.
- Organisers: a review queue instead of a pile, an exposure page that shows who has never been suggested, a ranked list whose every rating opens onto the applicant's own words, and an audit log of every decision.
- It runs on real data today: 1,338 open Espoo postings from Työmarkkinatori, matched through the ESCO skills taxonomy, which is what lets an English-speaking candidate meet a Finnish-language posting. The job interview's questions are made from the requirements of those real postings.

**Innovation and user experience (35%)**
- The live room: the person's own words are marked where they became notes, and the jobs board counts up as they speak. In the job interview the right side shows "What the ad asks for", each requirement moving from waiting to answered.
- Reasons, not match percentages, in the job feed and Daily Picks. "Not mentioned does not mean missing" is said wherever something is absent.
- The requirement that comes back as a question is the part employers have not seen before.
- A ranking that can be read: every level names what it means, every reason points at sentences the person said, and the person sees the same levels and reasons the company sees.

**Responsible and feasible (20%)**
- The rules are in the code, not on a slide: a note without a sentence behind it is dropped; a company payload cannot carry a name, a quote, the interview language or whether the person spoke or typed; a list of picks cannot be published while one person is undecided; there is no approve-all.
- The rating is held to the same rules: a level above the lowest whose sentences do not resolve becomes the lowest; the assessor never gets the name, the nickname, the interview language or the input mode; a sentence with a protected detail about the person is left out before the model reads it; a reason that judges the person or names a protected detail is replaced by the code's sentence for that level; the order is computed by code, and nobody is removed by a rating.
- Open-weight model (Kimi K3.1) served by Verda from Finland. Speech is turned into text on our own server by an open model, so no outside speech service hears a person; no audio is stored and nothing analyses voice or emotion.
- One small server (2 cores, 4 GB) runs the whole thing: web, worker, database, and both speech engines (listening and speaking).

## The demo in one breath

A person talks for a minute, approves their card, chooses the pitch company's job and is told that this job interview is rated and ranked. They answer one question per requirement of the ad, saying plainly that they have not used Finnish at work yet, and send it. The organiser sees four applicants who came before, opens the answers behind a rating, sees the newcomer join the list once rated, and approves the order. The company sees the order with reasons and no names. The five-minute version adds the person's own levels, reasons and place on the list, Daily Picks, an organiser's move with a reason, the mutual yes and the audit log.

## What is real and what is not

| Real | Simulated or masked |
|---|---|
| The postings: 1,338 open Espoo jobs, ingested from Työmarkkinatori every six hours, with recruiter names, emails and phone numbers removed at ingestion | The people: 15 synthetic personas. Each was interviewed by the real interviewer and went through the real pipeline, and each is labelled "Synthetic person" |
| The model calls: every interview, card and Need Card in the demo world was made by the real model. Reasons on the lists of picks that are restored with the demo are written by code; the list drafted live is worded by the model | The companies: 8 real postings shown as "Demo company 01" to "08" with the employer's name hidden, because no employer was asked |
| The job applications in the demo world (18 applications by 11 of the 15 simulated people: four at the pitch company's job, one to four at each of the others): made through the real job interview and rated by the real model | Who answers them: a model playing each persona from its sheet, told to say so plainly when the persona has not done something. The pitch company's job has four simulated applicants, so the person on stage becomes the fifth |
| The matching, the review queue, the ranked lists, the mutual consent, the audit log | Email: nothing is sent. A company's list is a private link |
| Whoever starts an interview on the site: a live demo session with consent, deleted after 24 hours | The event agenda and meeting slots: not built |

## Numbers worth knowing

| What | Number | How it was measured |
|---|---|---|
| Interviewer's reply | first word after 0.85 s, whole reply after 1.2 s on average (1.8 s at the 90th percentile) | 64 replies while building the demo world, from the model call log |
| Notes for an answer | 2.6 s on average for the model (3.4 s at the 90th percentile); on screen a few seconds after sending | 77 extractions in the same run |
| Card after the last answer | about 20 s (26 s at the 90th percentile) | 12 cards in the same run |
| Need Card from a posting | about 18 s | 47 drafts in the same run |
| Model calls per full interview | about 15, plus one per answer for skill labels | usage report of the seed |
| A job's interview questions | 4 to 12 s, once per job and language; every later applicant gets the stored questions | prompt lab, 14 November |
| Deciding on a follow-up in the job interview | about 1 s | prompt lab, 14 November |
| Rating one job interview | 12 to 18 s, after the person sends it | prompt lab, 14 November |
| The golden path (the demo without the job interview) as an automated test | 1.1 minutes on the live site | `e2e/golden-path.spec.ts`, 14 November |
| Automated tests | 1,830 passing | `npm run check` on main, 14 November afternoon |
| The interviewer's voice, made on the server | 0.2 to 0.65 s per sentence, three languages | measured on the server |
| Speech to text on the server | 6 s of speech in 0.7 s, 18 s in 1.8 s; words appear while the person is still talking | 25 recordings per language through the running service, 14 November (`docs/research/voice-stt.md`) |
| Words heard wrong in read sentences | about 22% in Finnish and Swedish, 7% in English, mostly names and compounds | the same recordings (FLEURS) |

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

The job interview's three prompts went through a prompt lab of 84 real model calls before the build was accepted (`evals/prompt-lab/application-*`). For the assessment:

| | Result |
|---|---|
| Valid output | 12 of 12 runs, over 6 cases |
| Ratings at the level the scale's anchors call for | 60 of 60 |
| The two runs of each case (temperature 0) | identical levels in every case |
| The same content in broken English and in clean English | the same levels, 2 of 2 cases, both runs |
| The same content in Finnish and in English | the same levels, 1 case, both runs |
| A sentence left out for a protected detail, cited anyway | 0 of 6 |

These are small numbers: six cases. The larger check is the language swap (`evals/application-swap`, run by hand): it puts each application's answers into the other two languages and rates every version again; the levels should not move.

Result, 14 November, on the demo world's 18 applications (each rated again as it is, and in the two other languages; 54 versions, all rated, 324 levels compared with the stored ones):

| | Levels compared | The same | Moved by one | Moved by two |
|---|---|---|---|---|
| The same words rated again | 108 | 104 | 3 | 1 |
| The answers in another language | 216 | 192 | 19 | 5 |
| All | 324 | 296 (91%) | 22 | 6 |

- No language was rated lower as such: of the 24 levels that moved in another language, 12 went up and 12 went down (into Finnish 78 of 90 stayed, into Swedish 93 of 102, into English 21 of 24).
- A translated interview is rated less steadily than the same words twice (89% against 96% the same). Part of that is the translation, which a model made.
- Four of the six two-level moves are on one requirement of one job, "a few years of hands-on experience": a requirement about length of experience, which a scale built around examples fits badly. For one applicant the stored level there was "Example" and every second rating, in every language, said "No evidence": the stored rating was the odd one out.
- In points, an application moved by 0.6 on average when rated again and by 1.3 in another language, 6 at most (out of at most 36).
- In two of the five jobs with more than one applicant, a second rating of one applicant would have swapped two neighbours. Both pairs had the same points to begin with. No other order changed.

What we took from it: a difference of a point or two between neighbours is not a difference. The organiser's and the company's lists now say "read the two as level" next to neighbours within two points of each other, and the order is something an organiser checks, not something to act on unread. What this does not show: anything about real applicants. The people are simulated, a model wrote their answers and a model translated them.

## Questions the jury may ask

**You said nothing is scored, and now you rank people?** Yes, and on purpose. Until Saturday 14 November nothing about a person was rated. The owner then changed the rule to allow one narrow thing: a job application the person chooses to make for one job, after being told that the answers will be rated against the ad and the applicants ranked, with a consent of its own. Everything else is as it was: the Signal Card has no levels, the job feed has no match percentages, Daily Picks are in no particular order. The decision, the options that were weighed and the rule as rewritten are in `docs/LEAD-DECISIONS.md` and `CLAUDE.md`.

**Is this not exactly the automated screening the brief warns about?** It is a model rating people, which is why it is narrow and supervised. What makes it different from screening: the person chooses the job and knows beforehand; everyone is asked about the same requirements of the ad, in the same wording for the same language; a level is about the evidence for one requirement, never about the person, and its reason points at sentences the person said; the order is computed by code from the levels; nobody is removed by a rating, and must-haves weigh more but never filter; an organiser can read the answers behind each rating, can move anyone with a reason and approves the list before the company sees it; the company decides whom to meet; the person sees their own levels and reasons and can withdraw.

**What stops the model from marking down someone with weak Finnish or an accent?** The assessor never hears anyone: it gets text, and it is not given a language or input-mode field. It does read the answers as written, so it can see their language and fluency; its instructions say that fluency, grammar, length, confidence and the language of the answer must not change a level, and that a language requirement is rated by what the person says about using it at work, not by the language they answer in. In the prompt lab, broken English got the same levels as the same content in clean English (2 of 2 cases), and Finnish the same as English (1 case). That is little evidence; the language swap check is the larger test: with the answers in another language 192 of 216 levels stayed the same, and of the 24 that moved as many went up as down (see "What the evaluation shows"). One honest gap: speech recognition mishears about one word in five in Finnish and Swedish, and a misheard answer is rated as heard. The person sees every answer and can remove one before sending; a removed answer leaves that requirement unanswered, because the interview does not ask a passed question again.

**Why should an employer trust the order?** They do not have to take it on trust: each level has a written meaning, each reason points at the applicant's sentences, every applicant was asked about the same requirements from the employer's own ad, and an organiser, who can open every applicant's answers, approved the list. Approval does not check that the answers were opened; that rests on the organiser. The order is where the employer starts reading, not a decision. The scale and the weights (must-have 2, nice-to-have 1) are a first version that nobody has validated with employers.

**What happens to someone at the bottom of the list?** They stay on it. The company sees them with the same kind of reasons as everyone else and can ask to meet them. The person sees their own levels and reasons, so they know what the answers did not show. An organiser can move them, with a reason. They can withdraw: that deletes the application and its answers and takes them off the list, the approved one included; the audit log keeps its ids and any organiser's reason, never the answers. A rating does not reach their Signal Card, their job feed or Daily Picks.

**Is this an automated decision about a person?** No decision is taken by the model. It takes notes and words reasons. In a job interview the person chose, it rates the evidence per requirement and code computes an order from those levels. That order reaches a company only after an organiser has been able to read the answers, move anyone with a reason, and approve it. Every Daily Pick is approved by an organiser one by one. Whom to meet is decided by the company and the person. Nobody is removed by a rating or by a must-have. A person's card is theirs to edit and approve, and they can download or delete everything.

**How do you stop the model inventing skills?** A note must point at sentences in the stored transcript, by turn and sentence number; code renders the quote from the transcript, never from the model. A note whose reference does not resolve is dropped. The same holds for a rating: a level above the lowest without a sentence behind it becomes the lowest. The model's own wording is shown separately and labelled "Written by AI".

**How does matching work without scores?** A person relates to a need when one of their notes speaks to one of its requirements: the same ESCO skill, an essential skill of the occupation, or the phrase itself. That gives a yes or no and the pairs that explain it. Lists of picks are in no particular order, and a rotation rule makes sure the same few people are not shown every day. The job interview is separate: there the applicants are ordered, and the person asked for that.

**What about bias?** Names, age, gender, nationality, photo, the interview language and whether someone spoke or typed never reach a company before both sides agree to meet. An organiser does not see them either, except that the answers of a job interview are shown to the organiser as given, so their language is visible; sentences in which the person says something protected about themselves are hidden there too, by the same word lists. The model that rates a job interview never gets the name, the nickname, the interview language or the input mode. A sentence in which a person says something protected about themselves is left out of what the assessor reads, and a country or nationality word inside a work sentence is hidden. That screening is word lists in three languages and can miss an unusual phrasing; reasons are model-written and checked by word lists, with an organiser as the last check. Declared work languages reach companies as codes, never as the person typed them. Not built: a test that swaps names and languages and checks that picks do not change. For job interviews the language swap check exists: 296 of 324 levels stayed the same across languages and repeated ratings, no language was rated lower as such, and six levels moved by two (see "What the evaluation shows").

**Is it legal under the AI Act?** Recruitment is a high-risk use, and ranking applicants is squarely inside it. We designed as if the obligations apply now. What is there: information to the person before they start, human oversight of every suggestion and every ranked list, logging in the audit trail, the person's access to their own ratings and reasons, no emotion recognition. What is not: a conformity assessment, a fundamental rights impact assessment, and validation on real applicants. Espoo's lawyers would need to confirm the timeline.

**Could Espoo run this?** The job data comes from the website's own endpoints today; production needs the official Työmarkkinatori API, which Espoo as an employment authority can onboard to. The model can be any OpenAI-compatible endpoint, so it can move to the city's own provider. Before real people: a data protection impact assessment, the AI Act work above for the job interview, a native check of the Finnish and Swedish wording, and a second model provider.

**Where does my voice go?** To this server and nowhere else. The browser sends the audio a few seconds at a time; a speech model in its own container, with no route to the internet, turns it into text; the audio is dropped. Nothing about the voice is analysed, and neither audio nor whether someone spoke or typed is kept. It has been tested with recordings through a real browser, by mouse and by finger, but not yet with a real voice on a real phone.

**What breaks under load?** One model key allows 40 requests a minute for everything. That carries the demo and a couple of people at once, not a hall of judges together. Rating a job interview is one model call that starts the moment the person sends it (19.8 seconds on the live site in the test run); if it fails, a queued job tries again. The fix is configuration (a higher limit or a second provider), not code.

**What would you build next?** The event day (agenda and slots), the name-and-language swap test for picks, validating the rating scale and weights with employers, the organiser's "add a person" action, and email delivery of lists.

## Three sentences to end on

1. "The conversation scores nothing: the AI takes notes that point back to the person's own words, and the person approves their card before anyone sees it."
2. "One thing is rated, a job application, and only with the person's knowledge: the same requirements from the ad for everyone, a level for the evidence with a reason that points at their own sentences, and nobody removed by a rating."
3. "An Espoo organiser approves every suggestion and every ranked list, companies see no name and no original words until both sides say yes, every decision is in the audit log, the model is open-weight and served from Finland, and every person here except me is synthetic."
