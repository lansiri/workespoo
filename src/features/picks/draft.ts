import { and, eq, gt, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { NeedCard, SignalCard, type PickReason } from "@/contracts";
import type { Db } from "@/db/client";
import { company, digest, eligibility, intro, needCard, pick, signalCard, talent } from "@/db/schema";
import { audit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { DECLINE_COOLDOWN_DAYS, MODEL_CONCURRENCY, NO_EVENT_ID } from "./constants";
import { isOutOfDate, outOfDateFlags } from "./freshness";
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

/** A digest is published, or has a decision (the organiser is reviewing it). Neither is re-selected. */
async function isFrozen(db: Db, d: DigestRow): Promise<boolean> {
  if (d.status === "published") return true;
  const decided = await db
    .select({ id: pick.id })
    .from(pick)
    .where(and(eq(pick.digestId, d.id), ne(pick.status, "suggested")))
    .limit(1);
  return decided.length > 0;
}

/** Takes the digest row lock and answers whether the digest is now published or has a decision. Call inside a transaction. */
export async function lockedNow(tx: Db, digestId: string): Promise<boolean> {
  const [row] = await tx.select().from(digest).where(eq(digest.id, digestId)).for("update");
  return !row || (await isFrozen(tx, row));
}

/** Takes the digest row lock and answers whether the digest is published (or gone). Call inside a transaction. */
async function publishedNow(tx: Db, digestId: string): Promise<boolean> {
  const [row] = await tx.select().from(digest).where(eq(digest.id, digestId)).for("update");
  return !row || row.status === "published";
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
      eventId: args.eventId === NO_EVENT_ID ? null : args.eventId,
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

async function loadEligible(db: Db, n: NeedRow, date: string, now: Date): Promise<EligibleRow[]> {
  // Past purge_after means before the moment of the run, not before the start of the digest day.
  const cutoff = now.getTime() > dayStart(date).getTime() ? now : dayStart(date);
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
        or(isNull(talent.purgeAfter), gt(talent.purgeAfter, cutoff)),
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
  args: { talentIds: string[]; companyId: string; needCardId: string; date: string; rotationDays: number; lockedDigestIds: string[] },
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
        or(
          lt(digest.date, args.date),
          and(
            eq(digest.date, args.date),
            // Picks of locked digests are final for today whatever their need id; the rest keep a first run reproducible.
            or(
              lt(pick.needCardId, args.needCardId),
              args.lockedDigestIds.length ? inArray(pick.digestId, args.lockedDigestIds) : undefined,
            ),
          ),
        ),
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

/**
 * Refreshes the undecided, out-of-date picks of one need in a digest that already has
 * decisions. The person stays; the reasons are written again from the current need and card.
 * A pick whose person has no eligibility row for the current versions is left as it is.
 */
async function refreshOutOfDate(db: Db, digestId: string, n: NeedRow, date: string, now: Date): Promise<void> {
  const undecided = await db
    .select({ id: pick.id, talentId: pick.talentId, needCardId: pick.needCardId, needCardVersion: pick.needCardVersion, cardVersion: pick.cardVersion })
    .from(pick)
    .where(and(eq(pick.digestId, digestId), eq(pick.needCardId, n.rowId), eq(pick.status, "suggested")))
    .orderBy(pick.id);
  if (undecided.length === 0) return;
  const flags = await outOfDateFlags(db, undecided);
  const stale = undecided.filter((p) => isOutOfDate(flags.get(p.id)));
  if (stale.length === 0) return;

  const eligible = new Map((await loadEligible(db, n, date, now)).map((e) => [e.talentId, e]));
  const drafted = await mapPool(
    stale.filter((p) => eligible.has(p.talentId)),
    MODEL_CONCURRENCY,
    async (p) => {
      const e = eligible.get(p.talentId)!;
      const touched = new Set(e.touched);
      const pairs = await computeAllowedPairs(db, n.need, touched, e.card);
      const { reasons } = await writeReasons(db, n.need, e.card, pairs);
      return { p, e, reasons, notMentioned: notMentionedIds(n.need, touched) };
    },
  );

  await db.transaction(async (tx) => {
    if (await publishedNow(tx as unknown as Db, digestId)) return;
    for (const item of drafted) {
      // The organiser may have decided this pick while the model was writing: only a still undecided pick changes.
      const updated = await tx
        .update(pick)
        .set({
          needCardVersion: n.version,
          cardVersion: item.e.cardVersion,
          body: { reasons: item.reasons as PickReason[], notMentioned: item.notMentioned },
        })
        .where(and(eq(pick.id, item.p.id), eq(pick.status, "suggested")))
        .returning({ id: pick.id });
      if (updated.length === 0) continue;
      await audit(tx as unknown as Db, {
        actor: "agent:analyst",
        action: "pick.drafted",
        subjectType: "pick",
        subjectId: item.p.id,
        detail: { pickId: item.p.id, digestId, needCardId: n.rowId, origin: "agent", refreshed: true },
      });
    }
  });
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
 * day; running it again changes nothing unless a pick has gone out of date. A published
 * digest is never touched. A digest with decisions keeps its people and its decided picks;
 * only its undecided, out-of-date picks are refreshed (new reasons, new versions).
 */
export async function draftDailyDigests(db: Db, date: string, now: Date = new Date()): Promise<{ digests: number; picks: number }> {
  if (!DATE_RE.test(date)) throw new Error(`draftDailyDigests: invalid date "${date}"`);
  const event = await getCurrentEvent(db);
  const eventId = eventIdOf(event);
  const settings: PicksSettings = await loadSettings(db, eventId);

  const needs = await loadNeeds(db);
  const companyIds = [...new Set(needs.map((n) => n.companyId))].sort();

  const digests = new Map<string, { row: DigestRow; locked: boolean; published: boolean }>();
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
    digests.set(companyId, { row, locked: await isFrozen(db, row), published: row.status === "published" });
  }

  const emptyByDigest = new Map<string, string[]>();
  const keptNeedIds = new Map<string, Set<string>>();

  for (const n of needs) {
    const d = digests.get(n.companyId)!;
    if (d.published) continue;
    if (d.locked) {
      // Under review: nobody is added or removed, but undecided picks whose card or need moved on get new reasons.
      await refreshOutOfDate(db, d.row.id, n, date, now);
      continue;
    }
    keptNeedIds.set(d.row.id, (keptNeedIds.get(d.row.id) ?? new Set()).add(n.rowId));

    const eligible = await loadEligible(db, n, date, now);
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
      lockedDigestIds: [...digests.values()].filter((x) => x.locked).map((x) => x.row.id),
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

    await db.transaction(async (tx) => {
      // The organiser may have decided or published while the model was writing: look again under the digest lock.
      if (await lockedNow(tx as unknown as Db, d.row.id)) return;
      if (existing.length > 0) {
        await tx.delete(pick).where(and(eq(pick.digestId, d.row.id), eq(pick.needCardId, n.rowId), eq(pick.status, "suggested")));
      }
      for (const item of drafted) {
        const id = newId("pick");
        const reasons: PickReason[] = item.reasons;
        const inserted = await tx
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
        await audit(tx as unknown as Db, {
          actor: "agent:analyst",
          action: "pick.drafted",
          subjectType: "pick",
          subjectId: id,
          detail: { pickId: id, digestId: d.row.id, needCardId: n.rowId, origin: "agent", pass: item.c.pass },
        });
      }
    });
  }

  // Picks for needs that are no longer current (stale or removed) leave an undecided digest.
  for (const { row, locked } of digests.values()) {
    if (locked) continue;
    const kept = keptNeedIds.get(row.id) ?? new Set<string>();
    const rows = await db.select({ id: pick.id, needCardId: pick.needCardId }).from(pick).where(eq(pick.digestId, row.id));
    const orphans = rows.filter((r) => !kept.has(r.needCardId)).map((r) => r.id);
    const empty = (emptyByDigest.get(row.id) ?? []).sort();
    await db.transaction(async (tx) => {
      if (await lockedNow(tx as unknown as Db, row.id)) return;
      if (orphans.length > 0) await tx.delete(pick).where(and(inArray(pick.id, orphans), eq(pick.status, "suggested")));
      await tx.update(digest).set({ emptyNeeds: empty }).where(eq(digest.id, row.id));
    });
  }

  const digestIds = [...digests.values()].map((d) => d.row.id);
  const total = digestIds.length
    ? (await db.select({ id: pick.id }).from(pick).where(inArray(pick.digestId, digestIds))).length
    : 0;
  return { digests: digestIds.length, picks: total };
}
