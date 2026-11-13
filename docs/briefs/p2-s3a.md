# Second pass, S3a: matching and the person's job feed

Paths: `src/features/matching/**`, `src/app/api/matches/**`, `src/app/(talent)/matches/**`. Specs: `docs/specs/matching.md`, `docs/specs/prompts/match-reasons.md`, and `docs/specs/prompts/PATCHES.md` for the patches named below.

The key the product runs on allows 40 model requests a minute for everything. Today one person's feed asks for 12 reason calls and up to 12 Need Card drafts. Block A makes the feed appear at once and spend far less.

## Block A: a feed that appears at once and costs little

1. Two steps. Step one stores the feed with code-written reasons only and no model call, so `/matches` shows postings within a second of the card being approved. Step two words the reasons of the top postings with the model and stores them again. The payload of `GET /api/matches` says whether step two is still running (`refining: boolean`), and the page polls every two seconds while it is, without moving items around under the person's eyes: only reason text changes.
2. Budget: `REASON_TOP_POSTINGS` becomes 5. A Need Card draft is requested (`needs.draft`, `companyId: null`) only for the top 3 postings without one. Pass `deadlineMs: 20000` on the reason call; a failed or late call keeps the code-written reasons.
3. **MR-1 and MR-2** in the reason prompt. Both edit rule 3; apply both.
4. Finding match-reasons-F4: a reason must rest on a real link: a Need Card requirement the person touches, an ESCO concept shared by the signal and the posting, or a posting sentence that contains the signal's label as a whole phrase. A single shared word is not a link. A posting with no real link gets no reason line (the page shows how it was found and nothing more) instead of a forced one. The model may return an empty list.
5. Replace the local judgement-word pattern with `findReasonJudgement` from `src/lib/lexicon.ts` wherever the two overlap.

## Block B: review leftovers

6. Until a posting has a Need Card, its "not mentioned" list is unknown: show the line "Requirements not read yet" (three languages) instead of an empty list. When a Need Card arrives for a posting that is in people's feeds (`matching.need_changed` for a card with no company), refresh "not mentioned" for those matches without a new reason call.
7. Leaving the pool (`matching.card_approved` after an opt-out): delete the person's eligibility rows and enqueue `needs.recompute_pool` for each need they were counted in. Opting back in recomputes them. Tests for both directions.
8. On the matches page, an introduction that was not approved shows a plain label for its reason code in three languages (today the code itself may show). Never show the organiser's note.

## Not now

Talent-initiated requests, agenda slots, a notifications inbox.
