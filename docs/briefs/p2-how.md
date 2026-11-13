# The public page "How this works"

## Yours

`src/app/how-it-works/**` only (new). This route is lead-owned and handed to you for this task. Spec: `docs/specs/responsible-ai.md`, section 7 has the page's text; sections 1 to 6 are background. The header already links to `/how-it-works`.

## Build

1. The page at `/how-it-works`, a server component, in English, Finnish and Swedish through `src/lib/i18n` (`pick`, `getUiLang`; see `docs/LIB-API.md` and how `src/app/page.tsx` does it). The English text is section 7 of the spec, paragraph by paragraph, with these facts filled in: the voice service is named from the voice configuration (the browser's own speech service unless another adapter is configured; see `src/features/voice` and `/api/voice/config` for how the adapter is known) and the model line reads "an open-weight AI model (Kimi K3.1) run by Verda on servers in Finland". Write real Finnish and Swedish, not word-for-word translations: plain, short sentences a jobseeker reads easily. Keep your messages in `src/app/how-it-works/messages.ts`.
2. A section "What this system has done so far", read from the database when the page is requested and cached for a minute. Totals only, never anything about one person: open postings held; model calls logged, and the median time to the first word of the interviewer's replies over the last 24 hours (table `llm_call`, role `live`, `first_token_ms`); suggestions a human organiser approved and removed (audit actions `pick.approved` and `pick.removed`); introductions both sides agreed to (`intro.accepted`); and the fixed line "Decisions made about a person without a human: 0", which is true by construction and says so in a short note. When the database cannot be read, leave the section out and render the rest.
3. Structure for the restyle that comes later: semantic HTML (one `h1`, an `h2` per paragraph heading, a `dl` or table for the numbers), a little spacing, no design. Test ids: `how-title`, `how-section` on each section, `how-numbers`, and `how-number` with `data-key` on each number.
4. Tests: the page renders in each language with every section; no English sentence is left in the Finnish or Swedish page; the numbers come from a PGlite database you fill with a few rows; the page still renders when the query throws; no model call is made.

## Watch out for

- This page is read by the judges who care most about fairness. Every sentence must be true of the product as built: if the code does not do something the spec text claims, say so in your report instead of printing the claim.
- No names of model or voice vendors that are not actually configured.
