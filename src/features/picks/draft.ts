import { and, eq, gt, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { NeedCard, SignalCard, type PickReason } from "@/contracts";
import type { Db } from "@/db/client";
import { company, digest, eligibility, intro, needCard, pick, signalCard, talent } from "@/db/schema";
import { audit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { DECLINE_COOLDOWN_DAYS, MODEL_CONCURRENCY } from "./constants";
import { sha256Hex } from "./hash";
import { computeAllowedPairs, notMentionedIds, writeReasons } from "./reasons";
import { chooseHandful, type Candidate } from "./selection";
import { DATE_RE, daysBefore, dayStart } from "./time";
import { eventIdOf, getCurrentEvent, loadSettings, type PicksSettings } from "./settings";

type NeedRow = { rowId: string; version: number; companyId: string; need: NeedCard };
type DigestRow = typeof digest.$inferSelect;

const OPEN_INTRO = new Set(["pending_review", "awaiting_talent", "awaiting_company", "accepted"]);

/** The seed of one need's selection: `sha256(eventId:date:companyId:needCardId)` (matching.md 3.3). */
export function selectionSeed(eventId: string, date: string, companyId: string, needCardId: string): string {
  return sha256Hex(`${eventId}:${date}:${companyId}:${needCardId}`);
}

/** The digest's own seed, for the display shuffle. One per company and day. */
export function digestSeed(eventId: string, date: string, companyId: string): string {
  return sha256Hex(`${eventId}:${date}:${companyId}`);
}

async function loadNeeds(db: Db): Promise<NeedRow[]> {
  const rows = await db
    .select({ id: needCard.id, version: needCard.version, companyId: needCard.companyId, body: needCard.body })
    .from(needCard)
    .innerJoin(company, eq(company.id, needCard.companyId))
    .where(and(eq(company.participating, true), ne(needCard.status, "stale")))
    .orderBy(needCard.id);
  const needs: NeedRow[] = [];
  for (const row of rows) {
    const parsed = NeedCard.safeParse(row.body);
    if (!parsed.success || !row.companyId) continue;
    needs.push({ rowId: row.id, version: row.version, companyId: row.companyId, need: parsed.data });
  }
  return needs;
}

/** A digest is locked once published or once any pick has a decision. */
async function isLocked(db: Db, d: DigestRow): Promise<boolean> {
  if (d.status === "published") return true;
  const decided = await db
    .select({ id: pick.id })
    .from(pick)
    .where(and(eq(pick.digestId, d.id), ne(pick.status, "suggested")))
    .limit(1);
  return decided.length > 0;
}

async function ensureDigest(
  db: Db,
  args: { eventId: string; date: string; companyId: string },
): Promise<{ row: DigestRow; created: boolean }> {
  const find = async () => {
    const [row] = await db
      .select()
      .from(digest)
      .where(and(eq(digest.companyId, args.companyId), eq(digest.date, args.date)))
      .limit(1);
    return row;
  };
  const existing = await find();
  if (existing) return { row: existing, created: false };
  const inserted = await db
    .insert(digest)
    .values({
      id: newId("dig"),
      companyId: args.companyId,
      eventId: args.eventId === "no-event" ? null : args.eventId,
      date: args.date,
      status: "draft",
      seed: digestSeed(args.eventId, args.date, args.companyId),
      emptyNeeds: [],
    })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return { row: inserted[0], created: true };
  return { row: (await find())!, created: false };
}

type EligibleRow = { talentId: string; cardVersion: number; touched: string[]; card: SignalCard };

async function loadEligible(db: Db, n: NeedRow, date: string): Promise<EligibleRow[]> {
  const rows = await db
    .select({
      talentId: eligibility.talentId,
      cardVersion: eligibility.cardVersion,
      touched: eligibility.touchedRequirementIds,
      cardBody: signalCard.body,
    })
    .from(eligibility)
    .innerJoin(talent, eq(talent.id, eligibility.talentId))
    .innerJoin(
      signalCard,
      and(
        eq(signalCard.talentId, eligibility.talentId),
        eq(signalCard.status, "approved"),
        eq(signalCard.version, eligibility.cardVersion),
      ),
    )
    .where(
      and(
        eq(eligibility.needCardId, n.rowId),
        eq(eligibility.needCardVersion, n.version),
        eq(eligibility.eligible, true),
        isNull(eligibility.exclusion),
        eq(talent.inPool, true),
        or(isNull(talent.purgeAfter), gt(talent.purgeAfter, dayStart(date))),
      ),
    )
    .orderBy(eligibility.talentId);
  const out: EligibleRow[] = [];
  for (const r of rows) {
    const card = SignalCard.safeParse(r.cardBody);
    if (!card.success) continue;
    out.push({ talentId: r.talentId, cardVersion: r.cardVersion, touched: r.touched, card: card.data });
  }
  return out;
}

/** Exclusions 2 and 3 of matching.md 3.2: an open or accepted introduction, or a recent decline. */
async function excludedByIntros(db: Db, companyId: string, talentIds: string[], date: string): Promise<Set<string>> {
  if (talentIds.length === 0) return new Set();
  const rows = await db
    .select({ talentId: intro.talentId, status: intro.status, respondedAt: intro.respondedAt, requestedAt: intro.requestedAt })
    .from(intro)
    .where(and(eq(intro.companyId, companyId), inArray(intro.talentId, talentIds)));
  const cooldownStart = daysBefore(date, DECLINE_COOLDOWN_DAYS);
  const out = new Set<string>();
  for (const r of rows) {
    if (OPEN_INTRO.has(r.status)) out.add(r.talentId);
    else if (r.status === "declined" && (r.respondedAt ?? r.requestedAt) >= cooldownStart) out.add(r.talentId);
  }
  return out;
}

/**
 * What the rotation rule may read: when each person was last suggested, whether they had a
 * pick for this company recently, and how many picks they have today. Only picks that came
 * before this need in the run count, which is what makes a re-run reproduce the first run.
 */
async function loadHistory(
  db: Db,
  args: { talentIds: string[]; companyId: string; needCardId: string; date: string; rotationDays: number },
): Promise<Map<string, { lastDrafted: Date | null; recent: boolean; today: number }>> {
  const result = new Map<string, { lastDrafted: Date | null; recent: boolean; today: number }>();
  for (const id of args.talentIds) result.set(id, { lastDrafted: null, recent: false, today: 0 });
  if (args.talentIds.length === 0) return result;
  const rows = await db
    .select({ talentId: pick.talentId, companyId: pick.companyId, createdAt: pick.createdAt, digestDate: digest.date })
    .from(pick)
    .innerJoin(digest, eq(digest.id, pick.digestId))
    .where(
      and(
        inArray(pick.talentId, args.talentIds),
        or(lt(digest.date, args.date), and(eq(digest.date, args.date), lt(pick.needCardId, args.needCardId))),
      ),
    );
  const windowStart = daysBefore(args.date, args.rotationDays);
  for (const r of rows) {
    const h = result.get(r.talentId)!;
    if (!h.lastDrafted || r.createdAt > h.lastDrafted) h.lastDrafted = r.createdAt;
    if (r.companyId === args.companyId && r.createdAt >= windowStart) h.recent = true;
    if (r.digestDate === args.date) h.today += 1;
  }
  return result;
}

async function mapPool<T, R>(items: readonly T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Drafts today's digests for every participating company. One draft digest per company and
 * day; running it again changes nothing unless a pick has gone out of date. A digest with
 * any decision, or a published one, is never touched.
 */
export async function draftDailyDigests(db: Db, date: string): Promise<{ digests: number; picks: number }> {
  if (!DATE_RE.test(date)) throw new Error(`draftDailyDigests: invalid date "${date}"`);
  const event = await getCurrentEvent(db);
  const eventId = eventIdOf(event);
  const settings: PicksSettings = await loadSettings(db, eventId);

  const needs = await loadNeeds(db);
  const companyIds = [...new Set(needs.map((n) => n.companyId))].sort();

  const digests = new Map<string, { row: DigestRow; locked: boolean }>();
  for (const companyId of companyIds) {
    const { row, created } = await ensureDigest(db, { eventId, date, companyId });
    if (created) {
      await audit(db, {
        actor: "system",
        action: "digest.drafted",
        subjectType: "digest",
        subjectId: row.id,
        detail: { digestId: row.id, seed: row.seed },
      });
    }
    digests.set(companyId, { row, locked: await isLocked(db, row) });
  }

  const emptyByDigest = new Map<string, string[]>();
  const keptNeedIds = new Map<string, Set<string>>();

  for (const n of needs) {
    const d = digests.get(n.companyId)!;
    if (d.locked) continue;
    keptNeedIds.set(d.row.id, (keptNeedIds.get(d.row.id) ?? new Set()).add(n.rowId));

    const eligible = await loadEligible(db, n, date);
    const excluded = await excludedByIntros(db, n.companyId, eligible.map((e) => e.talentId), date);
    const pool = eligible.filter((e) => !excluded.has(e.talentId));
    if (pool.length === 0) {
      emptyByDigest.set(d.row.id, [...(emptyByDigest.get(d.row.id) ?? []), n.rowId]);
    }

    const history = await loadHistory(db, {
      talentIds: pool.map((e) => e.talentId),
      companyId: n.companyId,
      needCardId: n.rowId,
      date,
      rotationDays: settings.rotationDays,
    });
    const candidates: Candidate[] = pool.map((e) => {
      const h = history.get(e.talentId)!;
      return {
        talentId: e.talentId,
        lastDrafted: h.lastDrafted,
        recent: h.recent,
        capped: h.today >= settings.maxPicksPerDay,
      };
    });
    const seed = selectionSeed(eventId, date, n.companyId, n.rowId);
    const chosen = chooseHandful(candidates, { k: settings.digestSize, seed });

    const existing = await db
      .select({ id: pick.id, talentId: pick.talentId, needCardVersion: pick.needCardVersion, cardVersion: pick.cardVersion })
      .from(pick)
      .where(and(eq(pick.digestId, d.row.id), eq(pick.needCardId, n.rowId)));
    const byTalent = new Map(pool.map((e) => [e.talentId, e]));
    const unchanged =
      existing.length === chosen.length &&
      existing.every(
        (p) =>
          chosen.some((c) => c.talentId === p.talentId) &&
          p.needCardVersion === n.version &&
          p.cardVersion === byTalent.get(p.talentId)?.cardVersion,
      );
    if (unchanged) continue;

    const drafted = await mapPool(chosen, MODEL_CONCURRENCY, async (c) => {
      const e = byTalent.get(c.talentId)!;
      const touched = new Set(e.touched);
      const pairs = await computeAllowedPairs(db, n.need, touched, e.card);
      const { reasons } = await writeReasons(db, n.need, e.card, pairs);
      return { c, e, reasons, notMentioned: notMentionedIds(n.need, touched) };
    });

    if (existing.length > 0) {
      await db.delete(pick).where(and(eq(pick.digestId, d.row.id), eq(pick.needCardId, n.rowId)));
    }
    for (const item of drafted) {
      const id = newId("pick");
      const reasons: PickReason[] = item.reasons;
      const inserted = await db
        .insert(pick)
        .values({
          id,
          digestId: d.row.id,
          companyId: n.companyId,
          needCardId: n.rowId,
          needCardVersion: n.version,
          talentId: item.c.talentId,
          cardVersion: item.e.cardVersion,
          origin: "agent",
          body: { reasons, notMentioned: item.notMentioned },
          status: "suggested",
          selection: {
            seed,
            lastDraftedBefore: item.c.lastDraftedBefore ? item.c.lastDraftedBefore.toISOString() : null,
            pass: item.c.pass,
          },
        })
        .onConflictDoNothing()
        .returning({ id: pick.id });
      if (inserted.length === 0) continue;
      await audit(db, {
        actor: "agent:analyst",
        action: "pick.drafted",
        subjectType: "pick",
        subjectId: id,
        detail: { pickId: id, digestId: d.row.id, needCardId: n.rowId, origin: "agent", pass: item.c.pass },
      });
    }
  }

  // Picks for needs that are no longer current (stale or removed) leave an undecided digest.
  for (const { row, locked } of digests.values()) {
    if (locked) continue;
    const kept = keptNeedIds.get(row.id) ?? new Set<string>();
    const rows = await db.select({ id: pick.id, needCardId: pick.needCardId }).from(pick).where(eq(pick.digestId, row.id));
    const orphans = rows.filter((r) => !kept.has(r.needCardId)).map((r) => r.id);
    if (orphans.length > 0) await db.delete(pick).where(inArray(pick.id, orphans));
    const empty = (emptyByDigest.get(row.id) ?? []).sort();
    await db.update(digest).set({ emptyNeeds: empty }).where(eq(digest.id, row.id));
  }

  const digestIds = [...digests.values()].map((d) => d.row.id);
  const total = digestIds.length
    ? (await db.select({ id: pick.id }).from(pick).where(inArray(pick.digestId, digestIds))).length
    : 0;
  return { digests: digestIds.length, picks: total };
}
