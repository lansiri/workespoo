# Job-posting sources

Verified with real requests on 2026-11-13. Call all of these from the server only (none send CORS headers). Use a generic User-Agent such as `Mozilla/5.0 (compatible; workespoo-prototype)`, pace requests (a few per second at most), and store the raw JSON next to the normalised row so a format change does not lose data.

## 1. Työmarkkinatori (Job Market Finland): primary source

These are the website's own JSON endpoints. They need no key but are undocumented and can change. The official API (Kipa) needs a subscription key and IP allowlisting through an onboarding process that takes weeks; that is the production path, not the hackathon path.

### Search

```
POST https://tyomarkkinatori.fi/api/jobpostingfulltext/search/v2/search
Content-Type: application/json

{"query":"","filters":{"municipalities":["049"]},"paging":{"pageNumber":0,"pageSize":90},"sorting":"LATEST"}
```

- `query`: free text, max 200 characters.
- `filters`: `municipalities` (KUNTA codes: Espoo `049`, Helsinki `091`, Vantaa `092`, Kauniainen `235`), `regions` (Uusimaa `01`), `postingLanguages` (`fi`, `sv`, `en`), `workLanguages`, `iscoNotations`, `workTimes`, `continuityOfWork`, `employmentRelationships`, `countries`, `tags`.
- `sorting`: `LATEST`, `MOST_RELEVANT`, `CLOSING`.
- `paging`: `pageNumber` starts at 0; `pageSize` max 90 (100 returns HTTP 400). Deep paging works.
- Response: `{pageSize, totalElements, lastPage, content[]}`.
- Search item (summary, no description): `id` (uuid), `title {fi?,sv?,en?}`, `employer.ownerName {fi}`, `employer.businessId[]`, `location.municipalities[] {value:"049", label{fi,sv,en}, region:"01"}`, `location.address`, `publishDate`, `applicationPeriodEndDate`, `applicationUrl.values {lang: url}`, `workTime`, `continuityOfWork[]`, `employmentRelationships`, `industryCode`, `createdSource`.

### Detail

```
GET https://tyomarkkinatori.fi/api/jobposting-new/v1/public/jobpostings/{id}
```

- Top-level keys: `application`, `client`, `descriptionsContentType`, `externalLinks`, `languages`, `location`, `metadata`, `owner`, `position`, `recruiter`.
- `position.title.{lang}`, `position.jobDescription.{lang}` (plain text with `\r\n`, no HTML), `position.marketingDescription`.
- `position.occupations[]`: `{uri (ESCO occupation URI), prefLabel{en,fi,sv}, altLabel}`; `position.mainOccupation` (ESCO URI).
- `position.skills[]`: ESCO skills. Present on many postings (11 on the sample checked), empty on others.
- `position.workLanguages[]`, `application.published`, `application.expires`, `application.url.{lang}`, `application.openPositions`.
- `owner.company.fi`, `owner.businessId`, `location.municipalities[]`, `location.regions[]`, `location.workplacePostalCode`.
- `metadata.externalId`, `metadata.created`, `metadata.lastModified`, `metadata.status`.
- **`recruiter.contacts[]` holds names, phone numbers and emails. Never store it.** Also redact emails and phone numbers that appear inside the description text.

### Counts on 2026-11-13

| Filter | Postings |
|---|---|
| Espoo (`049`) | 1,338 |
| Helsinki (`091`) | 2,138 |
| Uusimaa (region `01`) | 3,748 |
| All of Finland | 10,928 |
| English-language postings, Espoo | 130 |
| English-language postings, Uusimaa | 305 |

Mostly Finnish. Titles and descriptions are keyed by language.

### Code lists (public JSON, no auth)

`https://tyomarkkinatori.fi/api/codes/v1/kopa/{ESCO_AMMATTI|ESCO_OSAAMINEN|ISCO_AMMATTILUOKITUS|KUNTA|MAAKUNTA}/koodit`. See `esco.md` for the two ESCO lists.

### Attribution and terms

Show "Lähde: Työmarkkinatorin asiakastietojärjestelmä" (Source: Job Market Finland) wherever this data appears, link each posting back to its application URL, and remove postings that disappear from the source. Do not pass the data on to third parties.

## 2. The Hub (thehub.io): startup jobs, English

```
GET https://thehub.io/api/v2/jobs?countryCode=FI&page=1      # list, 15 per page
GET https://thehub.io/api/jobs/{id}                          # detail
```

- List response: `total` (180 for Finland), `limit` 15, `page`, `pages`, plus items with `id`, `key`, `title`, `location{country, locality, address}`, `isRemote`, `company{id, key, name, website, numberOfEmployees, founded, logoImage}`.
- Detail (`doc`): `description` (**HTML**, strip it), `monthlySalaryRange{min,max}`, `equity`, `geoLocation`, `jobRoles[]`, `expirationDate`, `publishedAt`, `absoluteJobUrl`.
- The `location` query parameter barely filters; filter by locality on our side.
- Observed header `x-ratelimit-limit: 100`.
- Terms say content is for personal, non-commercial viewing. Prototype use only; link out to the original.

## 3. Work in Finland (Business Finland): English list, thin items

```
GET https://www.workinfinland.com/api/jobs/?limit=50&page=1&city=espoo
```

- Params: `limit` (100 works), `page` (from 1), `query`, `city` (lowercase id such as `espoo`; `Espoo` is silently ignored), `category`.
- Response: `{totalJobs, totalPages, categories[], cities[], jobs[]}`. Item: `{title, employer{name, city, imageUrl}, expireDate, externalUrl}`. No description and no id.
- 1,220 total; Espoo 316. It aggregates jobly.fi, Työmarkkinatori, The Hub and company career sites, so it overlaps with sources 1 and 2. De-duplicate on `externalUrl` (a Työmarkkinatori UUID or a Hub id is often inside it).
- Low priority: cut first if time is short.

## 4. Kuntarekry: City of Espoo's own jobs, official export feed

```
GET https://kuntarekry.fi/fi/tyopaikat/?organisation=3&lang=fi_FI,sv_SE,en_US&sort=-changetime&limit=500&format=json
```

- `organisation=3` is the City of Espoo. `format` can be `json`, `rss` or `xml`. The RSS variant adds an HTML description.
- JSON item: `id`, `title`, `url` (relative), `profit_center`, `publication_date` (`dd.mm.yyyy`), `publication_end`, `ext_id`, `organisation_title`, `region`, `employment_type`, `location_tags[]`, `profession`.
- 48 postings, Finnish and Swedish.

## 5. Not used

- **Duunitori**: `https://duunitori.fi/api/v1/jobentries?format=json&area=Espoo&search=...` works without auth, but `robots.txt` disallows `/api/` and the terms of service forbid storing, scraping or systematically copying content. Do not ingest it.
- **EURES**: has ESCO codes per posting but duplicates Työmarkkinatori. Fallback only.
- **Oikotie Työpaikat**: gone (redirects to the housing site).

## De-duplication keys

- Työmarkkinatori: `id` (uuid). Employer `businessId` is only available here.
- The Hub: `id`.
- Kuntarekry: `id` / `ext_id`. City of Espoo jobs may also appear on Työmarkkinatori; match on normalised title + employer + closing date.
- Work in Finland: `externalUrl`.
