import { and, eq, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import { job, jobSkill } from "@/db/schema";
import type { EmployerSector, Lang } from "@/contracts";
import { REDACTED, redactContacts, scrubPostingText, scrubSentenceList } from "@/lib/redact";
import { splitSentences } from "@/lib/sentences";
import { createPoliteFetcher, type PoliteOptions, type PoliteFetcher } from "./polite-fetch";

export const TMT_SEARCH_URL = "https://tyomarkkinatori.fi/api/jobpostingfulltext/search/v2/search";
export const TMT_DETAIL_URL = "https://tyomarkkinatori.fi/api/jobposting-new/v1/public/jobpostings";
export const TMT_PUBLIC_URL = "https://tyomarkkinatori.fi/henkiloasiakkaat/avoimet-tyopaikat";
export const TMT_PAGE_SIZE = 90;

/** Public employers by name (docs/specs/need-card.md 4.3, `language_act`). */
const PUBLIC_EMPLOYER =
  /kaupunki|kunta\b|kuntayhtymä|hyvinvointialue|virasto|ministeriö|valtion|city of|municipality|wellbeing services/i;

const LANG_ORDER = ["fi", "en", "sv"] as const;

/** Fallback names for municipalities when a posting arrives without a search summary. */
const MUNICIPALITY_NAMES: Record<string, { name: string; region: string }> = {
  "049": { name: "Espoo", region: "01" },
  "091": { name: "Helsinki", region: "01" },
  "092": { name: "Vantaa", region: "01" },
  "235": { name: "Kauniainen", region: "01" },
};

type NewJob = typeof job.$inferInsert;

export type NormalisedPosting = {
  job: NewJob;
  skillUris: string[];
};

export type NormaliseContext = {
  /** The search-result item for this posting, when known (adds municipality labels). */
  summary?: unknown;
  /** The posting uuid, when the detail lacks `metadata.externalId`. */
  postingId?: string;
  /** Municipality codes the run is scoped to; a posting listing several is filed under the first of these. */
  preferMunicipalities?: string[];
};

// ---------- defensive accessors ----------

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : null);
const strList = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];
const at = (x: unknown, ...path: string[]): unknown => {
  let cur = x;
  for (const key of path) {
    if (!isRec(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
};

/** First non-empty value of a `{fi, en, sv}` map in fi, en, sv order, then any other key. */
function pickLang(map: unknown): { lang: string; text: string } | null {
  if (!isRec(map)) return null;
  for (const lang of [...LANG_ORDER, ...Object.keys(map)]) {
    const text = str(map[lang]);
    if (text) return { lang, text };
  }
  return null;
}

function toDate(x: unknown): Date | null {
  const s = str(x);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function firstOccupation(detail: unknown): unknown {
  const list = at(detail, "position", "occupations");
  return Array.isArray(list) ? list[0] : undefined;
}

// ---------- text ----------

const MARKER_STAND_IN = "xremovedmarkerx";
const BULLET = /^\s*(?:[-•*–—▪●◦·]|\d{1,2}[.)])\s+/;

/** Light clean-up of markdown artefacts; descriptions arrive as plain text or markdown. */
function stripMarkdown(line: string): string {
  return line
    .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1")
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();
}

const NAMED_ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", shy: "" };

/** Decode HTML entities (named basics and numeric) that postings carry in plain text. */
export function decodeEntities(text: string): string {
  return text.replace(/&(?:#(\d{1,6})|#x([0-9a-f]{1,5})|([a-z]{2,6}));/gi, (whole, dec?: string, hex?: string, name?: string) => {
    if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
    const code = dec ? Number(dec) : parseInt(hex ?? "", 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

/** Lines, bullet markers stripped, then sentences per line (docs/specs/need-card.md section 2). */
export function postingSentences(redactedDescription: string): string[] {
  const out: string[] = [];
  for (const rawLine of decodeEntities(redactedDescription).replace(/\r\n?/g, "\n").split("\n")) {
    const line = stripMarkdown(rawLine.replace(BULLET, ""));
    if (line.length < 3) continue;
    // "puh. [removed]" must not be cut after "puh.": hide the marker's leading bracket while splitting.
    const masked = line.split(REDACTED).join(MARKER_STAND_IN);
    for (const piece of splitSentences(masked)) {
      const sentence = piece.split(MARKER_STAND_IN).join(REDACTED);
      if (sentence.length >= 3 && /[\p{L}\p{N}]/u.test(sentence)) out.push(sentence);
    }
  }
  return out;
}

/** Remove `recruiter` and redact every string in the posting, keeping the rest as it came. */
export function sanitiseTmtRaw(value: unknown, top = true): unknown {
  if (typeof value === "string") return scrubPostingText(value);
  if (Array.isArray(value)) return value.map((v) => sanitiseTmtRaw(v, false));
  if (isRec(value)) {
    const out: Rec = {};
    for (const [k, v] of Object.entries(value)) {
      if (top && k === "recruiter") continue;
      out[k] = sanitiseTmtRaw(v, false);
    }
    return out;
  }
  return value;
}

/** A private person as employer: keep nothing that names them. */
function scrubPrivatePerson(raw: unknown): unknown {
  if (!isRec(raw)) return raw;
  const location = isRec(raw.location)
    ? Object.fromEntries(Object.entries(raw.location).filter(([k]) => !k.startsWith("workplaceName")))
    : raw.location;
  return { ...raw, owner: { employerType: "Person" }, location };
}

// ---------- normalisation ----------

export function tmtJobId(postingUuid: string): string {
  return `job_tmt_${postingUuid.replace(/-/g, "").toLowerCase()}`;
}

export function sectorFor(employerName: string): EmployerSector {
  if (!employerName) return "unknown";
  return PUBLIC_EMPLOYER.test(employerName) ? "public" : "private";
}

function municipalityCodes(detail: unknown): string[] {
  const raw = at(detail, "location", "municipalities");
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m) => (typeof m === "string" ? m : isRec(m) ? str(m.value) : null))
    .filter((m): m is string => m !== null);
}

function resolveMunicipality(detail: unknown, ctx: NormaliseContext) {
  const codes = municipalityCodes(detail);
  const summaryMunis = Array.isArray(at(ctx.summary, "location", "municipalities"))
    ? (at(ctx.summary, "location", "municipalities") as unknown[])
    : [];
  const summaryCodes = summaryMunis.map((m) => str(at(m, "value"))).filter((m): m is string => m !== null);
  const known = codes.length > 0 ? codes : summaryCodes;

  let code: string | null = null;
  for (const wanted of ctx.preferMunicipalities ?? []) {
    if (known.includes(wanted)) {
      code = wanted;
      break;
    }
  }
  if (!code) {
    const official = str(at(ctx.summary, "officialMunicipality"));
    code = official && (known.length === 0 || known.includes(official)) ? official : (known[0] ?? null);
  }
  if (!code) return { code: null, name: null, region: null };

  const fromSummary = summaryMunis.find((m) => str(at(m, "value")) === code);
  const labelFi = str(at(fromSummary, "label", "fi")) ?? str(at(fromSummary, "label", "en"));
  const region =
    str(at(fromSummary, "region")) ??
    strList(at(detail, "location", "regions"))[0] ??
    MUNICIPALITY_NAMES[code]?.region ??
    null;
  return { code, name: labelFi ?? MUNICIPALITY_NAMES[code]?.name ?? null, region };
}

/**
 * Normalise one Työmarkkinatori posting detail into a `job` row. Returns null when the
 * posting has no usable id or title. Never throws on odd shapes.
 */
export function normaliseTmtPosting(detail: unknown, ctx: NormaliseContext = {}): NormalisedPosting | null {
  if (!isRec(detail)) return null;
  const postingId = str(at(detail, "metadata", "externalId")) ?? ctx.postingId ?? str(at(ctx.summary, "id"));
  if (!postingId) return null;

  const titles = at(detail, "position", "title");
  const descriptions = at(detail, "position", "jobDescription");
  const marketing = at(detail, "position", "marketingDescription");

  // Language: the first of fi, en, sv that has a description; else the first with a title.
  let lang: Lang = "other";
  let langKey: string | null = null;
  for (const l of LANG_ORDER) {
    if (str(at(descriptions, l)) ?? str(at(marketing, l))) {
      langKey = l;
      break;
    }
  }
  if (!langKey) langKey = LANG_ORDER.find((l) => str(at(titles, l))) ?? null;
  if (langKey) lang = langKey as Lang;

  const title =
    (langKey ? str(at(titles, langKey)) : null) ??
    pickLang(titles)?.text ??
    pickLang(at(ctx.summary, "title"))?.text ??
    pickLang(at(firstOccupation(detail), "prefLabel"))?.text ??
    null;
  if (!title) return null;

  const descriptionRaw =
    (langKey ? (str(at(descriptions, langKey)) ?? str(at(marketing, langKey))) : null) ??
    pickLang(descriptions)?.text ??
    pickLang(marketing)?.text ??
    "";
  const decoded = decodeEntities(descriptionRaw).replace(/\r\n?/g, "\n");
  // The text drops every contact sentence; the sentence list keeps positions (a removed sentence
  // becomes `[removed]`) so that anything pointing at a sentence index stays valid.
  const description = scrubPostingText(decoded).trim();
  const sentences = scrubSentenceList(postingSentences(redactContacts(decoded)));

  const owner = at(detail, "owner");
  const isPerson = str(at(owner, "employerType")) === "Person";
  const employerName = isPerson
    ? "Private person"
    : (pickLang(at(owner, "company"))?.text ??
      pickLang(at(ctx.summary, "employer", "ownerName"))?.text ??
      str(at(owner, "officeName")) ??
      "");
  const businessId = isPerson
    ? null
    : (str(at(owner, "businessId")) ?? strList(at(ctx.summary, "employer", "businessId"))[0] ?? null);

  const muni = resolveMunicipality(detail, ctx);

  const applicationUrls = at(detail, "application", "url");
  let url: string | null = null;
  if (isRec(applicationUrls)) {
    for (const l of [langKey ?? "fi", ...LANG_ORDER, ...Object.keys(applicationUrls)]) {
      const candidate = str(applicationUrls[l]);
      if (candidate && /^https?:\/\//i.test(candidate)) {
        url = candidate;
        break;
      }
    }
  }
  url ??= `${TMT_PUBLIC_URL}/${postingId}`;

  const occupations = [
    str(at(detail, "position", "mainOccupation")),
    ...(Array.isArray(at(detail, "position", "occupations"))
      ? (at(detail, "position", "occupations") as unknown[]).map((o) => str(at(o, "uri")))
      : []),
  ].filter((u): u is string => u !== null);
  const skills = (
    Array.isArray(at(detail, "position", "skills"))
      ? (at(detail, "position", "skills") as unknown[]).map((s) => str(at(s, "uri")))
      : []
  ).filter((u): u is string => u !== null);

  const workLanguages = [
    ...new Set(
      strList(at(detail, "position", "workLanguages"))
        .map((l) => l.toLowerCase())
        .filter((l) => /^[a-z]{2}$/.test(l)),
    ),
  ];

  const row: NewJob = {
    id: tmtJobId(postingId),
    source: "tmt",
    sourceId: postingId,
    url,
    title: redactContacts(title),
    employerName: redactContacts(employerName),
    employerBusinessId: businessId,
    sector: sectorFor(employerName),
    municipality: muni.name,
    municipalityCode: muni.code,
    region: muni.region,
    lang,
    workLanguages,
    description,
    sentences,
    postedAt: toDate(at(detail, "application", "published")) ?? toDate(at(ctx.summary, "publishDate")),
    expiresAt: toDate(at(detail, "application", "expires")) ?? toDate(at(ctx.summary, "applicationPeriodEndDate")),
    escoOccupationUris: [...new Set(occupations)],
    escoSkillUris: [...new Set(skills)],
    active: true,
    raw: isPerson ? scrubPrivatePerson(sanitiseTmtRaw(detail)) : sanitiseTmtRaw(detail),
  };
  return { job: row, skillUris: row.escoSkillUris ?? [] };
}

// ---------- one-time re-scrub of stored postings ----------

/**
 * Apply the contact-sentence removal to postings already stored: description, raw posting and
 * sentences. Sentence positions are always kept (a removed sentence becomes `[removed]`), because Need Cards
 * and job matches cite sentences by index. Safe to run twice.
 */
export async function rescrubStoredPostings(db: Db): Promise<{ postings: number; changed: number }> {
  const rows = await db
    .select({
      id: job.id,
      description: job.description,
      sentences: job.sentences,
      raw: job.raw,
    })
    .from(job);
  let changed = 0;
  for (const row of rows) {
    const description = scrubPostingText(decodeEntities(row.description)).trim();
    const sentences = scrubSentenceList(row.sentences);
    const raw = row.raw === null || row.raw === undefined ? row.raw : sanitiseTmtRaw(row.raw);
    const same =
      description === row.description &&
      JSON.stringify(sentences) === JSON.stringify(row.sentences) &&
      JSON.stringify(raw) === JSON.stringify(row.raw);
    if (same) continue;
    await db.update(job).set({ description, sentences, raw }).where(eq(job.id, row.id));
    changed++;
  }
  return { postings: rows.length, changed };
}

// ---------- ingestion ----------

export type TmtIngestOptions = PoliteOptions & {
  municipalities?: string[];
  regions?: string[];
  /** Stop after this many search pages. A run cut short this way never deactivates anything. */
  maxPages?: number;
  pageSize?: number;
  /** Clock for tests. */
  now?: () => Date;
  onProgress?: (message: string) => void;
};

export type TmtIngestResult = {
  seen: number;
  inserted: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  failed: number;
  pages: number;
  /** True when every search page was read. Only then are missing postings deactivated. */
  complete: boolean;
};

function sameInstant(a: unknown, b: unknown): boolean {
  const da = toDate(a);
  const db = toDate(b);
  return da !== null && db !== null && da.getTime() === db.getTime();
}

function scopeCondition(municipalities: string[], regions: string[]): SQL | undefined {
  const parts: SQL[] = [];
  if (municipalities.length > 0) parts.push(inArray(job.municipalityCode, municipalities));
  if (regions.length > 0) parts.push(inArray(job.region, regions));
  return parts.length === 0 ? undefined : or(...parts);
}

async function writePosting(db: Db, normalised: NormalisedPosting, runStart: Date): Promise<"inserted" | "updated"> {
  const { job: row, skillUris } = normalised;
  const jobId = row.id as string;
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: job.id }).from(job).where(eq(job.id, jobId));
    const { id: _id, ...updatable } = row;
    void _id;
    await tx
      .insert(job)
      .values({ ...row, firstSeenAt: runStart, lastSeenAt: runStart })
      .onConflictDoUpdate({ target: job.id, set: { ...updatable, lastSeenAt: runStart } });
    await tx.delete(jobSkill).where(and(eq(jobSkill.jobId, jobId), eq(jobSkill.origin, "posting")));
    if (skillUris.length > 0) {
      await tx
        .insert(jobSkill)
        .values(skillUris.map((skillUri) => ({ jobId, skillUri, origin: "posting" as const })))
        .onConflictDoNothing();
    }
    return existing ? "updated" : "inserted";
  });
}

/**
 * Page through Työmarkkinatori search, fetch details for postings that are new or changed,
 * upsert normalised rows and replace their `job_skill` rows (origin `posting`). After a run
 * that read every page, postings of the same scope that were not seen are marked inactive.
 */
export async function ingestTmt(db: Db, opts: TmtIngestOptions = {}): Promise<TmtIngestResult> {
  const http: PoliteFetcher = createPoliteFetcher(opts);
  const clock = opts.now ?? (() => new Date());
  const runStart = clock();
  const municipalities = opts.municipalities ?? [];
  const regions = opts.regions ?? [];
  const pageSize = opts.pageSize ?? TMT_PAGE_SIZE;
  const log = opts.onProgress ?? (() => {});

  const result: TmtIngestResult = {
    seen: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    deactivated: 0,
    failed: 0,
    pages: 0,
    complete: false,
  };

  const filters: Record<string, string[]> = {};
  if (municipalities.length > 0) filters.municipalities = municipalities;
  if (regions.length > 0) filters.regions = regions;

  const seenIds = new Set<string>();
  let complete = false;

  for (let pageNumber = 0; ; pageNumber++) {
    if (opts.maxPages !== undefined && pageNumber >= opts.maxPages) break;

    let page: { content?: unknown; totalElements?: unknown };
    try {
      page = await http.postJson(TMT_SEARCH_URL, {
        query: "",
        filters,
        paging: { pageNumber, pageSize },
        sorting: "LATEST",
      });
    } catch (error) {
      log(`search page ${pageNumber} failed: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }
    const content = Array.isArray(page.content) ? (page.content as unknown[]) : [];
    result.pages++;

    const items = new Map<string, unknown>();
    for (const item of content) {
      const id = str(at(item, "id"));
      if (!id) {
        result.failed++;
        continue;
      }
      if (!items.has(id) && !seenIds.has(id)) items.set(id, item);
    }
    for (const id of items.keys()) seenIds.add(id);

    await processPage(db, http, items, { runStart, preferMunicipalities: municipalities, result, log });

    const total = typeof page.totalElements === "number" ? page.totalElements : null;
    if (content.length === 0 || content.length < pageSize || (total !== null && (pageNumber + 1) * pageSize >= total)) {
      complete = true;
      break;
    }
  }

  result.complete = complete;
  result.seen = seenIds.size;

  if (complete) {
    const scope = scopeCondition(municipalities, regions);
    const stale = await db
      .update(job)
      .set({ active: false })
      .where(and(eq(job.source, "tmt"), eq(job.active, true), lt(job.lastSeenAt, runStart), scope))
      .returning({ id: job.id });
    result.deactivated = stale.length;
  }
  return result;
}

async function processPage(
  db: Db,
  http: PoliteFetcher,
  items: Map<string, unknown>,
  ctx: { runStart: Date; preferMunicipalities: string[]; result: TmtIngestResult; log: (m: string) => void },
): Promise<void> {
  const { runStart, result, log } = ctx;
  if (items.size === 0) return;
  const ids = [...items.keys()].map(tmtJobId);

  const existingRows = await db
    .select({
      id: job.id,
      active: job.active,
      lastModified: sql<string | null>`${job.raw} -> 'metadata' ->> 'lastModified'`,
    })
    .from(job)
    .where(inArray(job.id, ids));
  const existing = new Map(existingRows.map((r) => [r.id, r]));

  const unchangedIds: string[] = [];
  const toFetch: Array<[string, unknown]> = [];
  for (const [uuid, summary] of items) {
    const row = existing.get(tmtJobId(uuid));
    if (row && row.active && sameInstant(row.lastModified, at(summary, "lastModified"))) {
      unchangedIds.push(row.id);
    } else {
      toFetch.push([uuid, summary]);
    }
  }
  if (unchangedIds.length > 0) {
    await db.update(job).set({ lastSeenAt: runStart }).where(inArray(job.id, unchangedIds));
    result.unchanged += unchangedIds.length;
  }

  // Fetch and normalise in parallel (the fetcher caps requests in flight), write one by one.
  const fetched = await Promise.all(
    toFetch.map(async ([uuid, summary]) => {
      try {
        const detail = await http.getJson(`${TMT_DETAIL_URL}/${uuid}`);
        const normalised = normaliseTmtPosting(detail, {
          summary,
          postingId: uuid,
          preferMunicipalities: ctx.preferMunicipalities,
        });
        if (!normalised) throw new Error("posting has no usable id or title");
        return { uuid, normalised };
      } catch (error) {
        log(`posting ${uuid} failed: ${error instanceof Error ? error.message : String(error)}`);
        return { uuid, normalised: null };
      }
    }),
  );

  const failedKnown: string[] = [];
  for (const { uuid, normalised } of fetched) {
    if (!normalised) {
      result.failed++;
      // A transient failure must not deactivate a posting we already hold.
      if (existing.has(tmtJobId(uuid))) failedKnown.push(tmtJobId(uuid));
      continue;
    }
    try {
      const outcome = await writePosting(db, normalised, runStart);
      result[outcome]++;
    } catch (error) {
      result.failed++;
      log(`posting ${uuid} could not be stored: ${error instanceof Error ? error.message : String(error)}`);
      if (existing.has(tmtJobId(uuid))) failedKnown.push(tmtJobId(uuid));
    }
  }
  if (failedKnown.length > 0) {
    await db.update(job).set({ lastSeenAt: runStart }).where(inArray(job.id, failedKnown));
  }
}
