# Amendments to the plan

Adopted on 2026-11-13 after an independent review of `PLAN.md`. Where this file and `PLAN.md` disagree, this file wins.

## Build organisation

- **Four build streams, not six.** S1 interview engine and card review; S2 demand (ingestion, Need Cards, requirement questions); S3 matching, picks, organiser queue, opt-in, agenda; S4 voice client, then the synthetic world and evaluations once S1's first cut is merged.
- **Vertical slices.** Each stream owns `src/features/<name>/`, its API routes and its unstyled pages. Phase 2 pages are the real routes and hooks without styling; Phase 3 styles them. Ownership table: `CLAUDE.md`.
- **Trust primitives move into Phase 1** and are lead-owned in `src/lib`: session, consent, audit, redaction, queue, SSE helper.
- **Fixtures first.** Phase 1 ends with hand-written fixture Signal Cards, Need Cards and a snapshot of real postings, so no stream waits on another. The demo script exists as a Playwright test from Phase 1 and starts out failing.
- **Only the lead** generates migrations, adds dependencies, merges and deploys. Streams merge at least every two hours.
- **Model calls are recorded and replayed** in tests, so subagents can test without keys.
- **Simple queue**: a `job_queue` table polled with `FOR UPDATE SKIP LOCKED`. No queue library.
- **No embeddings.** Matching uses ESCO links, trigram and full-text search, then a model pass for reasons.
- Freeze deploys three hours before judging. Record a backup video of the golden path with Playwright.

## Product and responsible-AI changes

- **No levels on skills.** The card shows each skill with the person's words and nothing that reads as a grade.
- **The interviewer elicits and takes notes.** It never evaluates, praises ability or comments on emotion, and it says it is an AI at the start.
- **Evidence by reference.** The model cites turn and sentence numbers; code renders the transcript text. The person can correct the transcript before approving the card.
- **Companies see a labelled English rendering** of the evidence. Original quotes, interview language and whether the person spoke or typed stay hidden until both sides opt in.
- **Must-haves never filter anyone out.** They are shown as "not mentioned" rather than used to exclude. The requirement meter shows what a hard filter would exclude; no filter is applied.
- **Picks are unordered** and rotate. The organiser sees the whole pool and a queue of people with no picks, approves or removes each pick individually with a logged reason, and has no "approve all".
- **Anyone can ask to meet a company themselves**, with an evidence-backed reason and a daily cap.
- **Requirement flags are phrased as questions** to the company, never as verdicts. Some requirements are statutory.
- **Company side of the demo uses masked employers** ("based on a real public posting, employer name hidden"). The talent-facing job feed shows real public postings with source attribution and a link.
- **Pool evidence per need**: an anonymous count of how many people in the pool have spoken about each requirement. This answers "is there anyone relevant in the city's pool".
- **Live demo sessions are real personal data**: explicit consent, kept out of the shared pool unless the person opts in, purged after 24 hours.
- **Personas are generated from the real job mix**, with counterfactual twins (same content, different name and interview language) so invariance of cards and picks is one reportable number.
- **Express interview mode**: three questions in about a minute, for the pitch.

## Order of cuts

1. First: The Hub and Work in Finland ingesters, more than 15 personas, languages beyond English and Finnish.
2. Second: CV seed, Need Card editor, agenda beyond a static page.
3. Third: spoken replies (keep speech in, text out), the constellation reduced to a chip cloud.

Never cut: the full loop on the live URL, the organiser console (it is the judges' own seat), requirement questions with pool counts, the person's edit-and-approve step with its audit trail, the backup video.
