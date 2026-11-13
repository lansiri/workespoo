# Organiser console

Owner: stream S3 (`src/app/(organiser)/`). Data rules: `matching.md`, `picks-and-intros.md`. The judges are Espoo event organisers: this is their seat. Build it unstyled in Phase 2 with real data and keyboard flow; style in Phase 3.

Access: organiser passcode (demo grade), session cookie. Every page header shows: event name, "Prototype: synthetic people, masked companies", the date, and a "Run today's picks now" button with the last run status.

## 1. Information architecture

| Route | Screen | Purpose in one line |
|---|---|---|
| `/organiser` | Event overview | Is everything ready: companies, Need Cards, interviews, digests |
| `/organiser/review` | Today's review queue | Decide each pick and each talent request, one at a time, then publish |
| `/organiser/pool` | Pool view | Anonymous supply against demand by skill area |
| `/organiser/unmatched` | Unmatched queue | People nobody has picked, and what to do about it |
| `/organiser/exposure` | Exposure view | Is suggestion spread fairly across the pool |
| `/organiser/people/{talentId}` | Person detail | One card as the organiser may see it, with its pick history |
| `/organiser/needs/{needCardId}` | Need detail | Need Card, questions and answers, pool evidence, eligibility list |
| `/organiser/agenda` | Agenda | Meetings, waitlist, manual slot assignment |
| `/organiser/outbox` | Outbox | Every notification as it would have been sent |
| `/organiser/audit` | Audit log | Every decision and state change |
| `/organiser/settings` | Settings | Digest size, caps, run time, demo reset |

Navigation: a left list in this order. The review queue shows a badge with the number of undecided items.

## 2. Never shown to the organiser

1. Any ordering of people by anything derived from their card (no "best first", no sortable column of overlap counts). People lists are sorted by handle, alphabetically, and say so.
2. Any number, percentage, level or grade attached to a person's skills or fit. Counts appear only as pool aggregates, as exposure bands, and as exposure counts on a single person's detail page.
3. Interview language, input mode (voice or text), the person's name or contact before an intro is accepted.
4. Original quotes by default. "Show original words" on a card reveals them for that card for 10 minutes and writes `card.originals_viewed` `{talentId, organiserSession}`.
5. Model prompts, raw model output, `<think>` content, `selection` sort keys other than "never drafted / last drafted {date}".
6. A "select all" checkbox, "approve all", or any multi-select on picks.

## 3. Screens

### 3.1 Event overview `/organiser`

Data:

| Block | Content |
|---|---|
| Event | name, date, format, slots per company, meetings booked / slots available |
| Companies table | one row per participating company in display-number order: masked name, posting title, Need Card status (`draft pending` / `draft` / `confirmed` / `stale` / `no requirements`), questions answered `a of q`, today's digest status (`not drafted` / `draft: d undecided` / `published`), intros open / accepted |
| Talent | interviews started, completed, cards approved, in pool; express vs full counts |
| Last daily run | time, status per step, error text if any; "Run now" |

Actions: open a company's Need Card detail; open its digest in the review queue; open the company's digest page as the company sees it (read-only preview, watermarked "Organiser preview"); copy the company's signed link.

Empty state: "No companies yet. Seed the demo event in Settings, or add companies from postings."

### 3.2 Today's review queue `/organiser/review`

Purpose: decide every item for today, one at a time.

Layout: left column, items grouped by company, then by Need Card; within a Need Card, items in display order (`matching.md` 3.4), labelled "In no particular order". Right panel: the selected item.

Item types:

| Type | Panel shows | Decisions |
|---|---|---|
| Pick | Need Card title and requirement chips (touched chips filled, others outlined); 2–3 reasons, each with "From the card" (English rendering) and "From the posting" (sentence); "Not mentioned" list; basis block (`matching.md` 3.5); origin; "Synthetic person" tag; link to person detail | Approve, Remove (reason), Edit reason text, Undo |
| Talent request | handle, the chosen pairs rendered as reasons, the person's note, requests used today `n of cap` | Approve, Not approve (reasonCode) |
| Publish row (one per company, at the end of its group) | approved / removed counts, Need Card status | Publish (enabled when the group has no undecided item) |

Also on the panel: "Add a person to this need" opens a handle search over the pool (alphabetical; shows each person's eligibility for this need as "relates" / "does not relate yet") and the manual-add form (`picks-and-intros.md` 3).

Keyboard flow (shown in a `?` overlay):

| Key | Action |
|---|---|
| `j` / `↓` | next item |
| `k` / `↑` | previous item |
| `a` | approve the selected item; focus moves to the next undecided item |
| `r` | remove / not approve: opens the reason dialog with focus on the reason list; `1`–`5` choose a code; `Tab` to note; `Enter` confirm; `Esc` cancel |
| `e` | edit the focused reason text; `Enter` save; `Esc` cancel |
| `o` | toggle original words for this card (logged) |
| `u` | undo the last decision (10-minute window) |
| `n` | add a person to this need |
| `p` | publish the current company's digest (only when all its items are decided; otherwise a message names the first undecided item) |
| `g` then `c` | jump to the next company group |

There is deliberately no key or shortcut that acts on more than one item.

Empty states: no digest drafted yet → "Nothing to review yet. Run today's picks." All decided and published → "All of today's digests are published." A Need Card with no eligible people → a row "Nobody relates to {need} yet. See the pool view."

### 3.3 Pool view `/organiser/pool`

Purpose: answer "does the city's pool have anyone for this" and show where demand has no supply. Anonymous aggregates only.

Data, table A, by skill area (ISCO 2-digit group of the event Need Cards' job occupations, label from `esco_concept` ISCO rows):

| Column | Definition |
|---|---|
| Skill area | ISCO 2-digit label |
| Event needs | non-stale Need Cards in that area |
| Espoo postings | active Espoo postings in that area (context for demand outside the event) |
| People who relate | distinct pool people eligible for at least one Need Card in the area |
| Gap notes | `pool_note` gaps tagged to the area |

Table B, by requirement skill (top 30 ESCO skills by number of event Need Cards citing them, ties by label): Need Cards citing it (must / nice), pool people whose cards speak to it, statutory flag. This orders skills, not people.

Rows with "People who relate" = 0 are highlighted as "No supply in the pool yet". Clicking a row lists the Need Cards; it never lists people.

Empty state: "The pool is empty. Seed personas in Settings or wait for interviews."

### 3.4 Unmatched queue `/organiser/unmatched`

Purpose: make sure nobody is invisible. Definition and causes: `picks-and-intros.md` 4.

Data per row (sorted by handle): handle, "Synthetic person" tag, cause label, card headline, approved signal phrases as chips, Need Cards they relate to (if any), last drafted date or "never". Filter by cause.

Actions per row: Suggest to a company, Note a demand gap, Snooze, Send a card tip (`picks-and-intros.md` 4). Each opens a small form with the required inputs.

Empty state: "Everyone in the pool has had a pick or a meeting in the last 7 days."

### 3.5 Exposure view `/organiser/exposure`

Purpose: check that suggestion is spread across the pool and that removals do not concentrate on some people.

Data (rolling 7 days, toggle to "whole event"):

| Block | Content |
|---|---|
| Bands | four bands: "Not suggested", "Suggested 1–2 times", "3–5 times", "6 or more". Each band shows how many people and lists their handles alphabetically |
| Removal concentration | people whose drafted picks were removed every time, ≥ 2 times, alphabetical, with "see decisions" link |
| Spread summary | share of the pool suggested at least once; share of all picks taken by the most-suggested 20% of people (aggregate, no names) |
| Twins check (demo) | the current invariance number from `synthetic-world.md` 3 |

A person's exact counts (drafted, approved, removed, shown, intros) appear only on the person detail page. Nothing on this screen is sortable by count.

Empty state: "No picks drafted yet."

### 3.6 Person detail `/organiser/people/{talentId}`

Card headline, approved signals with English renderings (originals behind the logged toggle), `lookingFor` items, pool status, Need Cards they relate to with touched requirement chips, pick history (date, company, outcome, decided by, note), intros and their states, notes and snoozes. No name, no language, no input mode.

### 3.7 Audit log `/organiser/audit`

Reverse-chronological `AuditEvent` rows, 50 per page. Columns: time, actor, action, subject (linked), detail summary. Filters: actor type, action prefix (`pick.`, `intro.`, `needcard.`, `card.`, `digest.`), subject id, date. Export as JSON for the filtered view. Read-only; no row can be edited or deleted.

Empty state: "Nothing has happened yet."

### 3.8 Agenda `/organiser/agenda`

Grid: rows = slots, columns = companies; cell = handle or revealed name (only for accepted intros) and status. Waitlist list below with "Assign slot" (choose a free slot; logged). "Regenerate agenda pages" button.

### 3.9 Outbox `/organiser/outbox`

Notifications newest first: time, recipient (masked company or handle), kind, subject, "Open as recipient" (opens the signed link).

### 3.10 Settings `/organiser/settings`

| Setting | Default | Range |
|---|---|---|
| Picks per need per digest (`digestSize`) | 5 | 3–7 |
| Rotation window (`rotationDays`) | 7 | 1–14 |
| Picks per person per day (`maxPicksPerDay`) | 3 | 1–5 |
| Talent requests per person per day (`talentRequestCap`) | 3 | 1–5 |
| Daily run time | 06:00 | any |
| Event slots | from the event | — |

Demo controls: "Reset demo" (re-seeds the synthetic world, deletes live sessions; confirmation required; logged), "Seed event". Model roles shown read-only (provider and model per role). Every change writes `settings.changed {key, before, after}`.

## 4. Acceptance tests

| # | Test |
|---|---|
| O1 | Review queue renders picks of one Need Card in `sha256(seed:pickId)` order; reloading keeps the order; a new digest changes it |
| O2 | No element on any organiser page has text matching `/\d+\s*%|score|rank|match strength/i` next to a person |
| O3 | Keyboard: `a` on a pick approves it and moves focus to the next undecided; `r 1 Enter` removes with `evidence_thin` |
| O4 | `p` with an undecided item shows the message and does not publish |
| O5 | No checkbox or multi-select element exists on `/organiser/review` |
| O6 | `o` writes `card.originals_viewed`; originals hidden again after 10 minutes |
| O7 | Interview language and input mode appear nowhere in organiser HTML (fixture person with `lang: fi`, `inputMode: voice`) |
| O8 | Exposure view lists handles alphabetically inside bands; no count column sortable |
| O9 | Pool view rows link to Need Cards only, never to people |
| O10 | Audit log shows the full trail for one pick: drafted, approved, published, intro requested, accepted, agenda assigned |
