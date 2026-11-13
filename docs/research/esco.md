# ESCO skills taxonomy

Verified with real requests on 2026-11-13.

ESCO gives every skill and occupation one URI with labels in many languages. We use it as the bridge between what a person says (English or Finnish) and Finnish-language job postings, which Työmarkkinatori tags with ESCO occupation URIs and often ESCO skill URIs.

## 1. Bulk labels: Työmarkkinatori code lists (use these)

Plain JSON, no auth, no form.

```
GET https://tyomarkkinatori.fi/api/codes/v1/kopa/ESCO_OSAAMINEN/koodit    # skills, 8.8 MB, about 6 s
GET https://tyomarkkinatori.fi/api/codes/v1/kopa/ESCO_AMMATTI/koodit      # occupations, 4.8 MB, about 4 s
```

Shape: a JSON array of

```json
{
  "tunnus": "0005c151-5b5a-4a66-8aac-60e734beb1ab",
  "uri": "http://data.europa.eu/esco/skill/0005c151-5b5a-4a66-8aac-60e734beb1ab",
  "selite": [
    {"kielikoodi": "fi", "teksti": "johtaa musiikillista henkilökuntaa"},
    {"kielikoodi": "sv", "teksti": "ansvara för musikpersonal"},
    {"kielikoodi": "en", "teksti": "manage musical staff"}
  ],
  "laajennus": [],
  "alkupaiva": "2026-03-26T22:00:00Z",
  "muokkausaika": "2026-04-01T00:00:59Z",
  "loppupaiva": "..."
}
```

- Skills: 15,152 rows with full fi/sv/en labels. 495 have `loppupaiva` (an end date): they are retired, skip them.
- Occupations: 3,039 ESCO occupations, 613 ISCO groups, and 78 Finnish national occupations under `http://data.tyomarkkinatori.fi/esco/occupation/...`. `laajennus` holds the ISCO code and parent URI.
- Preferred labels only: no alternative labels, no descriptions, and **no occupation-to-skill links**.

## 2. Live ESCO API (for links and alternative labels; cache every response)

Base `https://ec.europa.eu/esco/api`, no key. Pin `selectedVersion=v1.2.1`.

| Call | Use | Latency |
|---|---|---|
| `GET /search?text=...&language=en&type=skill&limit=5&full=true&selectedVersion=v1.2.1` | Free-text search. `full=true` returns labels in all languages in one call. | 0.3 to 0.9 s |
| `GET /suggest2?text=hitsau&language=fi&type=skill&limit=5` | Prefix match. Handles Finnish compounds better than `search`. | fast |
| `GET /resource/occupation?uri=<occupationURI>&language=en` | One occupation. `_links.hasEssentialSkill` and `_links.hasOptionalSkill` list every linked skill inline. | about 2.5 s |
| `GET /resource/related?uri=<uri>&relation=hasEssentialSkill&language=en&limit=20` | Paged relation. Other relations: `hasOptionalSkill`, `isEssentialForOccupation`, `isOptionalForOccupation`. | about 0.3 s |
| `GET /resource/skill?uri=<skillURI>&language=en` | One skill with labels in every language and its occupation links. | about 1.5 s |

Gotchas:

- `search` matches whole words, so Finnish compounds miss ("hitsaus" does not find "hitsaustekniikat"). Use trigram matching on our own copy first, `suggest2` as a fallback.
- `search` also matches description text, so the tail of the results is noisy.
- Many Finnish alternative labels are copies of the English ones.
- The official bulk download (which includes the occupation-to-skill table) is behind an email form at https://esco.ec.europa.eu/en/use-esco/download. No direct download.

## 3. How we use it

1. **Load** both code lists into Postgres at setup (`esco_concept`: uri, type, label_en, label_fi, label_sv, isco, retired). Index English and Finnish labels with `pg_trgm`.
2. **Occupation-to-skill links**: for each ESCO occupation URI that appears in ingested postings, call `/resource/occupation` once and store essential and optional skill URIs in `esco_occupation_skill`. This is a background job with polite pacing. Commit a snapshot of the result to `fixtures/` so it never needs re-crawling.
3. **Ground a phrase**: the model proposes a short skill phrase in English (and Finnish if the person spoke Finnish). Code finds the top candidates by trigram similarity over labels, then the model picks one or none. Cache phrase to URI.
4. **"Jobs light up"** during an interview is a SQL join, not a model call: person's skill URIs, to occupations that list them (plus postings that list the skill directly), to active postings.
5. **Finnish terms on cards come from ESCO labels**, not from the model, so they are correct even when the model's Finnish is weak.

Licence: ESCO is published by the European Commission for free reuse with attribution (credit "ESCO, European Commission").
