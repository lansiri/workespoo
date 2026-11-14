# Demo script

Three minutes, live on `https://workespoo.aichat.fi`. Wording in quotation marks is what the screen says. Times are rough and assume typed or pasted answers.

There are three versions:

- **The three minutes** (the pitch): a short general interview, the card, then a job interview for the pitch company's job, the organiser's ranked list and the company's view of it.
- **Five minutes** (a booth, or a judge's question): the same, plus Daily Picks, an organiser's move with a reason, the mutual yes and the audit log.
- **The golden path by itself**: the earlier three minutes without the job interview. It is also the Playwright test `e2e/golden-path.spec.ts`, which runs it against a real deployment with the real model; it passed end to end in 1.5 minutes on 14 November.

The pitch company is **Demo company 03**: a real open Espoo posting for a technical specialist in digital systems and ERP, with the employer's name hidden. Its posting asks for fluent Finnish as a must-have while the work material is in English. In the golden path the Need Card turns that into a question to the employer; in the job interview it is one of the requirements asked about and rated, and the person stays on the list whatever the rating.

Its job already has four simulated applicants, rated by the real model when the demo world was built. The person on stage becomes the fifth. That list is what makes the job interview fit on stage: the audience sees a ranked list with reasons at once, and only one rating is made live.

## Before going on stage

1. Open `/organiser`, sign in with the passcode, press **Reset demo**, then **Yes, reset the demo**. It restores 15 simulated people, 8 demo companies and the simulated job applications (18 applications by 11 of the 15 simulated people: four at the pitch company's job, one to four at each of the others) from the snapshot in a few seconds, without calling a model, and makes new private links for the companies.
2. Open **Today's review**. Seven companies are listed with suggestions waiting; Demo company 03 is not there yet. That is intended: its list is drafted live (five-minute version and golden path).
3. Open **Applicants** in the organiser's menu, then Demo company 03's job. Four applicants, each tagged "Synthetic person", in order of points, with a level and a reason per requirement; the status says "Not approved yet".
4. Tabs, left to right:
   - **T1 Person**: the front page `/`, in English. Any current browser, a phone included, with the microphone allowed if you will speak; typing always works.
   - **T2 Organiser applicants**: Demo company 03's ranked list (`/organiser/applicants/...`, from step 3).
   - **T3 Organiser review**: `/organiser/review` (five-minute version).
   - **T4 Organiser audit**: `/organiser/audit` (five-minute version).
   The company's pages are opened from the organiser's tabs, with the links that approving and publishing produce.
5. Have the answers below ready to paste: three for the general interview, six for the job interview.

### The answers

General interview (Express, three questions):

1. "For the last four years I've worked at a machine shop as the person who looks after our ERP system. I set up new items and work orders, and I wrote Python scripts that move production data from the machines into the ERP every night."
2. "Last spring the stock numbers in the ERP kept drifting from what was on the shelves. I traced it to a scanner integration that dropped lines when two people scanned at once, rewrote the import with a queue, and added a SQL check that compares the counts every morning."
3. "Python and SQL every day, the ERP's own report builder, and Excel when the production planners want a quick view."

Job interview: pick the answer by what "What the ad asks for" marks as "Now". These are the answers `e2e/job-interview.spec.ts` gives, found the same way, by a word of the requirement.

| The requirement mentions | First answer | If a follow-up comes |
|---|---|---|
| Finnish | "I have not used Finnish at work yet. I am taking an evening course, and at the shop everything I do is in English." | "No, I have not done that at work." |
| English | "All the vendor documentation for our ERP and for the label printers is in English, and so are the support tickets. Last year I wrote the integration notes for the printer interface in English and the vendor's engineers worked from them." | "The vendor used my notes to fix a mapping error on their side, and the labels have printed correctly since March." |
| problem solving, working independently | "Last spring the stock numbers in the ERP kept drifting from the shelves. Nobody asked me to look, I traced it myself to a scanner integration that dropped lines when two people scanned at once, rewrote the import with a queue and added a morning check in SQL." | "After the rewrite the morning check showed no differences for eight weeks, and the planners stopped counting stock by hand on Mondays." |
| the overall process, the whole | "When we changed how work orders move through the shop I mapped the whole chain first, from the sales order in the ERP to the machine programs and the label printers. I drew it on one page with the planners, found two places where the same data was typed twice, and changed the work order flow so it is entered once." | "The double entry went away and a work order now reaches the machine about half a day sooner than before." |
| motivation, concrete results, production | "I sit next to the production planners, so I see the next morning whether a change helped. When I moved the nightly import to a queue I stood at the scanners for two shifts to watch it work, and I fixed the one screen the operators found slow the same week." | "The operators' scan errors dropped from a few every shift to none in the weeks I checked." |
| ERP, software, technical systems | "For four years I have looked after the ERP at a machine shop. I set up items and work orders, and I wrote the Python scripts that move production data from the machines into the ERP every night." | "I wrote and ran those scripts myself, and the nightly import has not missed a night since I added the retry in January." |

The Finnish answer is the honest gap on purpose: it shows that a plain "not yet" is rated as what it says, without comment, and that it removes nobody.

## The three minutes

What is cut from the golden path to make room: running and deciding Daily Picks, the Need Card's question about Finnish, the ask to meet with the mutual yes, and the audit log. The card's language field and the pool question are skipped too, and the person's own result page moves to the five-minute version. One spoken line in step 7 names Daily Picks; the five-minute version shows all of it.

These timings are not rehearsed. The card alone takes about 20 seconds after the last answer (26 at the 90th percentile), and step 5 holds up to six answers with their follow-ups; the Finnish "not yet" answer has no example, so it will likely draw one. If a rehearsal runs over, prepare steps 1 to 3 on T1 before going on stage, begin the three minutes at step 4 and say over it: "This person has already had the short conversation and approved their card."

| # | Time | Tab | Do | Say | What the audience sees |
|---|---|---|---|---|---|
| 1 | 0:00 (15 s) | T1 | Press **Start the conversation**. Tick "I agree to the interview and to my notes being stored" and "I understand this is a live demo". Leave **Express** chosen. Press start. | "Espoo's matchmaking events connect companies with international talent. CVs are written by AI and screened by AI, so nobody learns what a person can do. We replaced the CV form with a conversation." | The consent card: "The interviewer is an AI. It does not score you or judge your answers." No name is asked for. |
| 2 | 0:15 (45 s) | T1 | Paste the three general answers, one after the other, each after the interviewer's reply. | "This first conversation is not scored. It takes notes, and every note points at what the person said." | The sentences that became notes are marked in "You said", notes arrive under "Notes so far", and "Real open jobs" counts up. |
| 3 | 1:00 (20 s) | T1 | Press **Check my notes**. Use the wait for the card: "the person will now check every note". Point at one note, press **Approve my card**. | "The person approves their card before anything uses it." | "Preparing your notes…", then every note with the person's own words beside it, "Shown to companies as" labelled AI. |
| 4 | 1:20 (10 s) | T1 | Press **Apply for a job** in the header. On Demo company 03's job press **Apply with a job interview**. Point at the list on the start screen, tick the box, press **Start the job interview**. | "Now one job. Before anything starts, the person is told that this is rated." | "After you send your application, an AI rates your answers against each thing the ad asks for, and the applicants are put in order." and "An Espoo organiser reads your answers, checks that order and can change it before the company sees anything." The button stays disabled until the box is ticked. |
| 5 | 1:30 (45 s, not rehearsed) | T1 | Paste the first answer for each requirement marked "Now". If a follow-up comes, paste the second. | "The questions come from the ad, one per requirement, and every applicant is asked about the same requirements. The interviewer does not comment on an answer. For Finnish this person says plainly: not yet." | "What the ad asks for" on the right, each requirement going from "Waiting" to "Asked" to "Answered"; "Question 1 of N"; the words noted for the ad marked. No level is shown during the interview. |
| 6 | 2:15 (5 s) | T1 | Press **Look through my answers**, then **Send my application**. | "Nothing is rated until the person sends it." | "Your application was sent" and "Rating in progress…". |
| 7 | 2:20 (20 s) | T2 | Point at the four applicants. Press **Read their answers** on one. Reload: the fifth appears once rated (the rating starts when the application is sent: 12 to 18 s in the prompt lab, 20 s on the live site in the test run). Press **Approve this order for the company**. | "The organiser sees the four applicants who came before, each requirement with a level, a reason, and the applicant's own sentences behind it. Code computes the order from the levels. Nobody is removed by a rating. The organiser approves this order for the company as a whole, after reading it; Daily Picks are still approved one person at a time." | Positions, "N of M points", a level per requirement, "Rated by AI, from the person's answers. Not a quote."; after the reload the newcomer, tagged "Live demo: a real person". Then "Approved" with the time and "Open the company's page with the approved list". |
| 8 | 2:40 (20 s) | T2 → company | Press **Open the company's page with the approved list**. Say the three sentences below over it. | "The company sees the order and the reasons. No name and none of the person's words until both agree to meet." Then the three sentences. | "People who applied to your job with a job interview, in the order the organiser approved." Nicknames, levels and reasons, "Written by AI, not a quote", **Ask to meet**. |

The three minutes end after step 8. If there is time left, show the person's result:

| # | Time | Tab | Do | Say | What the audience sees |
|---|---|---|---|---|---|
| 9 | (15 s) | T1 | Reload the result page, then show the person's result. | "The person sees the same levels and reasons, and their place." | Per requirement the level with what it means, the reason marked "Written by AI", "Your own words this rests on", the points, and "You are number N of M on the list the company sees". **Withdraw my application** is always there. |

The result page stops updating once the rating is there, so the place on the list appears only after a reload.

## Five minutes

For a booth, or when a judge asks to see the rest. Steps 1 to 3 are the golden path's, then the job interview, then the parts the three minutes cut.

| # | Time | Tab | Do | Say | What the audience sees |
|---|---|---|---|---|---|
| 1 | 0:00 (15 s) | T1 | Consent and start, as in the three minutes. | The opening line. | The consent card. |
| 2 | 0:15 (40 s) | T1 | The three general answers. | "Not scored. Notes, each pointing at what the person said." | Notes and real open jobs appearing. |
| 3 | 0:55 (20 s) | T1 | **Check my notes**. Type "English" in "Languages you'd like to work in" and save. **Approve my card**, then **Yes, suggest me**. | "Nothing is chosen for the person: joining the pool is their own choice." | "Yours to approve". |
| 4 | 1:15 (30 s) | T3 | **Run today's picks now**, open **Demo company 03**. Remove one suggestion with a reason, approve the others one at a time, press **Publish to Demo company 03**. | "Daily Picks are in no particular order. There is no approve-all, and a removal needs a reason." | "In no particular order · listed A to Z by nickname", the newcomer among them, the removal dialog that cannot be confirmed without a reason. |
| 5 | 1:45 (15 s) | T1 | **Apply for a job**, Demo company 03, **Apply with a job interview**. Read point 2 aloud, tick, start. | "One thing is rated: a job application, and the person is told first." | The start screen. |
| 6 | 2:00 (50 s) | T1 | The job interview answers. Let one follow-up come if the interviewer asks one, and answer it. | "One question per requirement, at most one follow-up, the same requirements for everyone." | The room with "What the ad asks for". |
| 7 | 2:50 (10 s) | T1 | **Look through my answers**. Point at **Remove this answer**. **Send my application**. | "The person can remove any answer before sending. A removed answer leaves that requirement unanswered; the interview does not ask it again." | "Rating in progress…". |
| 8 | 3:00 (40 s) | T2 | Show the four, **Read their answers** on one. Reload for the fifth once rated (the rating starts when the application is sent: 12 to 18 s in the prompt lab, 20 s on the live site in the test run). On one applicant press **Move**, give a position and a reason, confirm. **Approve this order for the company**. | "The organiser can read the answers behind every rating. A move needs a written reason, which stays in the audit log; the company sees only that the organiser set the position." | "Position set by you", "Reason: …", then "Approved". The move cannot be confirmed without a reason. |
| 9 | 3:40 (20 s) | company | **Open the company's page with the approved list**. On the newcomer press **Ask to meet**, then **Send request**. | "The company decides whom to meet. The order is where it starts reading, not a decision." | The list, "Position set by the organiser" on the moved one, then the request shown as sent. |
| 10 | 4:00 (25 s) | T1 | Reload the result page, then show it: levels, reasons, own words, "You are number N of M". Then **My matches**: **Accept**, type "Alex Demo" and a contact, **Share and accept**. | "The person sees the same levels and reasons the company sees. The name is asked for only now." | "You both said yes". |
| 11 | 4:25 (10 s) | company | Reload. | "Only now the name and the person's own words." | "You both agreed to meet." with the name, the contact and the person's answers. |
| 12 | 4:35 (25 s) | T4 | Reload the audit log. Say the three sentences. | The three sentences. | The trail, newest first, including `ranking.approved`, `ranking.moved`, `application.assessed`, `application.submitted`, `application.started`, `digest.published`, `pick.approved`, `pick.removed`. |

To show the Need Card's question about Finnish as well, do it after step 9, while the company's page is open: go back to the company's overview, press **Open your need card** and continue as in step 7 of the golden path (about 15 seconds). Do not do it before the job interview: a changed Need Card is a new version, with its own questions and order, and the person on stage would no longer be asked what the four simulated applicants were asked. Making Finnish a nice-to-have changes the points at once (a must-have weighs 2, a nice-to-have 1); the organiser's page says the draft differs from the approved list, and the company keeps seeing the approved one until the organiser approves again.

## The golden path by itself

The earlier three minutes, without the job interview. The numbered steps are the Playwright test `e2e/golden-path.spec.ts`.

| # | Time | Tab | Do | What the audience sees |
|---|---|---|---|---|
| 1 | 0:00 | T1 | One line: "Espoo's matchmaking events connect companies with international talent. CVs are written by AI and screened by AI, so nobody learns what a person can do. We replaced the CV form with a conversation." Press **Start the conversation**. Tick "I agree to the interview and to my notes being stored" and "I understand this is a live demo". Leave **Express** chosen (three short questions). Press start. | The consent card: "The interviewer is an AI. It does not score you or judge your answers." The model is named: an open-weight model served from Finland. No name is asked for. |
| 2 | 0:15 | T1 | Answer the three general questions above. | The interviewer asks a follow-up about what was just said. After each answer the sentences that became notes are marked in "You said", notes arrive under "Notes so far", and "Real open jobs" counts up (39 after the first answer in rehearsal), each posting saying which skill it mentions. Nothing is scored. |
| 3 | 1:05 | T1 | Press **Check my notes**. Point at one note: the person's own words on the left, "Shown to companies as" on the right, labelled AI. Under "What you're looking for", type "English" in "Languages you'd like to work in" and save. Press **Approve my card**, then choose **Yes, suggest me**. | "Yours to approve". Every note points at the person's own sentence. Nothing is chosen for the person: the pool question is unanswered until they answer it. |
| 4 | 1:25 | T3 | "Now the organiser's seat." Press **Run today's picks now**, then open **Demo company 03** in the list on the left. | Within about ten seconds: "Done: 8 digests …", and Demo company 03 with five suggestions (four simulated people and the newcomer), "In no particular order · listed A to Z by nickname". One of them is the handle of the card approved a moment ago, tagged "Live demo: a real person"; the others are tagged "Synthetic person". Each has reasons that pair the card with a sentence of the posting, and "Not mentioned in the conversation". |
| 5 | 1:40 | T3 | Remove one suggestion: **Remove**, choose "The reasons do not hold up when I read the card", **Confirm**. Approve the others one at a time, your own included. Say: "There is no approve-all, and a removal needs a reason." Press **Publish to Demo company 03**. | "One person at a time. No approve-all." The removal dialog cannot be confirmed without a reason. After publishing: "Sent to the company's private link." with the link. |
| 6 | 2:00 | T3 → company | Open the company's link. | "Demo company 03. Based on a real public posting. The employer's name is hidden." People with nicknames, no names, no numbers; "Written by AI from this person's own words and approved by them. Not a quote, not a verified fact."; "Not mentioned does not mean missing." |
| 7 | 2:10 | company | Press **Open your need card**. Scroll to **Fluent Finnish**. Read the question aloud, then press **Make it nice-to-have**. | "Is Finnish needed from day one, or could someone start in English and build up Finnish on the job?" and under it the evidence: "3 of 5 people in the pool whose cards relate to this role speak to this. A hard filter on it would set aside 2. They did not mention it in a short conversation; that does not mean they lack it. No filter is applied." Then: "You made this a nice-to-have." (The numbers follow the pool: 3 of 4 and 1 after a reset, 3 of 5 and 2 once the English-only newcomer of step 3 is in it.) |
| 8 | 2:25 | company | Go back, find your own handle, press **Ask to meet**, then **Send request**. | "Their name stays hidden unless they accept." Then the request is shown as sent. |
| 9 | 2:35 | T1 | Open **My matches**. Press **Accept**, type "Alex Demo" and a contact, press **Share and accept**. | "Demo company 03 would like to meet you." "Your name stays hidden unless you accept." The name is asked for only now. Then: "You both said yes". |
| 10 | 2:45 | company | Reload. | "You both agreed to meet." with the name, the contact and, next to each reason, the person's own words, "Shown to you after you both agreed". |
| 11 | 2:50 | T4 | Reload the audit log. Say the three sentences below. | The trail, newest first: `identity.revealed`, `intro.accepted`, `intro.requested`, `needcard.question_answered`, `digest.published`, `pick.approved`, `pick.removed`, `pick.drafted`. |

If time is short, stop after step 9 and say the three sentences over the "You both said yes" screen.

A setting worth knowing: the product does not suggest one person to more than three companies a day, so that a few broad profiles do not fill every list. In the demo event that cap is set to the number of companies (8). Otherwise a newcomer who relates to four companies is left off whichever list is drafted last, and that is the pitch company's.

## Three sentences on responsible AI (say them at the end)

1. "The conversation scores nothing: the AI takes notes that point back to the person's own words, and the person approves their card before anyone sees it."
2. "One thing is rated, a job application, and only with the person's knowledge: the same requirements from the ad for everyone, a level for the evidence with a reason that points at their own sentences, and nobody removed by a rating."
3. "An Espoo organiser approves every suggestion and every ranked list, companies see no name and no original words until both sides say yes, every decision is in the audit log, and every person here except me is synthetic."

## When something goes wrong

| What happens | What to do |
|---|---|
| The microphone or the hall is hopeless | Type the same answers. Voice changes nothing downstream, and nothing records whether a person spoke or typed. The assessor of a job interview is never told either. |
| A spoken answer comes out wrong | Names and rare words are sometimes misheard. In the general conversation, remove that answer on the left and say or type it again. In a job interview an answer can be removed, but the interview does not go back to a question already passed: a removed answer leaves that requirement unanswered unless another answer of the person still speaks to it. |
| Holding the button does nothing the first time | The browser asked for the microphone and the press was lost to that question. Allow it and hold again. |
| The interviewer asks a plain scripted question | The model did not answer inside six seconds and the interview went on without it. Keep answering; the notes still come. |
| Notes or the card take long | The card takes 15 to 30 seconds after the last answer. Use the wait: "the person will now check every note before anyone sees it". "Check my notes" appears next to "Preparing your notes…". |
| **Start the job interview** takes several seconds | The questions for this job and language are being worded for the first time (4 to 12 seconds); every later applicant gets the same stored questions. Read point 1 of the start screen over it. If the model fails, the scripted question for each requirement is used and the interview starts anyway. |
| The job interview moves on without a follow-up | Deciding on a follow-up takes about a second; when the call fails or is late, the interview moves on. Carry on: the assessment reads the answer itself. |
| The rating takes long after **Send my application** | One assessment took 12 to 18 seconds in the prompt lab and 20 seconds on the live site in the test run. It starts the moment the application is sent; a failed call is tried again by a queued job after 45 seconds. The person's page says "An AI is now rating your answers against each thing the ad asks for. This page updates by itself when the ratings are ready." Go to T2 and show the four rated applicants and one person's answers; the list says "1 sent and still being rated. They are not on the list yet." If the fifth is not there after half a minute, approve the list of four, open the company's page, and say that the newcomer joins the draft when rated and the company sees it after the next approval. |
| The model provider is down | Nothing new can be interviewed or rated. The organiser's list of the four simulated applicants works without any live model call: read their answers, move one with a reason, approve, open the company's page. For Daily Picks, open any of the seven other companies in the review queue, decide, publish, open the link. If that is not enough, play the backup video ([[VIDEO]]). |
| Step 4 shows reasons in plainer words | The model was slow and code wrote the reasons ("The card describes …, which relates to …"). Carry on. |
| Someone in the audience used the site and the lists look different | Reset the demo (step 1 of "Before going on stage"). It takes a few seconds, and it restores the four simulated applicants. |
| Demo company 03 already has a list of picks before you ran them | The worker drafts every company's list by itself once a day (06:00 Helsinki time), and it got there first. Reset the demo: after a reset on the same day it stays undrafted until you press the button. |

## Running it as a test

```
E2E_BASE_URL=https://workespoo.aichat.fi E2E_ORGANISER_PASSCODE=... npx playwright test golden-path
E2E_BASE_URL=https://workespoo.aichat.fi E2E_ORGANISER_PASSCODE=... npx playwright test job-interview
```

- Both tests reset the demo first and, unless `E2E_KEEP=1`, again at the end. They type the answers, wait like a person between them, and check every screen by test id (`docs/ROUTES.md`).
- `golden-path` fails when any request on the path answers with a server error, when the new person is not on the pitch company's list, when the Finnish question or its pool evidence is missing, when the name shows before both sides agreed, or when a step of the audit trail is missing.
- `job-interview` runs the five-minute journey without Daily Picks: a general interview and an approved card, the event's jobs, the start screen that says the answers are rated and checked by an organiser, a job interview of one to six requirements with at most one follow-up each, review and sending, the person's own levels and points (and no position before an approval), the organiser's list with every simulated applicant plus the newcomer and the person's own words behind a rating, a move that cannot be confirmed without a reason, approval, the company's list in order with no name and none of the person's words, ask to meet, the person's position and their yes, and only then the name and the answers on the company's page. It fails on any server error and when a step of the audit trail (`application.started`, `application.submitted`, `application.assessed`, `ranking.moved`, `ranking.approved`) is missing. It allows itself 15 minutes, most of it the model. It passed against the live site on 14 November at 15:39 in 1.6 minutes.
- `E2E_CHROMIUM_PATH` points them at a locally installed Chromium when Playwright's own download does not match.
- Without `E2E_ORGANISER_PASSCODE` both are skipped, so the ordinary check never touches a live site.
