# Picks and introductions

Owner: stream S3 (`src/features/picks/`, `src/app/api/picks/`, `src/app/(organiser)/`, `src/app/(talent)/matches/`). Prompt: `prompts/picks-draft.md`. Depends on: `need-card.md`, `matching.md`. Screens: `organiser-console.md`, `company-view.md`.

Times are Europe/Helsinki. "Today" means the Helsinki calendar date.

## 1. The daily job

Queue job kind `daily.run`, payload `{eventId, date}`, enqueued at `settings.dailyRunAt` (default 06:00) and by the organiser's "Run now" button. Idempotency key `daily:{eventId}:{date}`: a second enqueue for the same key while one is pending or running is ignored.

| Step | Queue kind | What | Idempotent because |
|---|---|---|---|
| 1 | `jobs.ingest` (S2) | Fetch new and changed postings; mark vanished ones `active = false` | Upsert on `(source, sourceId)` |
| 2 | `needcard.stale` | Need Cards whose job is inactive or expired → `stale` | Status update only |
| 3 | `needcard.draft` | Participating companies without a Need Card for their posting → draft | Unique `(companyId, jobId)` |
| 4 | `eligibility.compute` | For every non-stale Need Card × pool person: write `eligibility` rows (`matching.md` 3.2) | Primary key `(needCardId, needCardVersion, talentId)`; upsert |
| 5 | `pool.recompute` | Pool evidence on every non-stale Need Card | Overwrites `requirement.pool` |
| 6 | `digest.draft` | Per participating company: create today's draft digest and select picks (section 2) | Unique `(companyId, date)`; see rule below |
| 7 | `picks.reasons` | Model reasons for picks without reasons (`prompts/picks-draft.md`), concurrency 4 | Skips picks that have reasons |
| 8 | `talent_requests.attach` | Approved-but-unattached talent requests → picks in today's draft (section 5) | Unique `(digestId, talentId)` |
| 9 | `unmatched.refresh` | Rebuild the unmatched queue (section 4) | Full rebuild |
| 10 | `agenda.assign` | Assign slots for new accepted intros; regenerate affected static pages (section 7) | Existing assignments never move |

Steps run in order; a step failure stops later steps and is shown on the console ("Last run: failed at step 6, {error}"). Retry resumes from the failed step.

Rule for step 6 on re-run: if today's digest exists and **no pick in it has a decision**, delete its picks and re-select (same seed, so normally the same result). If any pick has a decision, leave the digest untouched. A published digest is never changed.

The console's "Run today's picks now" button enqueues `daily.picks` = steps 4–9 only (no ingestion, no agenda), same idempotency rules, key `picks:{eventId}:{date}:{n}`. It must finish in under 20 seconds for 8 companies and 15 personas; model reasons that are still pending show code-rendered reasons and swap in when ready.

Card approval and pool opt-in also enqueue steps 4, 5 for that person only (debounced 10 s), so a new card counts in pool evidence within seconds. They do not draft picks; "Run now" does.

## 2. Digest contents

One digest per participating company per day, `status: draft` until the organiser publishes it.

- For each non-stale Need Card of the company: up to `k` picks selected as in `matching.md` 3.3.
- Plus picks from approved talent requests (section 5) and organiser manual additions.
- Each pick: `reasons[]` (2–3), `notMentioned[]`, `origin`, `selection`, `needCardVersion`, `cardVersion`, `status: suggested`.
- If a Need Card has no eligible people, the digest records `emptyNeeds: [needCardId]` and the company page says "Nobody in the pool relates to this need yet" with the whole-pool evidence.
- A company with zero picks in total still gets a digest (it carries the Need Card and its questions).
- Audit: `digest.drafted {digestId, seed}` once per digest, and `pick.drafted {pickId, needCardId, origin, selection}` per pick (`actor: agent:analyst` for agent picks).

## 3. Organiser decisions

Every pick is decided one at a time. There is no bulk action anywhere in the UI or the API: the decision endpoint takes exactly one `pickId`; a request with an array is rejected with 400.

| Decision | Required input | Effect | Audit `action`, `detail` |
|---|---|---|---|
| Approve | none | `status: approved`, `decidedBy`, `decidedAt` | `pick.approved` `{pickId, digestId, needCardId}` |
| Remove | `reasonCode` + `note` (note required for `other`, max 300) | `status: removed` | `pick.removed` `{pickId, reasonCode, note}` |
| Edit reason text | new text (same checks as the prompt output) | replaces `reasons[i].text`; keeps the references | `pick.reason_edited` `{pickId, index, before, after}` |
| Add manually | `talentId`, `needCardId`, `note` (≥ 20 chars), at least one `(requirementId, signalId)` pair chosen from the person's card | new pick, `origin: organiser`, `status: approved`, reasons rendered by code from the chosen pairs | `pick.added_manual` `{pickId, note, pairs}` |
| Undo | within 10 minutes and before publish | back to `suggested` | `pick.decision_undone` `{pickId, previous}` |
| Publish digest | all picks decided; ≥ 0 approved | `digest.status: published`, `publishedBy`, `publishedAt`; notifications (section 8) | `digest.published` `{digestId, approved: n, removed: m}` |

Remove `reasonCode` values (exact labels):

| Code | Label |
|---|---|
| `evidence_thin` | The reasons do not hold up when I read the card |
| `already_in_contact` | Already in contact with this company |
| `duplicate` | Same person already picked for another need of this company |
| `person_asked` | The person asked not to be suggested here |
| `other` | Other (write why) |

A note that matches the protected-attribute lint (`need-card.md` 6.3) shows a warning "Decisions must not rest on personal characteristics" and requires a second confirmation; both the warning and the confirmation are logged.

Manual additions bypass eligibility (a human judgement), but not exclusions 1–3 of `matching.md` 3.2.

## 4. Unmatched queue

People in the pool who have had no approved pick in the last 7 days and have no open or accepted intro, minus snoozed ones. Each row carries one cause:

| Cause | Definition |
|---|---|
| `no_eligible_need` | Not eligible for any non-stale Need Card |
| `eligible_not_drafted` | Eligible for ≥ 1 Need Card, never drafted in 7 days (rotation or cap) |
| `drafted_removed` | Drafted in 7 days, every such pick removed |

Organiser actions from a row:

| Action | Input | Effect | Audit |
|---|---|---|---|
| Suggest to a company | as "Add manually" in section 3 | pick in that company's draft digest (created if missing) | `pick.added_manual` |
| Note a demand gap | skill area text (or ESCO URI) + optional note | `pool_note {kind: gap}`; aggregated in the pool view | `pool.gap_noted` |
| Snooze | `until` (max 14 days) + reason (≥ 10 chars) | hidden until the date | `unmatched.snoozed` |
| Send a card tip | preset tip | notification to the person: "Companies at {event} are asking about {requirement texts}. If you have done this, you can add it to your card." | `talent.tip_sent` |

The tip names requirements, never companies' private notes, and never implies the person lacks anything.

## 5. Talent-initiated requests

From the person's "Event companies" page any pool member can ask to meet any participating company.

| Rule | Value |
|---|---|
| Who | `in_pool = true`, approved card |
| Reason | choose 1–3 `(signalId, requirementId)` pairs from their own approved card and the company's Need Card (code pre-selects pairs where `touches` is true but the person may pick any) + optional note ≤ 280 chars, shown to the organiser only |
| Daily cap | `settings.talentRequestCap` (default 3) created per person per day, counted at creation, not refunded on `not_approved` |
| Per company | at most one non-terminal request per company; none within 30 days after a `declined` for that company |
| Review | appears in the organiser review queue as its own item; approve or not approve, one at a time |
| On approve | intro `pending_review → awaiting_company` at publish; a pick (`origin: talent_request`, `status: approved`) is added to today's draft digest of that company; the company sees "This person asked to meet you" |
| On not approve | `reasonCode` from: `need_unrelated` ("The company's need is about something else today"), `company_full` ("The company's meeting slots are full"), `other` + note. Person sees the label only |

## 6. Introduction state machine

`Intro.status` values (contract change C17):

```
            talent asks                organiser approves + digest published
  (none) ───────────────▶ pending_review ─────────────────────────────▶ awaiting_company
     │                          │ organiser not approve                       │ company accepts
     │                          ▼                                              ▼
     │                     not_approved                                    accepted ──▶ cancelled
     │ company "Ask to meet" on an approved, published pick                   ▲
     └──────────────────────▶ awaiting_talent ── talent accepts ─────────────┘
                                   │ talent declines → declined
     awaiting_* : initiator withdraws → withdrawn;  no answer by expiresAt → expired
     awaiting_company: company declines → declined
```

| From | To | Trigger | Who | Side effects |
|---|---|---|---|---|
| none | `awaiting_talent` | "Ask to meet" on a published, approved pick | company | `expiresAt = min(now + 72 h, event.startsAt − 24 h)`; notify talent |
| none | `pending_review` | "Ask to meet" with reason pairs | talent | counts toward cap; enters review queue |
| `pending_review` | `awaiting_company` | approve, then the digest carrying the pick is published | organiser | `expiresAt` set as above; company sees it in the digest |
| `pending_review` | `not_approved` | not approve with reasonCode | organiser | notify talent |
| `awaiting_talent` | `accepted` | accept | talent | `acceptedAt`, `revealedAt = now`; reveal; enqueue `agenda.assign`; notify both |
| `awaiting_talent` | `declined` | decline | talent | notify company: "The person chose not to meet this time." No reason shown |
| `awaiting_company` | `accepted` | accept | company | as above |
| `awaiting_company` | `declined` | decline | company | notify talent: "The company is not taking this further right now." |
| `awaiting_*` | `withdrawn` | withdraw | initiator | notify the other side only if they had been notified |
| `awaiting_*` | `expired` | `expiresAt` passed (checked every 15 min) | system | notify initiator |
| `accepted` | `cancelled` | cancel, with optional note | either side or organiser | agenda item `cancelled`, slot freed; notify the other side and the organiser |

Any transition not in the table returns 409. Every transition writes `intro.{to}` with `{introId, from, to, actor}`.

What each party sees:

| State | Talent sees | Company sees | Organiser sees |
|---|---|---|---|
| `pending_review` | "Waiting for an organiser" | nothing | review item with pairs and note |
| `awaiting_talent` | masked company name, Need Card title and summary, the pick reasons, Accept / Decline | "Waiting for the person to answer" on the pick | state and expiry |
| `awaiting_company` | "Waiting for the company" | pick with "This person asked to meet you", Accept / Decline | state and expiry |
| `accepted` | company contact (demo: "Demo company 07, demo contact"), meeting slot | **revealed**: the person's name, contact, and original quotes for every signal, with a "Shown to you after you both agreed" label | everything, plus slot |
| `declined`, `expired`, `withdrawn`, `not_approved` | neutral one-line text | neutral one-line text (none for `not_approved`) | state, actor, time |
| `cancelled` | "This meeting was cancelled." | same | same plus note |

Reveal rules: before `accepted` the company sees only `companyView`. At `accepted`: name and contact from `talent_identity`, original quotes rendered from the transcript by the evidence references. Interview language and input mode are never revealed (not needed for a meeting). Synthetic identities show the "Synthetic person" tag.

## 7. Agenda slot assignment

Event settings: `startsAt`, `endsAt`, `slotMinutes` (15), `bufferMinutes` (5), `format` (`in_person` | `online` | `hybrid`), `maxMeetingsPerTalent` (4).

1. Slots: `s_i = startsAt + i × (slotMinutes + bufferMinutes)` while `s_i + slotMinutes ≤ endsAt`.
2. Place per company, fixed: in person "Table {nn}" with `nn` = company display number; online "Video room {nn}" (demo link `/room/{nn}`, a placeholder page); hybrid uses the company's own `format` choice, default in person.
3. Process accepted intros without an agenda item ordered by `(acceptedAt, introId)`.
4. Give each the earliest `s_i` where the company has no item, the talent has no item, and the talent has fewer than `maxMeetingsPerTalent`. Write `AgendaItem {status: scheduled}` and set `Intro.agendaItemId`.
5. None free: `AgendaItem {status: waitlist, startsAt: null}`; the organiser console lists waitlisted meetings; the organiser may assign a slot manually (logged `agenda.manual_assign`).
6. Existing items never move. Cancelling frees the slot; the next run may fill it.
7. Audit: `agenda.assigned {agendaItemId, introId, startsAt, place}` or `agenda.waitlisted {introId}`.

`agenda.assign` also runs immediately (not only in the daily job) whenever an intro becomes `accepted`, so the slot appears on the accept screen.

Static agenda pages: after each assignment run, the worker renders one HTML file per affected participant to the static directory served by Caddy (`/agenda/{token}.html`, `Cache-Control: public, max-age=60`), plus one per company. Content: event name, date, place, list of meetings (time, place, the other side's revealed name, Need Card title), and "Generated {time}". No JavaScript needed. Token: 128-bit random, stored on the participant row.

## 8. Notifications

No email. Each notification is a row and a web page. In the demo, the organiser console has an "Outbox" listing every notification as it would have been sent.

Link format: `/n/{token}`, token = `base64url(payload).base64url(HMAC-SHA256(LINK_SECRET, payload))`, payload `{r: recipientType, id: recipientId, p: purpose, exp}`; expiry 14 days; company digest links use `Company.digestToken` the same way. Invalid or expired: "This link has expired. Ask the organiser for a new one."

| Kind | To | Subject line | Body (exact template) |
|---|---|---|---|
| `digest_published` | company | "Your picks for {date}" | "{n} people from the Espoo talent pool could be worth meeting for {needTitle}. You can also check the need we drafted from your posting." Button: "Open your picks" |
| `needcard_drafted` | company | "Please check your need" | "We drafted what your role needs from your public posting. It takes two minutes to check." |
| `intro_requested` | talent | "A company would like to meet you" | "{maskedCompany} would like to meet you about {needTitle}. Your name stays hidden unless you accept." Buttons: Accept, Decline, See why |
| `intro_accepted` | both | "You are meeting" | "You both said yes. Your meeting: {time}, {place}." or "We will confirm a time soon." |
| `intro_declined` | initiator | "An update on your request" | the neutral lines in section 6 |
| `talent_request_not_approved` | talent | "An update on your request" | the reasonCode label |
| `agenda_ready` | each participant | "Your agenda for {eventName}" | link to the static agenda page |
| `card_tip` | talent | "A tip for your card" | section 4 text |

## 9. Acceptance tests

| # | Test |
|---|---|
| P1 | Run `daily.run` twice for the same date with no decisions: same digest ids, same picks, one set of audit rows for drafting |
| P2 | Approve one pick, re-run: digest unchanged |
| P3 | `POST /api/picks/decision` with `pickIds: [..]` → 400; only `pickId` accepted |
| P4 | Publish with one undecided pick → 409 "Decide every pick first" |
| P5 | Remove without `reasonCode` → 400; with `other` and empty note → 400 |
| P6 | Manual add with note of 10 chars → 400; with 25 chars and one pair → approved pick, `origin: organiser`, audit row with note |
| P7 | Fourth talent request on the same day → 429 "You can ask up to 3 companies a day" |
| P8 | Talent request approved, digest published → intro `awaiting_company`, company sees "This person asked to meet you" |
| P9 | Every illegal transition (e.g. `declined → accepted`, `pending_review → accepted`) → 409 |
| P10 | Before `accepted`, company API payloads contain no name, contact, transcript text, interview language or input mode (schema whitelist test); after `accepted` they contain name and originals but still no language or input mode |
| P11 | Two intros accepted at the same instant for the same company → different slots, ordered by `introId` |
| P12 | Talent with 4 meetings → fifth is `waitlist` |
| P13 | Cancel an accepted intro → its slot is reused by the next assignment run; other items unchanged |
| P14 | Agenda page served from the static directory with no database query (stop `db`, page still loads) |
| P15 | Expired token → expiry page; tampered token → same page, no detail |
| P16 | Unmatched queue: person with only removed picks shows cause `drafted_removed`; snoozed person hidden until the date |

## 10. Contract change requests

| # | Change | Reason |
|---|---|---|
| C17 | `Intro.status` becomes `pending_review` \| `awaiting_talent` \| `awaiting_company` \| `accepted` \| `declined` \| `withdrawn` \| `not_approved` \| `expired` \| `cancelled`; add `pickId`, `requestPairs: {signalId, requirementId}[]`, `requestNote`, `organiserDecision: {by, at, reasonCode, note} \| null`, `acceptedAt`, `expiresAt` | `requested` cannot say whose turn it is; talent requests need review data |
| C18 | `Pick` adds `reasonCode` (removal), keeps `decisionNote`; `status` unchanged | Structured removal reasons for the audit and exposure views |
| C19 | `Digest` adds `eventId`, `emptyNeeds: string[]`; unique `(companyId, date)` | Idempotency; empty-need display |
| C20 | `Event` adds `startsAt`, `endsAt`, `slotMinutes`, `bufferMinutes`, `maxMeetingsPerTalent`, `place`; new `event_company (eventId, companyId, number, format)`; `AgendaItem.status` = `scheduled` \| `waitlist` \| `cancelled`; `startsAt`, `endsAt`, `place` nullable for waitlist | Slot assignment and fixed places |
| C21 | New table `notification (id, recipientType, recipientId, kind, payload jsonb, createdAt, readAt)` | Outbox and inbox pages |
| C22 | New table `pool_note (id, talentId NULL, kind 'gap' \| 'snooze', text, escoUri NULL, until NULL, by, at)` | Unmatched queue actions and gap aggregation |
| C23 | New table `settings (eventId, key, value jsonb)` with keys `digestSize`, `rotationDays`, `maxPicksPerDay`, `talentRequestCap`, `dailyRunAt` | Organiser settings screen |
| C24 | `agendaToken` on talent and on `event_company` | Static agenda URLs |
