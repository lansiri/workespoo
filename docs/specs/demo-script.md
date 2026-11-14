# Demo script

Three minutes, live on `https://workespoo.aichat.fi`. The numbered steps are also the Playwright golden-path test (`e2e/golden-path.spec.ts`), which runs them against a real deployment with the real model; it passed end to end in 1.5 minutes on 14 November. Wording in quotation marks is what the screen says.

The pitch company is **Demo company 03**: a real open Espoo posting for a technical specialist in digital systems and ERP, with the employer's name hidden. Its posting asks for fluent Finnish as a must-have while the work material is in English, which is what step 7 turns on.

## Before going on stage

1. Open `/organiser`, sign in with the passcode, press **Reset demo**, then **Yes, reset the demo**. It restores 15 simulated people and 8 demo companies from the snapshot in a few seconds, without calling a model, and makes new private links for the companies.
2. Open **Today's review**. Seven companies are listed with suggestions waiting; Demo company 03 is not there yet. That is intended: its list is drafted live in step 4.
3. Tabs, left to right:
   - **T1 Person**: the front page `/`, in English. In Chrome, with the microphone allowed, if you will speak; typing always works.
   - **T2 Organiser**: `/organiser/review`.
   - **T3 Organiser audit**: `/organiser/audit`.
   The company's page is opened from T2 in step 6, with the link that publishing produces.
4. Have the three answers below ready to say or paste.

## The three minutes

| # | Time | Tab | Do | What the audience sees |
|---|---|---|---|---|
| 1 | 0:00 | T1 | One line: "Espoo's matchmaking events connect companies with international talent. CVs are written by AI and screened by AI, so nobody learns what a person can do. We replaced the CV form with a conversation." Press **Start the conversation**. Tick "I agree to the interview and to my notes being stored" and "I understand this is a live demo". Leave **Express** chosen (three short questions). Press start. | The consent card: "The interviewer is an AI. It does not score you or judge your answers." The model is named: an open-weight model served from Finland. No name is asked for. |
| 2 | 0:15 | T1 | Answer three questions. (1) "For the last four years I've worked at a machine shop as the person who looks after our ERP system. I set up new items and work orders, and I wrote Python scripts that move production data from the machines into the ERP every night." (2) "Last spring the stock numbers in the ERP kept drifting from what was on the shelves. I traced it to a scanner integration that dropped lines when two people scanned at once, rewrote the import with a queue, and added a SQL check that compares the counts every morning." (3) "Python and SQL every day, the ERP's own report builder, and Excel when the production planners want a quick view." | The interviewer asks a follow-up about what was just said. After each answer the sentences that became notes are marked in "You said", notes arrive under "Notes so far", and "Real open jobs" counts up (39 after the first answer in rehearsal), each posting saying which skill it mentions. Nothing is scored. |
| 3 | 1:05 | T1 | Press **Check my notes**. Point at one note: the person's own words on the left, "Shown to companies as" on the right, labelled AI. Under "What you're looking for", type "English" in "Languages you'd like to work in" and save. Press **Approve my card**, then choose **Yes, suggest me**. | "Yours to approve". Every note points at the person's own sentence. Nothing is chosen for the person: the pool question is unanswered until they answer it. |
| 4 | 1:25 | T2 | "Now the organiser's seat." Press **Run today's picks now**, then open **Demo company 03** in the list on the left. | Within about ten seconds: "Done: 8 digests …", and Demo company 03 with four suggestions, "In no particular order · listed A to Z by nickname". One of them is the handle of the card approved a moment ago, tagged "Live demo: a real person"; the others are tagged "Synthetic person". Each has reasons that pair the card with a sentence of the posting, and "Not mentioned in the conversation". |
| 5 | 1:40 | T2 | Remove one suggestion: **Remove**, choose "The reasons do not hold up when I read the card", **Confirm**. Approve the others one at a time, your own included. Say: "There is no approve-all, and a removal needs a reason." Press **Publish to Demo company 03**. | "One person at a time. No approve-all." The removal dialog cannot be confirmed without a reason. After publishing: "Sent to the company's private link." with the link. |
| 6 | 2:00 | T2 → company | Open the company's link. | "Demo company 03. Based on a real public posting. The employer's name is hidden." People with nicknames, no names, no numbers; "Written by AI from this person's own words and approved by them. Not a quote, not a verified fact."; "Not mentioned does not mean missing." |
| 7 | 2:10 | company | Press **Open your need card**. Scroll to **Fluent Finnish**. Read the question aloud, then press **Make it nice-to-have**. | "Is Finnish needed from day one, or could someone start in English and build up Finnish on the job?" and under it the evidence: "2 of 4 people in the pool whose cards relate to this role speak to this. A hard filter on it would set aside 2. They did not mention it in a short conversation; that does not mean they lack it. No filter is applied." Then: "You made this a nice-to-have." (The numbers follow the pool: 2 of 3 and 1 after a reset, 2 of 4 and 2 once the English-only newcomer of step 3 is in it.) |
| 8 | 2:25 | company | Go back, find your own handle, press **Ask to meet**, then **Send request**. | "Their name stays hidden unless they accept." Then the request is shown as sent. |
| 9 | 2:35 | T1 | Open **My matches**. Press **Accept**, type "Alex Demo" and a contact, press **Share and accept**. | "Demo company 03 would like to meet you." "Your name stays hidden unless you accept." The name is asked for only now. Then: "You both said yes". |
| 10 | 2:45 | company | Reload. | "You both agreed to meet." with the name, the contact and, next to each reason, the person's own words, "Shown to you after you both agreed". |
| 11 | 2:50 | T3 | Reload the audit log. Say the three sentences below. | The trail, newest first: `identity.revealed`, `intro.accepted`, `intro.requested`, `needcard.question_answered`, `digest.published`, `pick.approved`, `pick.removed`, `pick.drafted`. |

If time is short, stop after step 9 and say the three sentences over the "You both said yes" screen.

## Three sentences on responsible AI (say them at the end)

1. "Nothing about a person is scored or ranked: the AI only takes notes that point back to the person's own words, and the person approves their card before anyone sees it."
2. "Every suggestion is approved one by one by an Espoo organiser, must-haves never filter anyone out, and companies see no name and no original words until both sides say yes."
3. "Requirements come back to employers as questions with evidence from the pool, every decision is in this audit log, the model is open-weight and served from Finland, and every person here except me is synthetic."

## When something goes wrong

| What happens | What to do |
|---|---|
| The microphone or the hall is hopeless | Type the same answers. Voice changes nothing downstream, and nothing records whether a person spoke or typed. |
| The interviewer asks a plain scripted question | The model did not answer inside six seconds and the interview went on without it. Keep answering; the notes still come. |
| Notes or the card take long | The card takes 15 to 30 seconds after the last answer. Use the wait: "the person will now check every note before anyone sees it". "Check my notes" appears next to "Preparing your notes…". |
| Step 4 shows reasons in plainer words | The model was slow and code wrote the reasons ("The card describes …, which relates to …"). Carry on. |
| The model provider is down | Nothing new can be interviewed. Show the simulated people instead: open any of the seven other companies in the review queue, decide, publish, open the link. If that is not enough, play the backup video. |
| Someone in the audience used the site and the lists look different | Reset the demo (step 1 of "Before going on stage"). It takes a few seconds. |
| Demo company 03 already has a list before you ran the picks | The worker drafts every company's list by itself once a day (06:00 Helsinki time), and it got there first. Reset the demo: after a reset on the same day it stays undrafted until you press the button. |

## Running it as a test

```
E2E_BASE_URL=https://workespoo.aichat.fi E2E_ORGANISER_PASSCODE=... npx playwright test golden-path
```

- The test resets the demo first and, unless `E2E_KEEP=1`, again at the end. It types the answers, waits like a person between them, and checks every screen above by test id (`docs/ROUTES.md`).
- It fails when any request on the path answers with a server error, when the new person is not on the pitch company's list, when the Finnish question or its pool evidence is missing, when the name shows before both sides agreed, or when a step of the audit trail is missing.
- `E2E_CHROMIUM_PATH` points it at a locally installed Chromium when Playwright's own download does not match.
- Without `E2E_ORGANISER_PASSCODE` the test is skipped, so the ordinary check never touches a live site.
