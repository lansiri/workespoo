# Demo script

Three minutes, live on `https://workespoo.aichat.fi`. The numbered steps are also the Playwright golden-path test (`e2e/golden-path.spec.ts`): each "Must be visible" cell is an assertion. Pitch company: **Demo company 03** (data engineer need with a must-have Finnish requirement, `synthetic-world.md` 4).

## Before going on stage

1. "Reset demo" in organiser settings (restores the snapshot, `synthetic-world.md` 5). Confirm the review queue shows "Demo company 03: not drafted".
2. Open four browser tabs, left to right:
   - **T1 Talent**: landing page (laptop; microphone allowed; text fallback ready).
   - **T2 Organiser**: `/organiser/review`, logged in.
   - **T3 Company**: Demo company 03's signed link `/c/{token}`.
   - **T4 Organiser audit**: `/organiser/audit`, filter `subject` empty.
3. Presenter's talent identity for the reveal: name "Alex Demo", typed at consent.

## The three minutes

| # | Time | Tab, actor | Do | Must be visible |
|---|---|---|---|---|
| 1 | 0:00 | T1, presenter | One line: "Espoo's TalentMatch events connect companies with international talent. Companies describe needs too late and doubt the pool has anyone; organisers can't judge real capability from CVs." Click **Start the express interview**, tick consent, enter "Alex Demo", tick "Add me to the event pool". | Consent text; "You are talking to an AI. It takes notes; it does not grade you." |
| 2 | 0:15 | T1, presenter | Answer 3 questions (voice, or type if the hall is loud). Script: (1) "I build data pipelines in Python that load sensor data into a database every night." (2) "I write SQL checks so the morning report has no gaps, and I present the numbers to the operations team every week." (3) "I'm looking for data engineering work, in English, and I'm learning Finnish." | Skill chips appear while answering (Python, SQL, data pipelines); "jobs lit" counter rises above 0 |
| 3 | 1:00 | T1, presenter | Card review: point at one skill and its "your words" reference. Click **Approve my card**. | Each skill shows the person's sentence, no levels; after approval, the job feed shows real postings with real employer names, "Source: Työmarkkinatori", one reason per job and "Not mentioned in your conversation: …" |
| 4 | 1:15 | T2, presenter | "Now the organiser's seat." Click **Run today's picks now**. | Within 20 s, "Demo company 03" group appears with picks, labelled "In no particular order"; one pick shows handle of the new card (Alex's handle) with reasons citing Python and SQL and "Not mentioned: Fluent Finnish …" |
| 5 | 1:30 | T2, presenter | Keyboard: `a` on the first pick (approve). On a second pick press `r`, `1` (The reasons do not hold up), `Enter`. `a` on each remaining pick, one at a time, including Alex's. Say: "Every pick is approved one by one; there is no approve-all, and a removal needs a reason." Press `p`. | Each decision updates the item; the removal dialog with reason codes; "Published" on the Demo company 03 group |
| 6 | 2:00 | T3, presenter | Reload. Point at the banner. Scroll to the Finnish requirement. | Banner "Demo company 03. Based on a real public posting. The employer's name is hidden."; question "Is Finnish needed from day one, or could someone start in English and build up Finnish on the job?"; pool evidence "{x} of {y} people in the pool whose cards relate to this role speak to this. A hard filter on it would set aside {z}. … No filter is applied." |
| 7 | 2:15 | T3, presenter | Click **Make it nice-to-have**. Scroll to picks; on Alex's pick click **Ask to meet**, then **Send request**. | Requirement kind now "Nice-to-have"; picks show no names, no numbers, "Not mentioned does not mean missing"; button changes to "Request sent" |
| 8 | 2:30 | T1, presenter | Open **My matches** (or the notification). Click **Accept**. | "Demo company 03 would like to meet you about Data engineer. Your name stays hidden unless you accept."; after accept: "You both said yes" with a slot "Thu 26 Nov, 13:00, Table 03" |
| 9 | 2:40 | T3, presenter | Reload. | Reveal block: "Alex Demo", "In their own words:" Alex's original sentence, labelled "Shown to you after you both agreed" |
| 10 | 2:45 | T4, presenter | Reload audit, filter by Alex's pick. Say the three sentences (below). | Trail: `pick.drafted`, `pick.approved`, `digest.published`, `needcard.question.answered`, `intro.awaiting_talent`, `intro.accepted`, `agenda.assigned` |

If the live model is slow at step 4, code-rendered reasons appear first ("The card describes Python data pipelines, which relates to Python programming.") and the step still passes. If voice fails at step 2, type the same answers.

## Three sentences on responsible AI (say verbatim at step 10)

1. "Nothing about a person is scored or ranked: the AI only takes notes that point back to the person's own words, and the person approves their card before anyone sees it."
2. "Every pick is approved one by one by an Espoo organiser, must-haves never filter anyone out, and companies see no name, language or original words until both sides say yes."
3. "Requirements come back to employers as questions with real pool evidence, every decision is in this audit log, the models are open-weight, and every person here except me is synthetic."

## Silent backup video (shot list)

Recorded by Playwright from this script against the frozen deploy, 1280×720, captions burned in as an overlay bar at the bottom. Target 2:50.

| Shot | Length | Screen | Caption |
|---|---|---|---|
| 1 | 8 s | Landing | "Espoo TalentMatch: matching companies and international talent. Prototype with synthetic people." |
| 2 | 35 s | Express interview, chips and jobs counter rising | "A one-minute AI conversation instead of a CV form. The AI takes notes; it never grades." |
| 3 | 15 s | Card review, zoom on one skill's own-words reference, approve | "Every skill points back to the person's own words. The person approves the card." |
| 4 | 12 s | Job feed | "Real open jobs in Espoo, with the real employer and a link to apply." |
| 5 | 30 s | Organiser review: run picks, approve, remove with reason, approve, publish | "An Espoo organiser approves every pick one by one. No approve-all. Removals need a reason." |
| 6 | 20 s | Company page: banner, Finnish question, pool evidence, make nice-to-have | "Requirements become questions to the employer, with evidence from the pool. No filter is applied." |
| 7 | 15 s | Picks, ask to meet | "Companies see what the person did, not who they are. 'Not mentioned' is not 'missing'." |
| 8 | 15 s | Talent accepts; company reveal; slot | "Names are revealed only when both sides say yes. A meeting slot is booked." |
| 9 | 10 s | Audit log trail | "Every step is logged." |
| 10 | 10 s | Static agenda page on a phone frame | "Event-day agendas are static pages: nothing crashes at opening time." |

## Playwright notes

- Step 2 uses text input in CI (fake microphone only in the dedicated voice test).
- Assertions use roles and the exact strings above; numbers in step 6 are matched with `/\d+ of \d+ people in the pool/`.
- The test runs on a freshly reset demo and ends by resetting again.
- Fails the build if step 4 takes over 30 s or any page in the path returns an error.
