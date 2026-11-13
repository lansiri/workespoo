# WorkEspoo design system

The interface builders work from this document. It is binding for every product screen. Where it disagrees with an older prototype, this document wins; where it disagrees with a spec in `docs/specs/` on what a screen must contain or say, the spec wins and this document should be fixed.

Reference prototypes (open in a browser, plain HTML, one stylesheet):

| File | What it shows | Useful query strings |
|---|---|---|
| `design/product/final/workespoo.css` | Every token and component style in this document | |
| `design/product/final/interview.html` | `/interview/[id]` | `step=0..5`, `state=idle\|listening\|thinking\|speaking`, `arrive=0` (no animation), `motion=off`, `presenter=1`, `lang=fi\|sv`, `shot` (hides the prototype bar) |
| `design/product/final/card.html` | `/card` | `approved=1`, `view=company`, `removed=1`, `lang=fi\|sv` |
| `design/product/final/review.html` | `/organiser/review` | `dialog=1`, `keys=1`, `all=1`, `fresh=1`, `lang=fi\|sv`. Keys j k a r 1–5 Enter Esc u p ? work |
| `design/product/final/matches.html` | `/matches` | `intro=form\|accepted\|declined`, `lang=fi\|sv` |
| `design/product/final/company.html` | `/c/[token]` | |
| `design/product/final/shoot.mjs` | Regenerates every screenshot in `design/product/final/shots/` | `node shoot.mjs [name-filter]` |

The direction is "Clear signal": a calm, voice-first room built around one large Cheer W. Each skill the AI notes travels from the person's own marked words, through the interviewer, into a tidy notes list, and a counter of real open jobs rises as job tiles slide in. The front page's voice (hard ink shadows, stickers, tape) appears on the few objects that matter: the talk button, the Signal Card, the jobs board, the handle and the publish box. Everything a person reads about themselves, or decides about someone else, stays flat and quiet.

---

## 1. Rules the interface carries

These are product rules (`CLAUDE.md`, rules 4 to 7). Each one has a visible design consequence.

1. **Nothing about a person is scored.** No number, bar, star, colour, size, position or order may express how strong, good or suitable a person or one of their skills is. Every list of people says "In no particular order". Skills are listed in conversation order.
2. **Evidence is the person's words, rendered by code.** A quote box only ever contains sentences from the stored transcript, cited by turn and sentence index. AI wording is always in a different container, labelled "AI", and never in quotation marks.
3. **No identity cues before mutual consent.** No names, photos, avatars, ages, nationalities, language labels or input mode on any card. People appear as a handle sticker (for example `Birch-27`). The handle's icon is a neutral diamond, the same for everyone.
4. **The interviewer is an AI and says so.** The AI disclosure line is always visible on the interview screen. The mascot has no face and shows no emotion; its states are shapes plus a worded badge.
5. **A human decides one person at a time.** There is no "approve all", no multi-select, no select-all checkbox, no key that acts on several people. Approve and Remove have identical visual weight.
6. **Consent is never pre-filled.** Radio buttons and checkboxes that grant something (pool opt-in, voice, live demo) start empty.
7. **Long words are normal.** Finnish labels run 30 to 50 characters. No component may depend on a short English label: everything wraps, nothing truncates with an ellipsis, nothing has a fixed width that holds text.

---

## 2. Tokens

All tokens are CSS custom properties on `:root` (see `workespoo.css`). In the app, define them once in `src/app/globals.css` and map them to Tailwind 4 theme variables (`@theme { --color-pine: var(--pine); ... }`). Do not hard-code hex values in components.

### 2.1 Colour

Contrast ratios are WCAG 2 against the background named. Every text pair below is at least 4.5:1; every pair used for text under 18 px is at least 5:1.

| Token | Hex | Role | Use it for | Never use it for |
|---|---|---|---|---|
| `--pine` | `#0E5E55` | Primary | Primary buttons, links, the W, notes chip border, selected nav, the jobs count number | Large background areas other than the Signal Card header and the speaking badge |
| `--pine-700` | `#0A4A43` | Primary hover | Hover on pine | Text |
| `--pine-50` | `#E7F1EF` | Primary tint | Selected rows, info banners, `mentions:` pills, count badges | Anything that marks a person as better |
| `--pine-100` | `#C9DFDA` | Primary tint border | Borders on pine-50 | |
| `--sun` | `#FFB627` | Accent | The mascot head, stickers, the handle sticker, AI tags, NEW tags, the marker, focus ring, tape | Text on light backgrounds (fails contrast). Never as a fill that ranks something |
| `--sun-soft` | `#FFF1D6` | Accent tint | The person's own quote boxes, fresh chips, the reveal block, demo banner, slot | AI wording |
| `--marker` | `rgba(255,182,39,.5)` | Evidence marker | Lower 40 % highlight behind the person's cited sentences | Anything that is not the person's own words |
| `--cream` | `#FBF7F0` | Page | Page background, recessed panels | |
| `--paper` | `#FFFDF8` | Surface | Cards, panels, inputs on cream | |
| `--ink` | `#1E2B29` | Text | Body text, headings, hard shadows, sticker borders. 13.7:1 on cream | |
| `--muted` | `#4A5754` | Secondary text | Help text, labels, meta. 7.07:1 on cream, 7.42:1 on paper | Primary content |
| `--faint` | `#6B7673` | Disabled | Placeholders and disabled text only. 4.6:1 on paper | Any text a person needs to read |
| `--line` | `#E7DFD1` | Hairline | Dividers, card borders | |
| `--line-strong` | `#CFC5B3` | Border | Inputs, dashed "not mentioned" boxes, ghost placeholders | |
| `--mint` | `#5ED1B6` | Listening | Listening ring, live caption border, know-how marker, the mark on dark | Text on light |
| `--mint-soft` | `#E3F5EF` | Listening tint | Live caption, the person's turns in the transcript, listening badge | |
| `--leaf` | `#2F7A3E` | Confirmation | "Approved", "You both said yes", the approved stamp. 4.95:1 on cream | Anything about a person's quality, any count |
| `--leaf-soft` | `#E6F2E8` | Confirmation tint | Confirmed status chip | |
| `--amber` | `#8A5300` | Own-words label | "Your words" labels and answer refs on sun-soft (5.67:1), purge notice | Judging a person |
| `--danger` | `#9B2C14` | Destructive (own data) | "Delete everything", field errors. 6.9:1 on paper | Removing a pick (organiser Remove is neutral) |
| `--danger-soft` | `#FBEEE9` | | Hover on danger | |
| `--night` | `#14211F` | Dark | Prototype bar, scrims (45 % alpha), toasts | |

Dark mode is not built for the product screens in this pass. If added, mint replaces pine and cream on night replaces ink on cream (brand README).

### 2.2 Type

Two families. Fredoka (500, 600) for headings, the interviewer's line, stickers, handles and big numbers. Inter (400, 500, 600, 700) for everything else. Fallbacks: `"Arial Rounded MT Bold", ui-rounded, "SF Pro Rounded", "Varela Round", "Nunito", system-ui` and `system-ui, -apple-system, "Segoe UI", Roboto`.

| Name | Family / weight | Size / line height (desktop) | Phone (≤ 760 px) | Used for |
|---|---|---|---|---|
| `display` | Fredoka 600 | 40 / 1.15, tracking −0.01em | 26–28 | Page titles ("Your Signal Card", "My matches") |
| `interviewer` | Fredoka 500 | 30 / 1.25 (25 when > 160 chars) | 22 / 1.25 (19 long) | The interviewer's line. Presenter mode 34; ≥ 1800 px wide 42 |
| `count` | Fredoka 600 | 60 / 1, tabular numbers | 44 | Jobs-lit count |
| `h-card` | Fredoka 500 | 34 / 1.15 | 21 | Signal Card headline |
| `h2` | Fredoka 500 | 26 / 1.15 | 22 | Section headings, intro request heading |
| `h3` | Fredoka 500 | 20–22 / 1.2 | 20 | Box titles, posting titles, pick headline (22 / 1.3) |
| `handle` | Fredoka 600 | 20 / 1 (17 small) | same | Handle sticker |
| `sticker` | Fredoka 600 | 15 / 1.1 | 13–15 | Stickers |
| `body-lg` | Inter 400 | 18 / 1.5 | 16 | Words box, intro lead |
| `body` | Inter 400 | 16 / 1.5 | 16 | Default; quotes |
| `body-sm` | Inter 400/500 | 15 / 1.45 | 15 | Reasons, transcript, chips |
| `meta` | Inter 400 | 14 / 1.45 | 14 | Help text, posting meta, source line |
| `fine` | Inter 400 | 13 / 1.45 | 13 | Footnotes, "not mentioned does not mean missing" |
| `label` | Inter 700 | 11.5 / 1.2, uppercase, tracking 0.07em | same | Field labels: "YOUR WORDS", "FROM THE POSTING" |

Rules: no text under 12 px anywhere; nothing a person must read under 13 px; on a projector (presenter mode) nothing under 16 px. Inputs are 16 px or larger on phones (prevents iOS zoom). Headings use `hyphens: manual`; body uses `hyphens: manual` in English and `hyphens: auto` under `:lang(fi)`; every container has `overflow-wrap: break-word`.

### 2.3 Spacing

4 px base. Use only these steps: 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 40, 64.

| Context | Value |
|---|---|
| Page side gutter | 32 desktop, 16 phone |
| Panel padding | 22–24 desktop, 16–18 phone |
| Gap between cards in a list | 16 (feed), 10 (review queue), 18 (company picks) |
| Gap inside a chip list | 8 |
| Column gap, two-column pages | 36–40 |
| Max content width | 1200–1240 |

### 2.4 Radii

| Token | px | Use |
|---|---|---|
| `--r-xs` | 6 | Focus outline, kbd |
| `--r-sm` | 10 | Stickers, small tags |
| `--r-md` | 16 | Quote boxes, words box, dialogs inside |
| `--r-lg` | 24 | Panels, boxes, jobs board, intro card |
| `--r-xl` | 28 | Signal Card (22 on phone) |
| `--r-pill` | 999 | Buttons, chips (14 for notes chips so two lines still look right), badges |

### 2.5 Shadows and borders

| Token | Value | Only on |
|---|---|---|
| `--shadow-ink` | `5px 5px 0 #1E2B29` | Signal Card (7 px), jobs board, approve box, intro request, revealed pick, dialogs, publish box (3 px) |
| `--shadow-ink-sm` | `3px 3px 0 #1E2B29` | Stickers, handle, AI line, state badge, selected review row |
| `--press` | `0 5px 0 #1E2B29` (4 px on `.btn-primary`) | Talk button, primary buttons. Pressed: translateY(4px) and 1 px shadow |
| `--shadow-1`, `--shadow-2` | soft | The flying note only. No soft shadows on cards |

Borders: 1 px `--line` for quiet cards; 1.5 px for chips and inputs; 2–2.5 px `--ink` for the loud objects listed above. A hard ink shadow always comes with a 2 px or thicker ink border. At most two hard-shadow objects per viewport region.

### 2.6 Breakpoints and layout

| Name | Width | Behaviour |
|---|---|---|
| phone | ≤ 760 px | One column; fixed bottom action bar on interview and card; nav collapses to a Menu button; languages stay visible in the top bar |
| narrow | 761–900 px | Card, matches and company pages go to one column |
| interview tablet | 761–1099 px | The interview uses the presenter grid (stage + notes and jobs; the transcript moves behind a "Conversation" toggle in the header). Three columns start at 1100 px |
| desktop | 901–1799 px | Designed at 1440 × 900 |
| projector | presenter mode at 1280 × 720 and 1920 × 1080 | `?presenter=1` or a toggle in the interview header for the organiser: hides the conversation column, enlarges type, notes and jobs take 34 % |

Z-index: top bar 5, fixed bottom bars 20, review keys bar 15, scrim 30, modal 31, flying note 40, toast 60.

Focus: 3 px `--sun` outline, 2 px offset, on every interactive element. Never remove it.

---

## 3. Motion

All motion is CSS keyframes or the Web Animations API. No animation library.

| What | Duration | Easing | Details |
|---|---|---|---|
| Hover and colour changes | 150 ms | ease | Buttons, rows, chips |
| State changes (ring, badge, waves fade) | 250–300 ms | ease | |
| Talk button press | 120 ms | ease | translateY(4 px), shadow to 1 px; held state turns sun with ink text |
| Listening ring | per frame | none | Scale 0.86 + level × 0.22 from an `AnalyserNode` RMS level, 0–1. Nothing is recorded or stored |
| Talk button level bars | per frame | none | 5 bars, height 6 + level × 18 px |
| Thinking ring | 9 s / turn | linear | Dashed pine ring rotates |
| Thinking dots | 1.6 s / turn | linear | Three dots orbit the head |
| Thinking pencil | 0.7 s loop | ease-in-out | Pencil rotates −6° to 5° and shifts 4 px: "taking notes" |
| Speaking arcs | 1.4 s loop, 0.2 s stagger | ease-in-out | Three pine arcs each side fade 0.25 ↔ 1; W bobs 3 px |
| Interviewer line | 230 ms / word | steps | Spoken words in ink, not-yet-spoken in `--muted` (7:1). The line is never dimmed while the person is listening or speaking |
| Marker sweep | 450 ms | `--ease-out` cubic-bezier(.22,1,.36,1) | Background-size 0 → 100 % on each cited sentence in the words box, when the answer arrives |
| Note flight (`flyNote`) | 1900 ms, 450 ms between notes, first starts 450 ms after release | cubic-bezier(.45,.05,.35,1) | Keyframes: at the marked sentence (scale .5, opacity 0) → lift 8 px (offset .12) → the sun head (offset .38, the head pops scale 1.22 over 520 ms with spring cubic-bezier(.34,1.4,.64,1)) → 5 points on an arc of radius 0.66 × mascot size swinging toward the notes list (offsets .38–.82) → the chip's slot (offset 1) |
| Jobs count | 1100 ms | ease-out cubic | Starts when the first note lands; "+N new" pill rises 6 px over 300 ms and stays until the next answer |
| Job tiles | 620 ms each, 140 ms stagger | `--ease-out` | Slide down from −14 px and expand height |
| Stamp, toasts | 200 ms | ease | |

Never animated: anything on the Signal Card body, the review queue rows (only 150 ms hover), the company page, the job feed, numbers about people (there are none), and the order of any list.

**Reduced motion** (`prefers-reduced-motion: reduce`, or `?motion=off`): every animation and transition drops to 1 ms and runs once. Each state still reads without motion:

| Animation | Reduced-motion result |
|---|---|
| Listening ring | Fixed mint disc at scale 0.94; badge "Listening…" |
| Thinking | Static dashed ring, dots and pencil standing still; dashed badge "Writing a question…" |
| Speaking | Arcs at full opacity; whole line shown at once in ink |
| Live caption caret | Static |
| Marker sweep | Marker drawn at once |
| Note flight | No flight. Chips appear in place with the sun tint, a 2 px sun outline and the NEW tag |
| Jobs count | Jumps to the new number; "+N new" pill still shows |
| Job tiles | Appear without sliding |

Implementation note: build the flight as one helper, `flyNote(sourceEl, targetEl, delayMs): Promise<void>`, that clones the target chip, animates the clone and reveals the real chip on finish. The counter and tiles are separate components that react to `jobs.lit` events and never wait for the flight; if the flight is skipped or fails, the page is still correct.

---

## 4. Components

Names are the React component names to use. Props are TypeScript-ish; types come from `src/contracts` where they exist. Every component accepts `className`. All strings come from the message tables (`messages.ts` per feature), never inline.

### 4.1 PageShell

- **Purpose:** the frame of every page: top bar, optional main nav, language switcher, content.
- **Anatomy:** `TopBar` (64 px, paper, 1 px line bottom) → `Logo` (mark 30 px + wordmark "WorkEspoo", Fredoka 600 21 px, wordmark hidden on phone) → optional slot (interview progress, "For companies") → `MainNav` (talent: Interview, My card, My matches, How this works; organiser: Overview, Today's review with undecided badge, Pool, Exposure, Audit log) → spacer → optional slot (organiser: "Prototype: synthetic people, masked companies" dashed pill) → `LanguageSwitcher` (English, Suomi, Svenska; organiser uses EN FI SV) → optional action (Stop) → `MenuButton` on phone. Then `<main>`.
- **Props:** `audience: "talent" | "organiser" | "company" | "public"`, `current?: string` (nav key), `headerSlot?: ReactNode`, `actions?: ReactNode`, `children`.
- **States:** default; phone (nav in a sheet behind the Menu button, 44 × 44, 2 px ink border).
- **Accessibility:** `<header>`, `<nav aria-label="Main">`, `<nav aria-label="Language">`. Current nav item `aria-current="page"` with pine-50 fill and a 3 px sun underline. Language links set `lang` on the `<html>` element.
- **Test ids:** `site-logo`, `language-switcher`, `lang-en`, `lang-fi`, `lang-sv` on every page.

### 4.2 InterviewerMascot

- **Purpose:** the AI interviewer, the eye-catching centre of the interview. It shows what the AI is doing, never what it feels.
- **Anatomy:** the brand mark exactly, scaled into a 240 × 240 box: W path `M34 86 L75 195 L120 124 L165 195 L206 86`, stroke 40, pine, round caps; sun head circle (120, 56) r 28; soft highlight on the left stroke; floor shadow ellipse. **No eyes, no mouth, no face, in any state.** Around it: base ring, level ring, speaking waves (svg 152 % of the box), think dots, pencil. Below: `StateBadge`.
- **Props:** `state: "idle" | "listening" | "thinking" | "speaking"`, `level?: number` (0–1, listening only), `size?: number` (236 desktop, 132 phone, 168 presenter at 720 high, 300 at ≥ 1800 wide), `onNoteCaught?` (head pop trigger).
- **States:**

| State | Shape | Badge (icon + words) |
|---|---|---|
| idle | Thin 2 px warm-grey ring | Hollow circle, "Your turn"; when the interview is over, "Interview finished" |
| listening | Mint disc with 6 px mint ring, scaled by mic level | Mic icon, mint-soft fill, "Listening…" |
| thinking | Dashed pine ring rotating; three dots orbiting the head; a sun pencil scribbling by the right arm | Pencil icon, sun-soft fill, dashed border, "Writing a question…" |
| speaking | Three pine arcs on each side pulsing; W bobs | Speaker icon, pine fill, white text, "Speaking" |

- **Accessibility:** the SVG is `aria-hidden`. The badge is `role="status"` so the state is announced. States never rely on colour alone (each has its own shape and words).

### 4.3 HoldToTalk

- **Purpose:** the main voice control. Hold to record, release to send.
- **Anatomy:** full-width pill, 72 px high desktop, 64 phone; 2.5 px ink border; `--press` shadow; mic icon 26 px; label; level bars (listening only).
- **Props:** `state: "ready" | "listening" | "disabled" | "done"`, `level?: number`, `onStart()`, `onRelease()`, `doneHref?` (becomes the go-to-card link).
- **States:** ready (pine, white text, "Hold to talk"); listening (sun fill, ink text, pressed 4 px, "Release to send", 5 level bars); disabled while the AI is thinking (warm grey, no shadow); done (pine, "Check my notes", links to `/card`); mic denied or unsupported (button hidden, the type box becomes the only input and an inline error shows, see 4.24).
- **Accessibility:** a real `<button>`. Pointer down/up with pointer capture; Space or Enter down starts, key up sends. `aria-describedby` points at the hint "In a noisy place, hold the button only while you speak." Minimum target 64 × 64. Never auto-starts recording.
- **Phone:** sits in the fixed bottom bar with a 64 × 64 square `TypeInsteadButton` (keyboard icon, `aria-label` "Type instead") beside it; tapping it reveals the type box above the button.
- **Test ids:** `talk-button`; when done, `go-to-card` and the controls region `interview-done`.

### 4.4 TypeAnswer

- **Purpose:** the text alternative, always available.
- **Anatomy:** pill input 72 px (54 phone), 2 px line-strong border, pine focus ring; Send button inside on the right.
- **Props:** `value`, `onChange`, `onSend`, `disabled`.
- **States:** empty (Send disabled), typing, sending (Send shows a spinner-free "Sending…" label), failed (inline error under the row with "Try again").
- **Accessibility:** visible placeholder plus an `sr-only` label "Write your answer". Enter sends.
- **Test ids:** `answer-input`, `send-answer`, `send-failed`.

### 4.5 InterviewerLine

- **Purpose:** the current question, large, readable from the back of a hall.
- **Anatomy:** label "INTERVIEWER · AI" (label style) above the line in `interviewer` type, centred, `text-wrap: balance`, max 700 px (820 presenter).
- **Props:** `text: string`, `spokenWords?: number` (for the word-by-word reveal), `long?: boolean` (auto when > 160 chars).
- **States:** speaking (spoken words ink, rest `--muted`), static (all ink). It is never dimmed in other states.
- **Accessibility:** `aria-live="polite"`; announce the full line once, not word by word (set the live text when speaking starts).
- **Test ids:** `interviewer-text`.

### 4.6 WordsBox

- **Purpose:** puts the person's own words on the main stage, so a projector shows what was heard and which sentences became notes.
- **Anatomy:** a speech-bubble box (radius 16 16 4 16) under the interviewer line, max 660 px, `body-lg`. Header label plus a quiet hint.
- **Props:** `mode: "empty" | "live" | "said"`, `text?: string` (live partial), `sentences?: string[]`, `cited?: number[]` (sentence indexes that became notes), `answerNumber?: number`, `sweep?: boolean`.
- **States:**
  - empty: dashed border, muted text "Your words will show here as you speak. The sentences that become notes get marked."
  - live (listening): mint-soft fill, 2 px mint border, label "YOU, LIVE", partial transcript with a blinking caret.
  - said (after release): paper fill, 2 px pine border, label "YOU SAID · answer N · marked words became notes" (hint hidden on phone), every cited sentence wrapped in `OwnWordsMark` with a sweep.
- **Accessibility:** live mode is `aria-live="off"` (the transcript announces on send); said mode is static text.
- **Test ids:** `voice-partial` on the live text (existing).

### 4.7 OwnWordsMark

- **Purpose:** the marker that ties a note to the sentence that earned it. The clearest "your own words" signal.
- **Anatomy:** inline `<span class="mk">`: a sun highlight on the lower 40 % of the line (`linear-gradient(transparent 52%, var(--marker) 52% 92%, transparent 92%)`), `box-decoration-break: clone`.
- **Props:** `turn: number`, `sentence: number`, `sweep?: boolean`, `highlighted?: boolean`.
- **States:** resting (permanent, on every cited sentence in the WordsBox and the Transcript); sweeping (450 ms); highlighted (full-height marker plus 2 px sun ring, while its note chip is hovered or focused).
- **Rule:** marks whole sentences only. Evidence references are sentence-level, so a partial-phrase mark would claim more precision than the data has. Only the person's own words are ever marked.

### 4.8 Transcript

- **Purpose:** the full conversation, for the person only.
- **Anatomy:** left column (320 px desktop; under the notes on phone). Header "Conversation" plus a lock icon line "Only you see your own words." Alternating turns: AI turns plain with label "INTERVIEWER · AI"; the person's turns in a mint-soft bubble with 1.5 px pine border, label "YOU · ANSWER N", sentences with `OwnWordsMark`, and a "Remove this answer" text button. Footer legend: a marked sample "Marked words" + "became notes."
- **Props:** `turns: Turn[]` (from contracts), `citedByTurn: Map<number, Set<number>>`, `onRemoveTurn(turnIndex)`.
- **States:** empty ("Nothing yet. When you answer, your words appear here."); scrolling (auto-scrolls to the newest turn); a removed turn disappears and its notes leave the notes list.
- **Accessibility:** `<ol>` of turns, `aria-live="polite"` on new turns.
- **Test ids:** `transcript`, `turn-remove`.

### 4.9 NoteChip and its arrival

- **Purpose:** one skill the AI noted, in the interview notes list and at the top of each Signal Card row.
- **Anatomy:** rounded rectangle (radius 14, 1.5 px pine border, paper fill), 15 px Inter 500. Leading group marker 10 px; phrase; "answer N" reference (12 px, muted); NEW tag (sun, ink, 10.5 px bold) for notes from the latest answer.
- **Group markers** (shape and colour only; never fill, size or position): What I do = sun dot with ink inner ring; Tools = ink square; Know-how = mint dot; Fields = pine ring. All chips have the same size, border and fill so no group reads as a higher tier.
- **Props:** `signalId`, `phrase`, `group: "skill" | "tool" | "knowledge" | "domain"`, `answerNumber`, `fresh?: boolean`, `pending?: boolean` (hidden while its clone flies), `onHover(on)` (highlights the OwnWordsMark).
- **States:** default; fresh (sun-soft fill, ink border, NEW tag, until the next answer arrives; reduced motion adds a 2 px sun outline); pending (visibility hidden); hover/focus (ink border, source sentence highlighted in transcript and words box); in the card, removed (dashed, line-through, 60 % opacity).
- **Arrival:** see `flyNote` in section 3. Notes from one answer fly 450 ms apart in sentence order.
- **Layout:** a wrapping flow (8 px gaps), conversation order on desktop, newest first on phone. Labels wrap to two lines; never truncate; the reference and NEW tag stay on the first line's right.
- **Accessibility:** each chip is a `<button>` whose accessible name is the phrase plus "from answer N"; the list is `aria-live="polite"` and announces "Noted: {phrase}".
- **Test ids:** `signal-chip` with `data-signal-id`.

### 4.10 NotesList

- **Purpose:** the right-column "Notes so far".
- **Anatomy:** heading "Notes so far" + count pill (pine-50, a count of notes, not a score), help "You'll check and edit these at the end.", chip flow.
- **States:** empty: four dashed ghost chips (widths 150, 110, 180, 90) and the line "Skills you mention appear here, in your own words. Nothing is scored: they are notes, and you decide what stays." Filled. Removed answer: its chips leave instantly.
- **Test ids:** `coverage-hint` (existing, keep on the help line).

### 4.11 JobsLit

- **Purpose:** shows that real open jobs mention the person's skills, rising as they talk.
- **Anatomy (board):** cream panel, 2 px ink border, `--shadow-ink`, radius 24, sticker "Real open jobs" (tilted −3°) on the top edge. Count (Fredoka 60, pine, tabular) + `JobsDelta` pill; label "open jobs in Espoo mention these skills"; source line "Source: Työmarkkinatori · Espoo and nearby"; up to 4 `JobTile`s, newest on top; footer "More in your job feed once you approve your card."
- **JobTile:** 30 px pine-50 icon; title (15 px 600); employer · district (14 px muted); pill `mentions: {skill}` (pine on pine-50). The `mentions:` line is required: it says exactly why the job lit.
- **JobsDelta:** paper pill, 1.5 px ink border, ink text "+29 new". Neutral by design: never green, never an arrow up, never next to a person's skill. It counts postings.
- **JobsMini (phone):** one line inside the fixed bottom bar, above the talk button: count (Fredoka 20) + "open jobs mention these" + delta. Always visible when a note lands.
- **Props:** `count: number`, `delta?: number`, `tiles: { title, employer, place, mentions }[]`, `source: string`.
- **States:** empty: no number; Fredoka 22 pine line "Real open jobs light up here as you talk." and two dashed ghost tiles. Counting (1.1 s). Settled. Error: "Job matches are not available right now. Your notes are saved." (muted, no number).
- **Rules:** the count is the real number of active postings whose text mentions an approved or draft skill (from `jobs.lit`), and every tile is a real posting. Do not show more tiles than real postings.
- **Test ids:** `jobs-lit-count` on the count number.

### 4.12 AiDisclosure (banner)

- **Purpose:** permanent AI disclosure on the interview.
- **Anatomy:** pill, paper fill, 1.5 px ink border, `--shadow-ink-sm`; sun "AI" tag; text `ai.disclosure`: "You're talking with an AI. It takes notes; you review and approve them at the end."
- **States:** one. On phone the shadow is dropped and the radius is 14.
- **Accessibility:** plain text, first item in the stage column's reading order.

### 4.13 SignalCard

- **Purpose:** the person's own account of what they can do; the object they approve.
- **Anatomy:** card with 2.5 px ink border, 7 px ink shadow, radius 28; a sun tape strip (120 × 28, −2°) centred on the top edge.
  - Header (pine, white text): mark (mint) + "SIGNAL CARD" kicker + `PersonHandle` on the right; **AI label directly above the headline**: sun "AI" tag + "Summary written by AI from your own words" (company view: "…from this person's own words"); headline (`h-card`); summary (17 px, 2 sentences). On phone the summary hides behind "Read the summary".
  - Approved stamp after approval: "APPROVED BY YOU", leaf on paper, 3 px leaf border, −4°, overlapping the header's bottom edge.
  - Body: order note "Notes are in the order you talked about them. Nothing here is scored."; groups in fixed order What I do, Tools, Know-how, Fields (empty groups hidden), each a `group-title` label with a hairline; `SkillRow`s; "+ Add your own" after the last group.
  - "What you're looking for" section (definition list of tags; "All optional. Companies can see this."; Edit).
  - Footer: "Synthetic demo profile" · "Draft · nobody sees this until you approve it" · "Skill labels: ESCO, European Commission".
- **Props:** `card: CardForPerson`, `view: "person" | "company"`, `approved: boolean`, `onEditSignal`, `onRemoveSignal`, `onUndo`, `onAdd`.
- **States:** draft; approved (stamp); company view (see 4.15); empty ("No notes yet. Add your own to get started."); waiting ("Preparing your notes…" with the thinking mascot at 96 px); error ("We couldn't prepare all your notes. You can add your own and approve when ready.").
- **Test ids:** `card-headline`, `card-empty`, `card-waiting`, `card-error`.

### 4.14 SkillRow

- **Purpose:** one note: the phrase, its ESCO label, the person's words, and the AI wording companies will see, side by side so nobody confuses them.
- **Anatomy:** top line: `NoteChip` (no NEW, no ref) + Edit and Remove quiet buttons on the right (on phone: below the evidence). ESCO line: "ESCO" box label + English label in ink + " · " + Finnish label in muted (both always shown, for everyone). Evidence grid (1.15fr / 1fr; stacked on phone):
  - `OwnWordsQuote`: sun-soft box, 4 px sun left border, label "YOUR WORDS" (amber), each answer as its own `<q>` with curly quotes in amber, then "Answer N" (amber, 12.5 px). Sentences from different answers are never joined into one quote.
  - `AiRendering`: dashed line-strong box, label "✦ SHOWN TO COMPANIES AS" + sun "AI" mini tag, then the rendering text with no quote marks.
- **Props:** `signal` (phrase, group, esco, evidence refs, rendering, addedBy), `quotes: { answer: number, text: string }[]` (rendered by code from the transcript), `view`.
- **States:** default; editing (input 2–60 chars, Save/Cancel; lexicon hit shows "Companies will see this. You don't need to share it." as a calm info line, never an error colour); removed (one line: chip struck through + "Removed." + Undo); added by you ("Added by you" pine-50 tag; without words, the quote box is replaced by "Added by you" and the rendering says "They list {phrase} as a skill."); no ESCO match ("No ESCO match. That's fine; it stays on your card."); stale rendering ("Preparing company view…").
- **Test ids:** `card-signal` with `data-signal-id`, `signal-phrase`, `signal-esco`, `signal-quote`, `signal-rendering`, `signal-edit`, `signal-remove`, `signal-undo`, `removed-signal`, `signal-phrase-input`, `signal-phrase-save`, `signal-sensitive-warning`.

### 4.15 CompanyViewSwitch ("What companies see")

- **Purpose:** lets the person see exactly what a company will see, at any time.
- **Anatomy:** segmented control, 2 px ink border, pill: "My view" | "What companies see" (person and building icons; icons hidden on phone so Finnish "Mitä yritykset näkevät" fits on one line; buttons share width equally and wrap if needed).
- **Props:** `value: "person" | "company"`, `onChange`.
- **Company view changes:** hides quotes, Edit/Remove, removed rows, the transcript, the approve and pool boxes, the stamp; renders AI wording in a solid cream box; shows the info banner "This is exactly what a company sees. Your own words, your language and whether you spoke or typed stay with you until you both say yes."; replaces the order note with the fixed label "Written by AI from this person's own words and approved by them. Not a quote, not a verified fact."; the side shows "Nothing here is a score".
- **Accessibility:** `role="group"` with two `aria-pressed` buttons; switching moves focus to the banner.
- **Test ids:** `company-preview` on the company-view region (existing).

### 4.16 ApproveBox, PoolConsent, DataControls

- **ApproveBox:** step "1", "Approve your card", help, tally "7 notes kept · 1 removed" (counts of the person's own notes, for them only), primary large button "Approve my card"; the sticker "Yours to approve" on its top edge; 2.5 px ink border and ink shadow. After approval: leaf line "Approved. You can change your card at any time." and a ghost button "See jobs that fit your card →". While preparing: button label "Preparing company view…", disabled. With no notes kept: disabled, help `card.approve_empty`. Phone: the button and tally live in a fixed bottom bar.
  Test ids: `approve-card`, `card-approved`, `go-to-matches`.
- **PoolConsent:** step "2", `pool.title`, `pool.body`, two radio choices "Yes, suggest me" / "Not now" with help. **Both start unselected and disabled until the card is approved**, with a lock line "Approve your card first. Nothing is chosen for you." After a choice: status line `pool.status.in` or `.out`, and "Leave the pool" with a confirm dialog.
  Test id: `pool-opt-in` (on the "Yes" control).
- **DataControls:** "Your data": ghost "Download my data", danger outline "Delete everything" (confirm dialog `data.delete.confirm`, confirm button `data.delete.yes`), purge notice (amber on sun-soft, clock icon) for live demo sessions.
  Test ids: `export-data`, `delete-data`, `delete-data-confirm`.

### 4.17 PersonHandle

- **Purpose:** the only identity a person has before mutual consent.
- **Anatomy:** sun sticker, 2.5 px ink border (2 px small), `--shadow-ink-sm`, radius 12, rotated −2°; a neutral diamond outline icon; the handle in Fredoka 600 20 px (17 small).
- **Props:** `handle: string`, `size?: "md" | "sm"`.
- **Rules:** the icon is the same diamond for everyone. No initials, avatars, colours per person, flags or generated faces. Always paired with the "Synthetic person" tag where the person is synthetic (`SyntheticTag`: 12 px muted text, 1 px line-strong pill).
- **Accessibility:** `aria-label="Nickname {handle}"`.

### 4.18 ReasonLine

- **Purpose:** one reason a person and a job (or need) relate, with both sources visibly separate.
- **Anatomy:** a two-cell row, 1 px line border, radius 14 (stacked on phone with a hairline between):
  - left cell, cream: label naming the source, then the card side text;
  - right cell, paper: label "FROM THE POSTING" (person feed), "FROM YOUR POSTING" (company), "FROM THEIR NEED" (intro request), then the posting sentence in curly quotes.
- **Variants:**
  - `feed` (person): left label "FROM YOUR CARD", the phrase in 600 weight, and "See your own words" toggle that reveals the person's sentence in a sun-soft quote with "Your words · answer N".
  - `organiser`: compact grid row: 124 px label column "FROM THE CARD · AI WORDING" / "FROM THE POSTING", then text; two rows per reason, dashed divider between reasons.
  - `company`: left label "FROM THE CARD · AI WORDING"; after mutual consent adds `RevealedQuote` under the AI wording (label "IN THEIR OWN WORDS", quote, "Shown to you after you both agreed").
- **Props:** `cardText: string`, `cardKind: "phrase" | "rendering"`, `postingSentence?: string | null` (when null, show the ESCO label as "Mentions {label}"), `ownWords?: { answer, text }`, `revealedQuote?: string`, `variant`.
- **Rule:** the card side is never in quote marks; only posting sentences and the person's own words are.
- **Test ids:** `match-reason`, `see-own-words`, `own-words` (feed); `pick-reason` (organiser, company); `revealed-quote`.

### 4.19 NotMentionedList

- **Purpose:** shows what the conversation did not cover, without implying anything is missing.
- **Anatomy:** dashed line-strong box, radius 14; label "NOT MENTIONED IN THE CONVERSATION" (person: "…IN YOUR CONVERSATION"); dashed pill per item (statutory items append "(checked by the employer at hiring)" in muted); fine line "Not mentioned does not mean missing." + audience suffix ("You can still apply." / "Ask about it when you meet.").
- **Props:** `items: { text: string, statutory?: boolean }[]`, `audience: "person" | "organiser" | "company"`.
- **Rules:** never the words "missing", "lacking", "gap", "fails", never a red or amber colour, never a count, never a "MUST" label beside a person. Items are listed must first then nice (posting order), max 5 for the person.
- **Test ids:** `not-mentioned` (feed), `pick-not-mentioned` (organiser, company).

### 4.20 JobPostingCard

- **Purpose:** one real open job in the person's feed.
- **Anatomy:** paper card, 1 px line, radius 20, padding 22/24. Pine-50 briefcase icon (hidden on phone); title (Fredoka 22); real employer name (600); meta row: pin + municipality/district, calendar + "Closes {date}"; `ReasonLine`s (1–3, variant feed); `NotMentionedList`; footer: source attribution "Source: Työmarkkinatori" (or The Hub / Kuntarekry) on the left, ghost button "Open the posting ↗" on the right (full width on phone).
- **Props:** `match: JobMatch` (title, employer, place, closesAt, url, source, reasons, notMentioned).
- **States:** reasons loading (code-rendered reasons shown first, no spinner); "Requirements not read yet." in place of the not-mentioned list when no Need Card draft exists.
- **Rules:** no percentages, no "top match", no "best fit" sorting label. The feed header says what the list is: "Real open jobs whose posting mentions something from the notes on your card. Nothing here is scored."
- **Test ids:** `job-match` with `data-job-id`, `job-link`, `source-attribution`.

### 4.21 IntroRequest (person side)

- **Purpose:** a company asks to meet; the person decides.
- **Anatomy:** paper card, 2.5 px ink border, ink shadow, sticker "A company would like to meet you" on the top edge; heading (Fredoka 26) "{Demo company 11} would like to meet you about {need title}."; lead "**Your name stays hidden unless you accept.**" + need summary; "WHY THEY WERE SHOWN YOUR CARD" with 1–3 `ReasonLine`s (right label "FROM THEIR NEED"); status line with clock "Waiting for your answer. Please answer by {date}."; two **equal ghost large buttons** "✓ Accept" and "✕ Decline".
- **States:** pending; accept form (fields "Your name for this company" with help "Shown only to {company}, for this meeting." and "How they can reach you" with help "An email address or a phone number."; primary "Share and accept", ghost "Cancel"); accepted (leaf "You both said yes.", `Slot` "Thu 26 Nov, 13:00 · Table 11", "{company} now sees your name and your own words on your card.", "Open your agenda"); declined ("You declined. The company sees a neutral message, with no reason."); expired ("No answer before {date}. The request has closed."); waiting for organiser ("Waiting for an organiser").
- **Test ids:** `intro-request` with `data-intro-id`, `intro-status`, `intro-accept`, `intro-decline`, `intro-name`, `intro-contact`, `intro-confirm`.

### 4.22 PickCard (organiser)

- **Purpose:** one person suggested for one need, decided on its own.
- **Anatomy:** a three-column row (200 px / 1fr / 264 px), paper, 1.5 px line, radius 18.
  - Left: `PersonHandle` (small); the company-view summary (14 px); "Why today: {rotation reason}" (12.5 px muted, e.g. "Not suggested to anyone for 3 days"); `SyntheticTag`; origin note "This person asked to meet you" for talent requests.
  - Middle: `ReasonLine`s (organiser variant); `NotMentionedList`.
  - Right: `DecisionControls`.
- **States:** undecided; selected (2 px ink border + `--shadow-ink-sm`, `aria-current="true"`); approved (folds to one line when not selected: handle + first reason + "✓ Approved" + Undo); removed (folds, but **keeps its reason text visible**); out of date ("This pick was drafted against an older card. Approve is off until it is redrafted." and Approve disabled).
- **Rules:** the list is labelled "{n} suggestions · in no particular order · listed A to Z by nickname" and sorted by handle. No number, bar, or chip fill per person. Requirement chips at the need header (must/nice) are about the job, not the person.
- **Test ids:** `review-pick` with `data-pick-id`, `pick-reason`, `pick-not-mentioned`, `pick-status`, `pick-out-of-date`.

### 4.23 DecisionControls and RemoveReasonDialog

- **DecisionControls:** two buttons side by side, **identical style** (ghost: paper fill, 2 px ink border, 46 px high, same width): "✓ Approve [A]" and "− Remove [R]". Under them, "Decide this person on their own." After a decision: status ("✓ Approved" in leaf with "Will be in today's list for this company." / "− Removed" in ink with the reason) and "Undo [U]" quiet button. There is no "Approve all", no checkbox.
  Test ids: `pick-approve`, `pick-remove`, `pick-undo`.
- **RemoveReasonDialog:** centred modal (460 px, 2.5 px ink border, ink shadow) over a 40 % night scrim. Title "Why remove {handle} from today's list?"; help "The reason goes to the audit log. It is never shown to the person as a judgement."; five radio options with number keys: 1 "The reasons do not hold up when I read the card", 2 "Already in contact with this company", 3 "Same person already picked for another need of this company", 4 "The person asked not to be suggested here", 5 "Other (write why)"; note textarea ("Note (needed for Other)"); Cancel [Esc] ghost, "Remove {handle}" [Enter] primary. **No reason is preselected**; the confirm button stays disabled until one is chosen (and a note is written for Other). While open, the row's Approve and Remove are covered and inert.
  Test ids: `pick-remove-panel`, `pick-remove-reason`, `pick-remove-note`, `pick-remove-confirm`.
- **Accessibility:** `role="dialog" aria-modal="true"`, focus moves to the first radio, focus is trapped, Esc closes and returns focus to Remove.

### 4.24 PublishBox, KeysBar, KeysOverlay

- **PublishBox:** paper, 2 px ink border, 3 px ink shadow: status ("3 of 4 left to decide" / "Every suggestion has a decision" / "Published"), primary "Publish to {Demo company 03} [P]" disabled until all decided, help that **names the blockers**: "Publish turns on when every suggestion has a decision. Decide **Harbour-90, Lantern-63 and Quartz-14** first." Never a progress bar or segment ticks. After publishing: "Sent to the company's private link." and the link.
  Test ids: `publish-digest`, `digest-link`.
- **KeysBar:** fixed bottom strip in the review queue: J K move · A approve · R remove, with a reason · U undo · P publish · ? all keys, and on the right in ink "One person at a time. No approve-all."
- **KeysOverlay:** modal listing every key from `organiser-console.md` 3.2, headed "Every key acts on one person. No key acts on several."

### 4.25 RequirementList, RequirementQuestion, PoolEvidenceLine

- **RequirementList:** rows of requirement text + kind ("Must-have" / "Nice-to-have", 12.5 px muted 600) in posting order; on the Need Card page each row adds category label, source ("From your posting" with expandable sentence, or "Added by you"), inline edit, kind toggle.
  Test ids: `requirement` with `data-requirement-id`, `requirement-text`, `requirement-kind`, `requirement-category`, `posting-sentence`, `statutory-note`.
- **RequirementQuestion:** cream box, 2 px ink border, label "A QUESTION ABOUT {requirement}", question in Fredoka 18, `why` line, `PoolEvidenceLine`, four equal ghost buttons in a 2 × 2 grid (one column in narrow rails): "Keep as must-have", "Make it nice-to-have", "Change the wording", "Remove it". Answered: the answer text, no buttons. Statutory requirements show "Set by law or regulation. Not questioned here; the employer checks it at hiring." instead.
  Test ids: `requirement-question`, `question-text`, `question-controls`, `question-answer-keep`, `question-answer-make_nice`, `question-answer-reworded`, `question-answer-remove`, `question-answered`, `question-reword-input`, `question-reword-save`.
- **PoolEvidenceLine:** paper box, 1 px line, 14 px; the exact text from `need-card.md` 5.4 with the two numbers in bold, then "As of {time}" in 12.5 px muted. These are pool aggregates, never about one person.
  Test id: `pool-evidence`.

### 4.26 PickCard (company) and RevealBlock

- **PickCard (company):** paper, 1.5 px line-strong, radius 22. Header: `PersonHandle` + `SyntheticTag` (+ "This person asked to meet you" pine-50 pill for talent requests). Headline: the company-view summary in Fredoka 22, followed immediately by the AI label "AI · Written by AI from this person's own words and approved by them. Not a quote, not a verified fact." Reasons (company variant), `NotMentionedList` (company), action row.
- **Actions:** primary "Ask to meet" + muted "Their name stays hidden unless they accept." → confirm dialog (`company-view.md` 2.1) → "Request sent. Waiting for the person to answer (until {date})." + Withdraw. Talent-initiated: equal ghost "Accept" / "Decline". Declined: "The person chose not to meet this time." Expired: "No answer before {date}. The request has closed."
- **RevealBlock** (after both agreed): replaces the header; sun-soft band with 2 px ink bottom border: leaf "✓ You both agreed to meet.", name (Fredoka 30), contact, handle + Synthetic tag, `Slot` with the meeting time and place. The card gets the 2.5 px ink border and ink shadow. Each reason adds `RevealedQuote`.
- **Rules:** before mutual consent no name, contact, original words, interview language, input mode, numbers or ordering cue. No digits on the card except in the handle, dates, times and requirement texts (`company-view.md` CV4). Display order is shuffled per digest.
- **Test ids:** `pick-card` with `data-pick-id`, `pick-reason`, `pick-not-mentioned`, `ask-to-meet`, `ask-to-meet-confirm`, `ask-to-meet-send`, `intro-status` (with `data-status`), `revealed-block`, `revealed-name`, `revealed-contact`, `revealed-quote`.

### 4.27 Banners

| Banner | Look | Text | Test id |
|---|---|---|---|
| AI disclosure | 4.12 | `ai.disclosure` | |
| Masked demo company | sun-soft, 2 px ink border, ink shadow, mask icon; cannot be dismissed | "**Demo company 03.** Based on a real public posting. The employer's name is hidden. The people below are synthetic." + muted second line "WorkEspoo is a hackathon prototype, not an official City of Espoo service." | `masked-banner` |
| Seeded demo history | paper, 1.5 px dashed line-strong, muted 14 px, info icon | "This history was seeded for the demo. Decisions from today are live." (organiser overview, audit, exposure) | |
| Company preview | pine-50, 1 px pine-100, info icon | 4.15 | `company-preview` |
| Purge notice | amber on sun-soft, clock icon | `card.purgeNotice` | |
| Organiser preview | dashed pill in the header | "Organiser preview" watermark on company pages opened from the console | |
| Prototype line | footer, 13 px muted, centred | `consent.prototype` | |

### 4.28 Button

| Variant | Look | Use |
|---|---|---|
| `primary` | Pine fill, white text, 2 px ink border, `0 4px 0 ink`; pressed moves 3 px | One main action per region: Send, Approve my card, Publish, Ask to meet, Start the conversation, Share and accept, confirm in dialogs |
| `ghost` | Paper fill, 2 px ink border, ink text | Secondary actions and every **paired decision** (Approve/Remove, Accept/Decline, the four question answers) |
| `quiet` | Pine text, no border, pine-50 hover | Edit, Remove on a card row, Undo, Add a person, Withdraw |
| `danger` | Danger text, light danger border | Delete everything (own data only) |
| `talk` | 4.3 | Hold to talk |

Sizes: default 44 px min height, 15 px 600; `lg` 56 px, 17 px; `block` full width. Icons 18 px, gap 8. Keyboard hints in `<kbd>` inside the button. Disabled: warm grey fill, muted text, no shadow, `aria-disabled` plus a visible reason nearby. Labels wrap (`text-align: center`); never truncate.

### 4.29 Form fields

- **Input / Textarea / Select:** white fill, 2 px line-strong border, radius 12, 48 px min height, 16 px text; focus pine border + 3 px pine 15 % ring; invalid: danger border + 13 px danger message under the field with `aria-describedby`.
- **Field:** label (14 px 600) above, hint (13 px muted) below, error below the hint.
- **Choice (radio/checkbox card):** 1.5 px line-strong, radius 14, 18 px control in pine; checked: pine border + pine-50 fill; disabled: 60 % opacity, not-allowed cursor. Consent controls start unchecked.
- **Consent screen (`/interview`):** checkboxes `consent-interview`, `consent-voice`, `consent-live-demo`; mode choice cards `mode-express`, `mode-full`; optional CV textarea `cv-text`; primary `start-interview`; error `start-error`.

### 4.30 Sticker, Tag, Toast, Dialog, Slot

- **Sticker:** sun, 2.5 px ink border, 3 px ink shadow, radius 10, Fredoka 600 15, −3°. One per region at most. Uses: "Real open jobs", "Yours to approve", "A company would like to meet you". Never on a person's skill.
- **Tag:** cream pill, 1 px line-strong, 14 px 500 (looking-for values).
- **Toast:** ink, white 14 px, bottom centre, 2.4 s, `role="status"`.
- **Dialog:** paper, 2–2.5 px ink border, ink shadow, radius 20–24, max 440–460 px, 45 % night backdrop; actions right-aligned, primary last.
- **Slot:** sun-soft, 2 px ink border, radius 14, calendar icon, Fredoka 20: "Thu 26 Nov, 13:00 · Table 03".

### 4.31 Empty, loading and error states

- **EmptyState:** dashed line-strong box or ghost placeholders in the shape of what will come (ghost chips, ghost tiles), one plain sentence that says what will appear and how. No illustrations of people. Never a bare "0".
- **LoadingState:** the thinking mascot (96 px) with its badge words, or a single muted line ("Preparing your notes…", "Preparing company view…"). No spinners on content that can show code-rendered fallbacks first.
- **ErrorState:** calm, inline, with what still works and one action: `role="alert"`, ink text on paper with a 2 px danger left border, the message from `copy.md` section 8 and "Try again". Never blame the person.

---

## 5. Screens

Every route in `docs/ROUTES.md`. The test ids listed there stay on the same elements; the ones added by the current pages (section 4) stay too.

### `/` front page

Exists (`src/components/coming-soon/`). Keep its voice and layout. Product screens borrow from it: Fredoka headlines, hard ink shadows, stickers, tape, the Cheer W. Its smiling mascot faces belong to the marketing page only; the interviewer has no face. Primary CTA links to `/interview`. Test ids: header set.

### `/how-it-works`

- **Desktop:** `PageShell` (talent). Single column, max 760 px. Title "How WorkEspoo works" (display). The text of `responsible-ai.md` §7, each bold lead as an `h3` in Fredoka 20 with the paragraph under it. A small sticker "Not an official City of Espoo service" beside the title. ESCO credit and prototype line in the footer.
- **Phone:** same, 16 px gutters.
- **Most prominent:** "The AI takes notes. It does not judge."
- **States:** static page; no loading or error.

### `/interview` (consent and start)

- **Desktop:** `PageShell` (talent). Centred card (max 720 px, 2.5 px ink border, ink shadow, tape strip). Mascot at 120 px idle beside the title "Before we start". `consent.intro`; the five `consent.point.*` as a list with small sun-dot bullets; checkboxes (interview required, voice optional with help, live demo when relevant), all unchecked; interview language select with help; mode choice (express / full) as two equal choice cards; optional CV textarea with help; primary large "Start the conversation"; link "How this works"; prototype line.
- **Phone:** one column, fixed bottom bar with "Start the conversation".
- **Most prominent:** the title and the "The interviewer is an AI. It does not score you or judge your answers." point.
- **States:** start disabled until the required box is ticked (with the reason shown); starting ("Starting…"); error `start-error` with "Try again"; CV errors from `copy.md`.
- **Test ids:** `consent-interview`, `consent-voice`, `consent-live-demo`, `mode-express`, `mode-full`, `cv-text`, `start-interview`, `start-error`, `interview-language`.

### `/interview/[id]` (the live interview)

Reference: `interview.html`, shots `interview-*.png`.

- **Desktop (1440 × 900):** top bar: logo, "Question N of 5" + five progress dashes (done pine, current sun, rest line), languages, ghost Stop. Below, a three-column grid filling the viewport height (each column scrolls on its own, the talk controls never leave the screen): left 280–320 px `Transcript`; centre `AiDisclosure` → `InterviewerMascot` (236 px) → `InterviewerLine` → `WordsBox` → controls pinned to the bottom (`HoldToTalk` | "or" | `TypeAnswer`, then hints row: noisy-place hint left, "Skip question" right); right 360–400 px `NotesList` then `JobsLit` board.
- **Phone (390 × 844):** top bar: logo, "Question N of 5", Stop. One column: compact AI line → mascot 132 px → line 22 px → WordsBox → NotesList (wrapping, newest first) → JobsLit board → Transcript. Fixed bottom bar: `JobsMini` line, then `HoldToTalk` + `TypeInsteadButton`.
- **Presenter (1280 × 720, 1920 × 1080):** the organiser toggles it; the transcript column hides (the WordsBox carries the person's words), centre and right scale up, nothing under 16 px.
- **Most prominent:** the mascot and the interviewer line; at the moment a note lands, the marked sentence, the flying note and the jobs count.
- **States:** start (step 0: speaking the opening; empty WordsBox, ghost chips, ghost tiles, "Real open jobs light up here as you talk."); listening; thinking; speaking; done (badge "Interview finished", closing line, single centred "Check my notes" button, hints hidden); stopped early (Stop dialog: "Stop the interview?" Keep talking / Stop and review my notes); preparing notes (`interview.preparing`); mic denied / unsupported (inline alert, text mode); network dropped (`error.network`, retry); slow model (`error.model.slow` under the line after 6 s); session expired or idle (full-page message with "Start a new conversation").
- **Test ids:** `interviewer-text`, `transcript`, `answer-input`, `send-answer`, `talk-button`, `signal-chip` (+`data-signal-id`), `jobs-lit-count`, `interview-done`, `go-to-card`, `turn-remove`, `skip-question`, `stop-interview`, `send-failed`, `coverage-hint`, `voice-status`, `voice-partial`, `voice-final`.

### `/card`

Reference: `card.html`, shots `card-*.png`.

- **Desktop:** `PageShell` (talent, My card current). Intro row: title "Your Signal Card" + `card.intro` on the left, `CompanyViewSwitch` on the right. Two columns (1fr / 360 px): `SignalCard` then the transcript disclosure ("Your answers", help, sentence buttons for corrections); side column sticky: `ApproveBox`, `PoolConsent`, `DataControls`.
- **Phone:** one column; header summary collapsed; Edit/Remove under each row's evidence; the side boxes follow the card; fixed bottom bar with tally + "Approve my card" (after approval: "See jobs that fit your card →"). The first note's chip and the start of its quote are visible on the first screen.
- **Most prominent:** the card (tape, ink border, handle sticker) and the Approve button.
- **States:** waiting for synthesis; draft; edited; removed with undo; approved (stamp, pool unlocked, go to matches); company view; empty; synthesis error; save error (`error.save` inline under the row); live-demo purge notice; signed out (`card-signed-out`: "Start a conversation to make your card.").
- **Test ids:** `card-headline`, `card-signal` (+`data-signal-id`), `signal-quote`, `signal-rendering`, `signal-remove`, `approve-card`, `card-approved`, `pool-opt-in`, `go-to-matches`, `export-data`, `delete-data`, `delete-data-confirm`, plus `company-preview`, `card-empty`, `card-waiting`, `card-error`, `card-signed-out`, `card-action-error`, `removed-signal`, `signal-undo`, `signal-edit`, `signal-phrase`, `signal-phrase-input`, `signal-phrase-save`, `signal-esco`, `signal-sensitive-warning`, `looking-for-form`, `looking-for-roles`, `looking-for-work-mode`, `looking-for-start`, `looking-for-languages`, `looking-for-save`.

### `/matches`

Reference: `matches.html`, shots `matches-*.png`.

- **Desktop:** `PageShell` (talent, My matches current). Title "My matches" + the "Nothing here is scored" lead. Two columns (1fr / 340 px): `IntroRequest`s first (one card each), then section "Open jobs that fit your card" with "Showing N of M · Espoo and nearby", then `JobPostingCard`s; rail: card status box (handle, "Your card is approved", note count and time, pool status, "Edit my card"), "How suggestions work" box.
- **Phone:** one column; intro requests, then the feed, then the rail boxes.
- **Most prominent:** an open intro request; otherwise the first posting.
- **States:** no card yet ("Approve your card to see jobs that fit it." + link to `/card`); feed loading (code-rendered reasons first); empty (`matches-empty`: "No open jobs mention your notes yet. New postings arrive every day."); error ("Job matches are not available right now. Your card is saved." + Try again); intro states from 4.21.
- **Test ids:** `job-match`, `match-reason`, `not-mentioned`, `job-link`, `source-attribution`, `intro-request`, `intro-accept`, `intro-decline`, `intro-status`, `intro-name`, `intro-contact`, `intro-confirm`, `see-own-words`, `own-words`, `matches-empty`.

### `/organiser` (passcode, then overview)

- **Passcode (desktop and phone):** centred small card (max 420 px, ink border, ink shadow): mascot 96 px idle, "Organiser sign-in", passcode input, primary "Sign in", error line. Test ids `passcode-input`, `passcode-submit`, `passcode-error`.
- **Overview desktop:** `PageShell` (organiser, Overview current). Header row: event name and date, "Run today's picks now" ghost button with last-run status. Seeded-history banner. Blocks as stacked panels: Companies table (masked name, posting title, Need Card status chip, questions answered "a of q", today's digest status, intros open/accepted; row actions: open need, open in review, preview as company, copy link); Talent block (interviews started, completed, cards approved, in pool; express vs full) as plain counts; Last daily run (step list with status). Settings section with "Reset demo" (danger outline) and its confirm dialog.
- **Phone:** tables become stacked cards; not optimised beyond readability.
- **Most prominent:** the companies table and the review link with the undecided count.
- **States:** empty ("No companies yet. Seed the demo event in Settings, or add companies from postings."), run in progress, run error (text from the run).
- **Test ids:** `passcode-input`, `passcode-submit`, `reset-demo`, `reset-demo-confirm`, `overview-companies`, `open-review`.

### `/organiser/review`

Reference: `review.html`, shots `review-*.png`.

- **Desktop:** `PageShell` (organiser, Today's review with badge). Two columns: left rail 280 px (title, date and event, "Run today's picks now" ghost button + last run, companies with status dots: sun = undecided, leaf = published, grey = nobody relates; the rule note at the bottom); work area: need header (company masked name line, need title, one-line summary, requirement chips with Must/Nice, "Must-haves are asked as questions to the company. Nobody is filtered out.") with `PublishBox` on the right; list head "{n} suggestions · in no particular order · listed A to Z by nickname" + "+ Add a person to this need [N]"; `PickCard`s; fixed `KeysBar` at the bottom.
- **Phone:** not a target. If opened, rail becomes a company select at the top, pick columns stack, buttons stay side by side and equal.
- **Most prominent:** the selected pick and its two equal decision buttons; the publish box.
- **States:** nothing drafted (`review-empty`: "Nothing to review yet. Run today's picks."); running; all decided (publish enabled); published; all published ("All of today's digests are published."); need with nobody eligible (row "Nobody relates to {need} yet. See the pool view."); notices (`review-notice`); remove dialog; keys overlay.
- **Test ids:** `run-daily`, `review-digest` (+`data-digest-id`), `review-pick` (+`data-pick-id`), `pick-reason`, `pick-approve`, `pick-remove`, `pick-remove-reason`, `publish-digest`, `digest-link`, plus `order-note`, `review-notice`, `review-empty`, `pick-not-mentioned`, `pick-status`, `pick-undo`, `pick-remove-panel`, `pick-remove-note`, `pick-remove-confirm`, `pick-out-of-date`.

### `/organiser/audit`

- **Desktop:** `PageShell` (organiser, Audit log). Seeded-history banner. Filter row: action select (`audit-filter`), subject search. A plain table, newest first: time (tabular), actor (organiser / company / talent / system), action code in a mono pill (`pick.approved`), subject (handle or company display name, never a person's name), detail. Rows are 44 px, hairline separated. "Load older" at the end.
- **Phone:** each row becomes a two-line item.
- **Most prominent:** the newest rows; during the demo the filtered trail for one pick.
- **States:** empty ("No events yet."), loading (skeleton rows of hairlines only), error.
- **Test ids:** `audit-row` (+`data-action`), `audit-filter`.

### `/organiser/exposure`

- **Desktop:** `PageShell` (organiser, Exposure). Toggle "Last 7 days" / "Whole event". Four band panels in a row (Not suggested; Suggested 1–2 times; 3–5 times; 6 or more): each shows the band name, how many people, and their handles alphabetically as small handle stickers wrapping. Panels are equal in size and colour (no heat colours): the point is to spot who is unseen, not to rank. Below: "Removed every time" list (alphabetical, "see decisions" links), spread summary as two plain sentences, twins check line.
- **Phone:** bands stack.
- **Most prominent:** the "Not suggested" band.
- **States:** empty ("No picks drafted yet.").
- **Test ids:** `exposure-band` (+`data-band`), `exposure-handle`.

### `/organiser/pool`, `/organiser/unmatched`, `/organiser/settings`, `/organiser/people/[talentId]` (later)

Use the same shell and components: tables of aggregates (pool), handle lists sorted A to Z with cause labels and action buttons in ghost style (unmatched), form fields (settings), and a read-only `SignalCard` in company view with the pick history table (person detail). Original words only behind "Show original words" (logged, 10 minutes).

### `/c/[token]` (company digest)

Reference: `company.html`, shots `company-*.png`.

- **Desktop:** `PageShell` (company: logo, "For companies", languages; no nav). Masked banner (full width). Title "Your picks for {date}" + bold "{n} people from the Espoo talent pool for {need}. In no particular order." + how it works line. Two columns (1fr / 340 px): company `PickCard`s; rail: "Your need" box (title, "Drafted from your public posting on {date}", status chip, `RequirementList`, the open `RequirementQuestion` with `PoolEvidenceLine`, "Must-haves never remove anyone from your picks.", ghost "Open your need card"), then "Your meetings" box. Footer prototype line.
- **Phone:** banner, title, picks, then the need box and meetings.
- **Most prominent:** the masked banner and the picks.
- **States:** not published ("Your first picks are being reviewed by an Espoo organiser. Meanwhile, please check your need above." `not-published`); nobody eligible; all answered; expired or tampered link (`link-expired`: full page "This link has expired. Ask the organiser for a new one." with the banner).
- **Test ids:** `masked-banner`, `need-link`, `pick-card`, `pick-reason`, `pick-not-mentioned`, `ask-to-meet`, `ask-to-meet-confirm`, `ask-to-meet-send`, `intro-status`, `revealed-block`, `revealed-name`, `revealed-contact`, `revealed-quote`, `not-published`, `link-expired`.

### `/c/[token]/need/[needCardId]` (Need Card)

- **Desktop:** `PageShell` (company). Masked banner. Header: need title (`need-title`, display), summary (`need-summary`), "Drafted from your public posting on {date}", status chip (`need-status`: "Please check" sun-soft / "Confirmed {date}" leaf-soft). Fixed explanatory line: "Must-haves never remove anyone from your picks. We show what the conversation did not cover as 'not mentioned', so you can ask about it when you meet." Requirement rows (single column, max 820 px), each a paper panel: text with pencil edit, kind toggle (segmented "Must-have | Nice-to-have"), category label, source line with expandable posting sentence, `PoolEvidenceLine` with "as of", then either `RequirementQuestion` or the statutory note. "Add a requirement" form (text, kind, category, ESCO autocomplete). Primary large "Confirm this need" at the end; after confirm, `need-confirmed` line.
- **Phone:** one column; question buttons in one column.
- **Most prominent:** the open question with its pool evidence.
- **States:** draft; confirmed; question answered; lint error on company text ("This describes a personal characteristic, not the work. Describe the skill or language level the work needs instead."; hint "Try 'fluent working Finnish'."); save error (`question-error`); expired link.
- **Test ids:** `need-title`, `requirement` (+`data-requirement-id`), `requirement-question`, `question-answer-keep`, `question-answer-make_nice`, `pool-evidence`, `confirm-need`, plus `masked-banner`, `need-summary`, `need-status`, `need-confirmed`, `requirement-text`, `requirement-kind`, `requirement-category`, `posting-sentence`, `statutory-note`, `question-text`, `question-controls`, `question-answered`, `question-answer-reworded`, `question-answer-remove`, `question-reword-input`, `question-reword-save`, `question-error`.

### `/agenda/[token]` (static, second pass)

Plain static HTML: banner (for company agendas), event name, date, place, list of meetings (time in Fredoka 20, place, the other side's revealed name, need title), "Generated {time}". Uses only tokens, no JavaScript.

---

## 6. Words

Tone: plain, warm, short, non-judgemental. Speak to the person as "you", to companies as "you" and about people as "they" or "this person". No hype ("smart", "magic", "AI-powered"), no praise of the person, no exclamation marks, no blame ("we couldn't", never "you didn't"). Say what will happen and who decides. All other strings are in `docs/specs/copy.md` and the specs; these fixed phrases carry the product's rules and must not be paraphrased.

| Key | English | Finnish | Swedish |
|---|---|---|---|
| No order | In no particular order | Ei missään erityisessä järjestyksessä | I ingen särskild ordning |
| Sort note | listed A to Z by nickname | lempinimen mukaan A–Ö | sorterade A–Ö efter smeknamn |
| Not mentioned (company/organiser) | Not mentioned in the conversation | Ei mainittu keskustelussa | Nämndes inte i samtalet |
| Not mentioned (person) | Not mentioned in your conversation | Ei mainittu keskustelussasi | Nämndes inte i ditt samtal |
| Not missing | Not mentioned does not mean missing. | Mainitsematta jääminen ei tarkoita puutetta. | Att något inte nämndes betyder inte att det saknas. |
| Own words label | Your words | Omat sanasi | Dina ord |
| Own words (phrase) | In your own words | Omin sanoin | Med dina egna ord |
| Their words (revealed) | In their own words | Omin sanoin | Med egna ord |
| Reveal label | Shown to you after you both agreed | Näytetään, koska suostuitte molemmat | Visas eftersom ni båda har sagt ja |
| Only you | Only you see your own words. | Vain sinä näet omat sanasi. | Bara du ser dina egna ord. |
| Marked words | Marked words became notes. | Merkityistä sanoista tuli muistiinpanoja. | Markerade ord blev anteckningar. |
| AI disclosure | You're talking with an AI. It takes notes; you review and approve them at the end. | Keskustelet tekoälyn kanssa. Se tekee muistiinpanoja, jotka tarkistat ja hyväksyt lopuksi. | Du pratar med en AI. Den gör anteckningar som du granskar och godkänner i slutet. |
| AI does not judge | The interviewer is an AI. It does not score you or judge your answers. | Haastattelija on tekoäly. Se ei pisteytä sinua eikä arvioi vastauksiasi. | Intervjuaren är en AI. Den poängsätter dig inte och bedömer inte dina svar. |
| AI wording label | Written by AI from this person's own words and approved by them. Not a quote, not a verified fact. | Tekoäly kirjoitti tämän henkilön omien sanojen pohjalta, ja hän on hyväksynyt sen. Ei lainaus eikä varmistettu tieto. | Skrivet av AI utifrån personens egna ord och godkänt av personen. Inget citat och inget kontrollerat faktum. |
| Shown to companies | Shown to companies as | Yritykset näkevät tämän näin | Visas för företag som |
| Nothing scored | Nothing here is scored. | Mitään ei pisteytetä. | Inget här poängsätts. |
| Notes not scores | Nothing is scored: they are notes, and you decide what stays. | Mitään ei pisteytetä: nämä ovat muistiinpanoja, ja sinä päätät, mitä jää. | Inget poängsätts: det är anteckningar, och du bestämmer vad som stannar. |
| Jobs empty | Real open jobs light up here as you talk. | Oikeat avoimet työpaikat syttyvät tähän, kun puhut. | Riktiga lediga jobb tänds här medan du pratar. |
| Yours to approve | Yours to approve | Sinä päätät | Du bestämmer |
| Approved by you | Approved by you | Sinä hyväksyit | Godkänt av dig |
| Consent not chosen | Approve your card first. Nothing is chosen for you. | Hyväksy korttisi ensin. Mitään ei ole valittu valmiiksi. | Godkänn ditt kort först. Inget är förvalt. |
| Name hidden | Your name stays hidden unless you accept. | Nimesi pysyy piilossa, ellet hyväksy. | Ditt namn förblir dolt om du inte säger ja. |
| Both said yes | You both said yes. | Sanoitte molemmat kyllä. | Ni har båda sagt ja. |
| One at a time | One person at a time. No approve-all. | Yksi ihminen kerrallaan. Ei kaikkien hyväksymistä kerralla. | En person i taget. Ingen godkänn alla. |
| Decide alone | Decide this person on their own. | Päätä tästä ihmisestä erikseen. | Avgör den här personen för sig. |
| Removal reason | The reason goes to the audit log. It is never shown to the person as a judgement. | Syy tallentuu lokiin. Sitä ei koskaan näytetä henkilölle arviona. | Skälet sparas i loggen. Det visas aldrig för personen som ett omdöme. |
| Must-haves | Must-haves never remove anyone from your picks. | Pakolliset vaatimukset eivät koskaan poista ketään ehdotuksistasi. | Skall-krav tar aldrig bort någon från dina förslag. |
| Synthetic | Synthetic person | Synteettinen henkilö | Syntetisk person |
| Masked banner | Demo company 03. Based on a real public posting. The employer's name is hidden. The people below are synthetic. | Demo company 03. Perustuu oikeaan julkiseen työpaikkailmoitukseen. Työnantajan nimi on piilotettu. Alla olevat ihmiset ovat synteettisiä. | Demo company 03. Bygger på en verklig offentlig platsannons. Arbetsgivarens namn är dolt. Personerna nedan är syntetiska. |
| Prototype | Hackathon prototype, not an official City of Espoo service. | Hackathon-prototyyppi, ei Espoon kaupungin virallinen palvelu. | Hackathonprototyp, inte en officiell tjänst från Esbo stad. |
| States | Your turn · Listening… · Writing a question… · Speaking · Interview finished | Sinun vuorosi · Kuuntelen… · Kirjoitan kysymystä… · Puhun · Haastattelu päättyi | Din tur · Lyssnar… · Skriver en fråga… · Talar · Intervjun är klar |
| Talk | Hold to talk · Release to send | Pidä pohjassa ja puhu · Päästä irti, niin viesti lähtee | Håll in och prata · Släpp för att skicka |

The Swedish strings are the design team's translation and need a native check before the event. The interviewer's own lines follow `interview.md` §5 and §6.6 (scripted lines in the participant's language).

---

## 7. What the interface must never show

| Never | The tempting wrong design | The right design |
|---|---|---|
| Match percentages or scores | "Device service technician · 87 % match" on a job card | No number on the card; the reasons say why: "From your card: Fixing handheld scanners / From the posting: 'You diagnose and repair handheld terminals…'" |
| Rankings of people | "Top picks for you", people sorted best first, a "#1" badge | "3 people … In no particular order." Organiser lists sorted A to Z by handle and say so; company order shuffled per digest |
| Levels or strength on skills | Stars, bars, "Expert / Intermediate", bigger chips for stronger skills, one star brighter than the others | Every chip is the same size, border and fill; groups differ only by a small marker shape; NEW marks recency only |
| Counts that read as a person's grade | "6 of 8 requirements met", filled vs outlined requirement chips per person, a progress ring on the card | A "Not mentioned in the conversation" list in dashed pills with "Not mentioned does not mean missing." |
| Confidence or emotion read-outs | "Confidence: high", "Sounds enthusiastic", a mascot that smiles, frowns or nods | A faceless W whose states are shapes plus words: "Listening…", "Writing a question…" |
| AI text dressed as a quote | The rendering "They train new seasonal workers…" in quote marks or in the yellow quote box | Quotes contain only transcript sentences, in the sun-soft box labelled "Your words · Answer 3"; AI wording sits in a separate dashed box labelled "Shown to companies as · AI" |
| Identity cues | Avatars with faces, initials, a flag, "Speaks Finnish (native)", "Answered by voice" | A sun handle sticker with the same neutral diamond for everyone and a "Synthetic person" tag |
| Bulk decisions | "Approve all 4", a header checkbox, shift-click selection | One row selected at a time; "Approve" and "Remove" as two identical ghost buttons; "One person at a time. No approve-all." |
| Nudging toward approval | Filled green Approve beside a small grey "Remove…" link | Identical ghost buttons, side by side, same size, no ellipsis |
| Pre-ticked consent | "Yes, suggest me" selected by default | Both options empty and locked until the card is approved: "Nothing is chosen for you." |
| Celebrating numbers near a person | A green "+29 ↑" next to the person's skills, confetti on approval | A neutral ink-outlined "+29 new" inside the separate jobs board; a static "Approved by you" stamp |
| Decision progress as a meter | Four segment ticks or a progress bar beside "3 of 4" | Text only: "3 of 4 left to decide", and the names of who is still undecided |
| "Missing" language | "Missing: Fluent Finnish" in red, "Gap", "Lacks" | "Not mentioned in the conversation: Fluent Finnish" in muted dashed pills |

---

## 8. Decisions taken from the review

Taken from the judges and applied in the final prototypes:

- Faceless mascot (night): the interviewer is the brand mark, states by shape plus a pencil while thinking (paper).
- Own-words proof at the moment of noting (paper): permanent sentence markers in the transcript and on the main stage, and the note flies from the marked sentence to the interviewer's head and then to the notes list.
- The person's words on the main stage (signal's live caption, extended into the WordsBox that keeps the last answer).
- Neutral "+N new" pill, NEW tag and "answer N" reference on notes (paper, night), empty-state lines in place of a bare "0", ghost chips and tiles on the opening frame.
- Front-page voice on the loud objects only (paper): ink shadows, tape on the card, the handle as a sticker.
- Review queue: equal Approve/Remove, labels on every reason line ("From the card · AI wording", "From the posting"), "Why today" on each pick, named blockers on publish, folded decided rows that keep removal reasons, no preselected removal reason, a real `?` overlay, no segment meter.
- Pool consent unselected and locked until approval; AI label directly above the headline.
- Presenter mode for the projector; phone: wrapping chips, jobs count fixed above the talk button, first quote on the first card screen.

Decided against:

- Night's constellation and skyline: striking, but needs a collision-free layout algorithm and reads as "earning stars".
- Paper's tilted stickers per skill group and the code-routed strings: fragile with re-renders and long Finnish labels, and group finishes risk reading as tiers.
- Group colours as chip fills: groups differ by marker shape only.
- Filled vs outlined requirement chips per person on the company card (allowed by `company-view.md`, but it reads as a tally); the "Not mentioned" list carries the same information. The lead may restore it if the spec insists.
- A dark night theme for the interview: presenter mode stays on cream; a night token set can be added later.
