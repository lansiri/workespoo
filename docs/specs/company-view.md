# Company view

Owner: stream S2 (`src/app/(company)/`). Data rules: `need-card.md` (Need Card, questions, pool evidence, edits), `matching.md` 3.4–3.5 (pick display), `picks-and-intros.md` 6 (intros). Microcopy beyond what is fixed here belongs to the talent-side microcopy spec; the strings below are fixed.

Route: `/c/{token}` (signed link, `picks-and-intros.md` 8). One page per company; it shows the latest published digest and the current Need Card. Older digests at `/c/{token}/history`.

## 1. Page structure (top to bottom)

### 1.1 Demo banner (always, cannot be dismissed)

> **Demo company 07.** Based on a real public posting. The employer's name is hidden. The people below are synthetic.
> WorkEspoo is a hackathon prototype, not an official City of Espoo service.

`Demo company {nn}` comes from `Company.displayName`. No real employer name, business id, logo, address or application URL appears anywhere on this page or in its HTML, metadata or API responses. The posting sentences shown are the real text with the employer name replaced by "the company" (code replaces every case-insensitive occurrence of `job.employerName` and its first word when it is longer than 3 characters).

### 1.2 Your need

Header: Need Card title, summary, "Drafted from your public posting on {date}". Status chip: "Please check" (draft) or "Confirmed {date}".

Requirement list in posting order. Each row:

| Element | Content |
|---|---|
| Text | requirement text, editable inline (pencil icon) |
| Kind | toggle "Must-have" / "Nice-to-have" |
| Category | small label |
| Source | "From your posting" with expandable sentence text, or "Added by you" |
| Pool evidence | the exact display text from `need-card.md` 5.4, with "as of {time}" |
| Question | when present: the question, the `why` line, and four buttons: **Keep as must-have**, **Make it nice-to-have**, **Change the wording**, **Remove it**; optional "Add a note" |
| Statutory | instead of a question: "Set by law or regulation. Not questioned here; the employer checks it at hiring." |

Below the list: "Add a requirement" (text, kind, category, ESCO autocomplete) and **Confirm this need**. Lint and versioning: `need-card.md` 6.

Explanatory line under the header (fixed): "Must-haves never remove anyone from your picks. We show what the conversation did not cover as 'not mentioned', so you can ask about it when you meet."

### 1.3 Your picks for {date}

Header: "{n} people from the Espoo talent pool for {needTitle}. In no particular order." One section per Need Card if the company has several.

Pick card (one per approved pick, display order `matching.md` 3.4):

| Element | Content |
|---|---|
| Handle | the pseudonym (e.g. "Maple-42") and the "Synthetic person" tag |
| Headline | `companyView.summary` |
| Origin note | "This person asked to meet you" for talent requests; nothing otherwise |
| Reasons | 2–3 reasons; under each, "From the card (English rendering):" the signal's rendering, and "From your posting:" the sentence |
| Requirement chips | each requirement of the need: filled "Mentioned" or outlined "Not mentioned" |
| Not mentioned | "Not mentioned in the conversation: {texts}". Statutory ones end with "(you check this at hiring)". Followed by: "Not mentioned does not mean missing. Ask about it when you meet." |
| Action | **Ask to meet** (company-initiated) or **Accept** / **Decline** (talent-initiated) |

Not on the pick card, ever, before mutual opt-in: name, contact, photo, original quotes, interview language, input mode, any number or ordering signal, the person's other picks or intros.

Empty states:
- Digest not published yet: "Your first picks are being reviewed by an Espoo organiser. Meanwhile, please check your need above."
- Need with no eligible people: "Nobody in the pool relates to this need yet." plus the whole-pool evidence line.
- All picks acted on: "You have answered every pick. New picks arrive after the next review."

### 1.4 Your meetings

List of intros by state with the texts from `picks-and-intros.md` 6: "Waiting for the person to answer (until {expiresAt})", "The person chose not to meet this time.", and, for accepted ones, the reveal block.

## 2. Ask to meet and what follows

1. Company clicks **Ask to meet** → confirm dialog: "We will ask this person if they would like to meet you about {needTitle}. Their name stays hidden unless they accept." [Send request] [Cancel].
2. Intro `awaiting_talent`; the button becomes "Request sent. Waiting for the person to answer (until {date})." with **Withdraw**.
3. Person accepts → reveal block replaces the pick card's header:
   - "You both agreed to meet." Name, contact (synthetic: `@example.invalid`), "Synthetic person" tag.
   - Each reason's evidence now also shows "In their own words:" the original quote rendered from the transcript, labelled "Shown to you after you both agreed".
   - Meeting: time and place from the agenda, or "We will confirm a time soon", and a link to the company's static agenda page.
4. Person declines → "The person chose not to meet this time." The pick stays visible, the button is gone, no reason is given.
5. Expired → "No answer before {date}. The request has closed."

For talent-initiated picks the company's **Accept** goes straight to step 3; **Decline** shows a confirm dialog and then "You declined. The person sees a neutral message."

All actions write audit events with `actor: company`.

## 3. Demo-mode labelling rules

1. The demo banner (1.1) is on every company page, including history and the agenda page.
2. Every synthetic person shows "Synthetic person" wherever a handle or name appears.
3. The page `<title>` is "Demo company {nn} · WorkEspoo prototype".
4. API responses for the company include `"demo": true` and never the real employer fields (`employerName`, `employerBusinessId`, `url`, `raw`).

## 4. Acceptance tests

| # | Test |
|---|---|
| CV1 | Company page HTML and every company API response for a fixture posting contain neither `employerName` nor `employerBusinessId` nor `job.url` (string search, case-insensitive) |
| CV2 | Posting sentence containing the employer name renders with "the company" |
| CV3 | Banner present on `/c/{token}`, `/c/{token}/history`, and the company agenda page |
| CV4 | Pick cards contain no `%` and no digits outside the handle, dates, times and requirement texts (strip those, then assert `/\d/` does not match) |
| CV5 | Two consecutive digests with the same people show them in different orders |
| CV6 | Before acceptance, no original-quote text from the fixture transcript appears in the page; after acceptance, it does, labelled |
| CV7 | "Make it nice-to-have" on the Finnish question: requirement kind changes, version increments, pool evidence recomputed, question shows the answer and no buttons |
| CV8 | Statutory requirement row shows no exclusion count and no question buttons |
| CV9 | Ask to meet → talent's matches page shows the request with the masked company name |
| CV10 | Expired or tampered token → expiry page |
