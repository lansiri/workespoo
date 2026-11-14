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
  type SignalKind,
} from "@/contracts";
import { job, jobMatch } from "@/db/schema";
import { getApprovedCard } from "@/features/card";
import { getNeedCardForJob } from "@/features/needs";
import { newId } from "@/lib/ids";
import { chatJson } from "@/lib/llm";
import { enqueue } from "@/lib/queue";
import { rowsOf } from "@/lib/sql";
import {
  FEED_SIZE,
  REASON_CONCURRENCY,
  REASON_SENTENCE_MAX_CHARS,
  NEED_DRAFT_DELAY_MS,
  NEED_DRAFT_POSTINGS,
  REASON_DEADLINE_MS,
  REASON_TEMPERATURE,
  REASON_TOP_POSTINGS,
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
import { retrieveForSignals, type Candidate } from "./retrieval";
import { textArray, touchedRequirementIds, touchingSignals } from "./touches";

/** The clock the feed reads when none is passed. Tests replace `now`. */
export const feedClock: { now: () => Date } = { now: () => new Date() };

/* ------------------------------------------------------------------------------------------
 * Retrieval (docs/specs/matching.md 2.1 and 2.2)
 * ---------------------------------------------------------------------------------------- */

/**
 * Retrieval for one person: loads their approved signals and hands them to `retrieveForSignals`.
 * The order is a posting order for this one person (never stored as a number).
 */
export async function retrieveCandidates(
  db: Db,
  talentId: string,
  roles: string[],
  now: Date,
): Promise<Candidate[]> {
  const rows = rowsOf<{ phrase: string; kind: SignalKind; esco_uri: string | null }>(
    await db.execute(
      sql`SELECT phrase, kind, esco_uri FROM signal WHERE talent_id = ${talentId} AND status = 'approved' ORDER BY id`,
    ),
  );
  return retrieveForSignals(
    db,
    rows.map((r) => ({ phrase: r.phrase, kind: r.kind, escoUri: r.esco_uri })),
    roles,
    now,
  );
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
      // Later than step two, which the card_approved handler queues right after the feed: the
      // worker is one serial loop, and the drafts must not hold step two back.
      await enqueue(
        db,
        "needs.draft",
        { jobId: c.jobId, companyId: null },
        { dedupeKey: `needs.draft:${c.jobId}`, runAfter: new Date(Date.now() + NEED_DRAFT_DELAY_MS) },
      );
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
    // "Not mentioned" is stored with the reasons, from the Need Card as it is now.
    const notMentioned = needCard
      ? notMentionedItems(needCard.requirements, new Set(await touchedRequirementIds(db, talentId, needCard.requirements)))
      : m.body.notMentioned;
    await db
      .update(jobMatch)
      .set({ body: { ...m.body, reasonsSource: "model", reasons, notMentioned } })
      .where(and(eq(jobMatch.talentId, talentId), eq(jobMatch.jobId, m.jobId), eq(jobMatch.cardVersion, card.version)));
    return true;
  });
  return { refined: results.filter(Boolean).length };
}

/**
 * "Not mentioned" for one person and posting from the Need Card as it is now, or null while the
 * posting has no Need Card. No model call.
 */
export async function currentNotMentioned(db: Db, talentId: string, jobId: string): Promise<string[] | null> {
  const needCard = await needCardOrNull(db, jobId);
  if (!needCard) return null;
  return notMentionedItems(needCard.requirements, new Set(await touchedRequirementIds(db, talentId, needCard.requirements)));
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
