import { and, eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  JobMatch,
  type Job,
  type JobMatchReason,
  type MatchBasis,
  type NeedCard,
  type SignalCard,
} from "@/contracts";
import { job, jobMatch } from "@/db/schema";
import { getApprovedCard } from "@/features/card";
import { getNeedCardForJob } from "@/features/needs";
import { newId } from "@/lib/ids";
import { chatJson } from "@/lib/llm";
import { enqueue } from "@/lib/queue";
import { rowsOf } from "@/lib/sql";
import {
  ESPOO_CODE,
  FEED_CANDIDATES,
  FEED_FRESH_DAYS,
  FEED_MUNICIPALITY_CODES,
  FEED_REGION_CODE,
  FEED_SIZE,
  GATE_OCC_LINKS_ALONE,
  GATE_TEXT_SIGNALS_ALONE,
  REASON_CONCURRENCY,
  REASON_SENTENCE_MAX_CHARS,
  NEED_DRAFT_POSTINGS,
  REASON_DEADLINE_MS,
  REASON_TEMPERATURE,
  REASON_TOP_POSTINGS,
  ROLE_TITLE_HIT_SIMILARITY,
  TEXT_STOPWORDS,
  TEXT_TERM_MAX,
  TEXT_TERM_MIN_LENGTH,
} from "./constants";
import {
  buildReasonMessages,
  checkModelReasons,
  codeReason,
  containsWholePhrase,
  modelPairs,
  notMentionedItems,
  ReasonsReply,
  uniquePairs,
  type AllowedPair,
  type SignalForReason,
} from "./reasons";
import { textArray, touchedRequirementIds, touchingSignals } from "./touches";

/** The clock the feed reads when none is passed. Tests replace `now`. */
export const feedClock: { now: () => Date } = { now: () => new Date() };

/* ------------------------------------------------------------------------------------------
 * Retrieval (docs/specs/matching.md 2.1 and 2.2)
 * ---------------------------------------------------------------------------------------- */

type Candidate = { jobId: string; basis: MatchBasis[] };

/** Words of ESCO labels and self-declared roles, as `word:*` prefix terms for a `simple` tsquery. */
export function textTerms(labels: string[]): string[] {
  const words = new Set<string>();
  for (const label of labels) {
    for (const w of label.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (w.length >= TEXT_TERM_MIN_LENGTH && !TEXT_STOPWORDS.has(w)) words.add(w);
    }
  }
  return [...words].sort().slice(0, TEXT_TERM_MAX).map((w) => `${w}:*`);
}

/**
 * Retrieval for one person: postings linked to their skill URIs directly, through occupations,
 * by bilingual text search, or by a self-declared role in the title. The order is a posting
 * order for this one person (never stored as a number); it ranks postings, not people.
 */
export async function retrieveCandidates(
  db: Db,
  talentId: string,
  roles: string[],
  now: Date,
): Promise<Candidate[]> {
  const signalRows = rowsOf<{ esco_uri: string }>(
    await db.execute(
      sql`SELECT DISTINCT esco_uri FROM signal WHERE talent_id = ${talentId} AND status = 'approved' AND esco_uri IS NOT NULL ORDER BY esco_uri`,
    ),
  );
  const uris = signalRows.map((r) => r.esco_uri);
  const labelRows =
    uris.length === 0
      ? []
      : rowsOf<{ label_en: string; label_fi: string | null }>(
          await db.execute(sql`SELECT label_en, label_fi FROM esco_concept WHERE uri = ANY(${textArray(uris)})`),
        );
  const terms = textTerms([...labelRows.flatMap((l) => [l.label_en, l.label_fi ?? ""]), ...roles]);
  const tsquery = terms.join(" | ");
  // One query per signal, so the gate can ask for text hits of two different signals.
  const signalQueries = labelRows
    .map((l) => textTerms([l.label_en, l.label_fi ?? ""]).join(" | "))
    .filter((q) => q.length > 0);
  const cleanRoles = roles.map((r) => r.trim()).filter((r) => r.length > 0);
  if (uris.length === 0 && cleanRoles.length === 0) return [];

  const nowIso = now.toISOString();
  const codes = textArray([...FEED_MUNICIPALITY_CODES]);
  const textHit = tsquery
    ? sql`(j.search @@ to_tsquery('simple', ${tsquery}))`
    : sql`false`;
  const textSignals =
    signalQueries.length > 0
      ? sql`(SELECT count(*) FROM unnest(${textArray(signalQueries)}) q WHERE j.search @@ to_tsquery('simple', q))`
      : sql`0`;
  const roleHit =
    cleanRoles.length > 0
      ? sql`EXISTS (SELECT 1 FROM unnest(${textArray(cleanRoles)}) r WHERE word_similarity(lower(r), lower(j.title)) >= ${ROLE_TITLE_HIT_SIMILARITY})`
      : sql`false`;

  const result = await db.execute(sql`
    WITH u AS (SELECT unnest(${textArray(uris)}) AS esco_uri),
    ej AS (
      SELECT j.* FROM job j
      WHERE j.active
        AND (j.expires_at IS NULL OR j.expires_at > ${nowIso}::timestamptz)
        AND coalesce(j.posted_at, j.first_seen_at) > ${nowIso}::timestamptz - make_interval(days => ${FEED_FRESH_DAYS}::int)
        AND (j.municipality_code = ANY(${codes}) OR j.region = ${FEED_REGION_CODE})
        AND NOT EXISTS (
          SELECT 1 FROM need_card nc JOIN company c ON c.id = nc.company_id
          WHERE nc.job_id = j.id AND c.masked
        )
    ),
    direct AS (
      SELECT js.job_id, count(DISTINCT js.skill_uri) AS n
      FROM job_skill js JOIN u ON u.esco_uri = js.skill_uri GROUP BY 1
    ),
    occ AS (
      SELECT j.id AS job_id,
             count(DISTINCT os.skill_uri) FILTER (WHERE os.relation = 'essential') AS ess,
             count(DISTINCT os.skill_uri) FILTER (WHERE os.relation = 'optional') AS opt
      FROM ej j
      JOIN esco_occupation_skill os ON os.occupation_uri = ANY(j.esco_occupation_uris)
      JOIN u ON u.esco_uri = os.skill_uri
      GROUP BY 1
    ),
    scored AS (
      SELECT j.id, j.municipality_code, j.posted_at,
             coalesce(d.n, 0) AS n_direct, coalesce(o.ess, 0) AS ess, coalesce(o.opt, 0) AS opt,
             ${textHit} AS text_hit, ${textSignals} AS text_signals, ${roleHit} AS role_hit
      FROM ej j
      LEFT JOIN direct d ON d.job_id = j.id
      LEFT JOIN occ o ON o.job_id = j.id
    )
    SELECT id, n_direct, ess, opt, text_hit, role_hit
    FROM scored
    WHERE n_direct >= 1 OR ess + opt >= ${GATE_OCC_LINKS_ALONE} OR (ess + opt >= 1 AND text_hit)
       OR text_signals >= ${GATE_TEXT_SIGNALS_ALONE} OR role_hit
    ORDER BY 3 * n_direct + 2 * ess + opt + (text_hit)::int + (role_hit)::int DESC,
             (municipality_code = ${ESPOO_CODE}) DESC, posted_at DESC NULLS LAST, id
    LIMIT ${FEED_CANDIDATES}
  `);
  return rowsOf<{
    id: string;
    n_direct: number | string;
    ess: number | string;
    opt: number | string;
    text_hit: boolean;
    role_hit: boolean;
  }>(result).map((r) => {
    const basis: MatchBasis[] = [];
    if (Number(r.n_direct) >= 1) basis.push("direct");
    if (Number(r.ess) + Number(r.opt) >= 1) basis.push("occupation");
    if (r.text_hit) basis.push("text");
    if (r.role_hit) basis.push("role");
    return { jobId: r.id, basis };
  });
}

/* ------------------------------------------------------------------------------------------
 * Allowed pairs
 * ---------------------------------------------------------------------------------------- */

type JobFacts = { id: string; sentences: string[]; occupationUris: string[]; skillUris: string[] };

/** Labels a signal may be found under in posting text: its phrase and its ESCO labels, with and without a bracketed note. */
function phraseLabels(s: SignalCard["signals"][number]): string[] {
  const raw = [s.esco?.labelEn, s.esco?.labelFi, s.phrase].filter((l): l is string => !!l);
  const bare = raw.map((l) => l.replace(/\s*\([^)]*\)/g, "").trim());
  return [...new Set([...raw, ...bare])];
}

/** Pairs through the posting's Need Card, through ESCO skills the posting lists, and through its occupations. */
async function allowedPairsFor(
  db: Db,
  facts: JobFacts,
  signals: SignalCard["signals"],
  needCardBody: NeedCard | null,
  talentId: string,
): Promise<AllowedPair[]> {
  const pairs: AllowedPair[] = [];
  const approved = signals.filter((s) => s.status === "approved");
  const byId = new Map(approved.map((s) => [s.id, s]));

  if (needCardBody) {
    for (const r of needCardBody.requirements) {
      if (r.postingSentence === null || r.postingSentence >= facts.sentences.length) continue;
      for (const row of await touchingSignals(db, r, { talentIds: [talentId] })) {
        const s = row.signalId ? byId.get(row.signalId) : undefined;
        if (s) pairs.push({ signalId: s.id, sentence: r.postingSentence, via: "requirement", listed: r.text, escoUri: s.esco?.uri });
      }
    }
  }

  const listedRows = rowsOf<{ skill_uri: string }>(
    await db.execute(sql`SELECT DISTINCT skill_uri FROM job_skill WHERE job_id = ${facts.id}`),
  );
  const listed = new Set([...listedRows.map((r) => r.skill_uri), ...facts.skillUris]);
  for (const s of approved) {
    const labels = phraseLabels(s);
    const sentenceWith = (): { index: number; label: string } | null => {
      for (let i = 0; i < facts.sentences.length; i++) {
        const hit = labels.find((l) => containsWholePhrase(facts.sentences[i], l));
        if (hit) return { index: i, label: hit };
      }
      return null;
    };
    const uri = s.esco?.uri;
    if (uri && listed.has(uri)) {
      pairs.push({ signalId: s.id, sentence: sentenceWith()?.index ?? null, via: "posting_skill", listed: s.esco?.labelEn ?? s.phrase, escoUri: uri });
    } else {
      // Not a listed skill, but a sentence of the posting names it as a whole phrase.
      const hit = sentenceWith();
      if (hit) pairs.push({ signalId: s.id, sentence: hit.index, via: "sentence_text", listed: hit.label, ...(uri ? { escoUri: uri } : {}) });
    }
  }

  if (facts.occupationUris.length > 0) {
    const rows = rowsOf<{ skill_uri: string }>(
      await db.execute(sql`
        SELECT DISTINCT skill_uri FROM esco_occupation_skill
        WHERE occupation_uri = ANY(${textArray(facts.occupationUris)})
      `),
    );
    const viaOcc = new Set(rows.map((r) => r.skill_uri));
    for (const s of approved) {
      const uri = s.esco?.uri;
      if (uri && viaOcc.has(uri)) {
        pairs.push({ signalId: s.id, sentence: null, via: "occupation", listed: s.esco?.labelEn ?? s.phrase, escoUri: uri });
      }
    }
  }
  return uniquePairs(pairs);
}

/* ------------------------------------------------------------------------------------------
 * Feed
 * ---------------------------------------------------------------------------------------- */

function toJob(row: typeof job.$inferSelect): Job {
  return {
    id: row.id,
    source: row.source,
    sourceId: row.sourceId,
    url: row.url,
    title: row.title,
    employerName: row.employerName,
    employerBusinessId: row.employerBusinessId,
    sector: row.sector,
    municipality: row.municipality,
    municipalityCode: row.municipalityCode,
    region: row.region,
    lang: row.lang,
    workLanguages: row.workLanguages,
    description: row.description,
    sentences: row.sentences,
    postedAt: row.postedAt ? row.postedAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    escoOccupationUris: row.escoOccupationUris,
    escoSkillUris: row.escoSkillUris,
    active: row.active,
  };
}

async function needCardOrNull(db: Db, jobId: string): Promise<NeedCard | null> {
  try {
    return await getNeedCardForJob(db, jobId);
  } catch {
    return null;
  }
}

/** Ask the model to word the reasons; any failure leaves the code fallback in charge. */
async function modelReasons(
  db: Db,
  title: string,
  sentences: string[],
  pairs: AllowedPair[],
  signals: SignalForReason[],
): Promise<JobMatchReason[]> {
  if (modelPairs(pairs).length === 0) return [];
  const trimmed = sentences.map((s) => (s.length > REASON_SENTENCE_MAX_CHARS ? `${s.slice(0, REASON_SENTENCE_MAX_CHARS)}...` : s));
  try {
    const result = await chatJson({
      role: "analyst",
      purpose: "matching.feed_reasons",
      messages: buildReasonMessages({ title, signals, sentences: trimmed, pairs }),
      schema: ReasonsReply,
      temperature: REASON_TEMPERATURE,
      deadlineMs: REASON_DEADLINE_MS,
      db,
    });
    if (result.data === null) return [];
    const { reasons, dropped } = checkModelReasons(result.data, pairs, signals);
    void dropped;
    return reasons;
  } catch {
    return [];
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** The signals of an approved card as the reason prompt and the code reasons see them. */
function signalsForReasons(card: SignalCard): SignalForReason[] {
  const renderings = new Map(card.companyView.items.map((i) => [i.signalId, i.text]));
  return card.signals
    .filter((s) => s.status === "approved")
    .map((s) => ({
      id: s.id,
      phrase: s.phrase,
      rendering: renderings.get(s.id) ?? null,
      evidence: s.evidence[0] ?? null,
    }));
}

/** Code-written reasons: one line for the first real link, or none when there is no link. */
function codeReasons(pairs: AllowedPair[], signals: SignalForReason[]): JobMatchReason[] {
  const fallback = codeReason(pairs, signals);
  return fallback ? [fallback] : [];
}

/**
 * Step one of the feed: recomputes the person's feed from their approved card and stores it
 * with code-written reasons only. No model call is made, so the page has postings within a
 * second of approval. A model-worded reason from the same card version is kept as it is.
 * Needs the feature has not read yet are queued for a draft, for the first few only
 * (`NEED_DRAFT_POSTINGS`). `refineFeed` is step two. `opts.now` is the clock, injected for tests.
 */
export async function computeFeed(
  db: Db,
  talentId: string,
  opts: { now?: Date } = {},
): Promise<{ matches: number }> {
  const now = opts.now ?? feedClock.now();
  const card = await getApprovedCard(db, talentId);
  if (!card) {
    await db.delete(jobMatch).where(eq(jobMatch.talentId, talentId));
    return { matches: 0 };
  }

  const candidates = (await retrieveCandidates(db, talentId, card.lookingFor.roles, now)).slice(0, FEED_SIZE);
  const jobRows = candidates.length
    ? await db.select().from(job).where(inArray(job.id, candidates.map((c) => c.jobId)))
    : [];
  const jobsById = new Map(jobRows.map((r) => [r.id, r]));

  // Reasons are cached by (person, card version, posting): a model-worded reason is reused as it is.
  const previous = await db.select().from(jobMatch).where(eq(jobMatch.talentId, talentId));
  const cachedReasons = new Map(
    previous
      .filter((p) => p.cardVersion === card.version && p.body.reasonsSource === "model" && p.body.reasons.length > 0)
      .map((p) => [p.jobId, p.body.reasons]),
  );
  const signals = signalsForReasons(card);

  let drafts = 0;
  type Built = { jobId: string; basis: MatchBasis[]; reasons: JobMatchReason[]; reasonsSource: "model" | "code"; notMentioned: string[] };
  const built: Built[] = [];
  const buildOne = async (c: Candidate, index: number): Promise<Built | null> => {
    const row = jobsById.get(c.jobId);
    if (!row) return null;
    const needCard = await needCardOrNull(db, c.jobId);
    if (!needCard && drafts < NEED_DRAFT_POSTINGS) {
      drafts += 1;
      await enqueue(db, "needs.draft", { jobId: c.jobId, companyId: null }, { dedupeKey: `needs.draft:${c.jobId}` });
    }
    const pairs = await allowedPairsFor(
      db,
      { id: row.id, sentences: row.sentences, occupationUris: row.escoOccupationUris, skillUris: row.escoSkillUris },
      card.signals,
      needCard,
      talentId,
    );
    const cached = index < REASON_TOP_POSTINGS ? cachedReasons.get(c.jobId) : undefined;
    const reasons = cached ?? codeReasons(pairs, signals);
    const notMentioned = needCard
      ? notMentionedItems(needCard.requirements, new Set(await touchedRequirementIds(db, talentId, needCard.requirements)))
      : [];
    return { jobId: c.jobId, basis: c.basis, reasons, reasonsSource: cached ? "model" : "code", notMentioned };
  };
  // In feed order, one after the other: the draft budget goes to the first postings.
  for (const [index, c] of candidates.entries()) {
    const b = await buildOne(c, index);
    if (b) built.push(b);
  }

  await db.transaction(async (tx) => {
    await tx.delete(jobMatch).where(eq(jobMatch.talentId, talentId));
    for (const [position, b] of built.entries()) {
      await tx.insert(jobMatch).values({
        id: newId("jm"),
        talentId,
        jobId: b.jobId,
        cardVersion: card.version,
        feedPosition: position,
        body: { basis: b.basis, reasonsSource: b.reasonsSource, reasons: b.reasons, notMentioned: b.notMentioned },
        computedAt: now,
      });
    }
  });
  return { matches: built.length };
}

/**
 * Step two of the feed: words the reasons of the top postings with the model and stores them
 * again, in place. Postings do not move; only the reason text changes. A failed or late call,
 * or a reply that fails the checks, keeps the code-written reasons. Returns how many postings
 * got model wording.
 */
export async function refineFeed(db: Db, talentId: string): Promise<{ refined: number }> {
  const card = await getApprovedCard(db, talentId);
  if (!card) return { refined: 0 };
  const rows = (await db.select().from(jobMatch).where(eq(jobMatch.talentId, talentId)))
    .filter((r) => r.cardVersion === card.version)
    .sort((a, b) => a.feedPosition - b.feedPosition)
    .slice(0, REASON_TOP_POSTINGS)
    .filter((r) => r.body.reasonsSource !== "model");
  if (rows.length === 0) return { refined: 0 };
  const jobRows = await db.select().from(job).where(inArray(job.id, rows.map((r) => r.jobId)));
  const jobsById = new Map(jobRows.map((r) => [r.id, r]));
  const signals = signalsForReasons(card);

  const results = await mapLimit(rows, REASON_CONCURRENCY, async (m) => {
    const row = jobsById.get(m.jobId);
    if (!row) return false;
    const needCard = await needCardOrNull(db, m.jobId);
    const pairs = await allowedPairsFor(
      db,
      { id: row.id, sentences: row.sentences, occupationUris: row.escoOccupationUris, skillUris: row.escoSkillUris },
      card.signals,
      needCard,
      talentId,
    );
    const reasons = await modelReasons(db, row.title, row.sentences, pairs, signals);
    if (reasons.length === 0) return false;
    await db
      .update(jobMatch)
      .set({ body: { ...m.body, reasonsSource: "model", reasons } })
      .where(and(eq(jobMatch.talentId, talentId), eq(jobMatch.jobId, m.jobId), eq(jobMatch.cardVersion, card.version)));
    return true;
  });
  return { refined: results.filter(Boolean).length };
}

/**
 * A Need Card arrived or changed: refresh "not mentioned" for the people who have its posting
 * in their feed. No model call; reasons stay as they are.
 */
export async function refreshNotMentioned(db: Db, jobId: string): Promise<{ updated: number }> {
  const needCard = await needCardOrNull(db, jobId);
  if (!needCard) return { updated: 0 };
  const rows = await db.select().from(jobMatch).where(eq(jobMatch.jobId, jobId));
  let updated = 0;
  for (const m of rows) {
    const items = notMentionedItems(
      needCard.requirements,
      new Set(await touchedRequirementIds(db, m.talentId, needCard.requirements)),
    );
    if (JSON.stringify(items) === JSON.stringify(m.body.notMentioned)) continue;
    await db.update(jobMatch).set({ body: { ...m.body, notMentioned: items } }).where(eq(jobMatch.id, m.id));
    updated += 1;
  }
  return { updated };
}

/** The person's feed in feed order, each match with its posting. */
export async function feedForTalent(
  db: Db,
  talentId: string,
): Promise<Array<{ match: JobMatch; job: Job }>> {
  const rows = await db
    .select({ m: jobMatch, j: job })
    .from(jobMatch)
    .innerJoin(job, eq(job.id, jobMatch.jobId))
    .where(and(eq(jobMatch.talentId, talentId)));
  return rows
    .sort((a, b) => a.m.feedPosition - b.m.feedPosition || a.j.id.localeCompare(b.j.id))
    .map(({ m, j }) => ({
      match: JobMatch.parse({
        id: m.id,
        talentId: m.talentId,
        jobId: m.jobId,
        cardVersion: m.cardVersion,
        feedPosition: m.feedPosition,
        basis: m.body.basis,
        reasonsSource: m.body.reasonsSource,
        reasons: m.body.reasons,
        notMentioned: m.body.notMentioned,
        computedAt: m.computedAt.toISOString(),
      }),
      job: toJob(j),
    }));
}
