import { and, eq, ne, notInArray, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { NeedCard, type Requirement } from "@/contracts";
import { eligibility, needCard } from "@/db/schema";
import { audit } from "@/lib/audit";
import { rowsOf } from "@/lib/sql";
import {
  ANCHOR_COUNT_FOR_LARGE_NEED,
  ANCHOR_THRESHOLD_LARGE,
  ANCHOR_THRESHOLD_SMALL,
  ROLE_TITLE_SIMILARITY,
} from "./constants";
import { textArray, touchingSignals } from "./touches";

type Scope = { needCardId: string } | { talentId: string };
type Outcome = { eligible: boolean; touched: string[]; cardVersion: number };

/** Skill, experience and education requirements, of either kind, are the anchors. */
function isAnchor(r: Requirement): boolean {
  return r.category === "skill" || r.category === "experience" || r.category === "education";
}

/** People who can be evaluated: in the pool and holding an approved card. Returns card versions. */
async function evaluablePeople(db: Db, talentIds?: string[]): Promise<Map<string, number>> {
  if (talentIds && talentIds.length === 0) return new Map();
  const filter = talentIds ? sql`AND t.id = ANY(${textArray(talentIds)})` : sql``;
  const result = await db.execute(sql`
    SELECT t.id, c.version FROM talent t
    JOIN signal_card c ON c.talent_id = t.id AND c.status = 'approved'
    WHERE t.in_pool ${filter}
  `);
  return new Map(rowsOf<{ id: string; version: number }>(result).map((r) => [r.id, Number(r.version)]));
}

/** People among `ids` whose own `lookingFor.roles` has an entry close to the title. */
async function roleHits(db: Db, ids: string[], title: string): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const result = await db.execute(sql`
    SELECT c.talent_id FROM signal_card c
    WHERE c.status = 'approved' AND c.talent_id = ANY(${textArray(ids)})
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(coalesce(c.body->'lookingFor'->'roles', '[]'::jsonb)) r
        WHERE word_similarity(lower(r), lower(${title})) >= ${ROLE_TITLE_SIMILARITY}
      )
  `);
  return new Set(rowsOf<{ talent_id: string }>(result).map((r) => r.talent_id));
}

/**
 * The rule of docs/specs/matching.md 3.2. The number of touched anchors lives only inside
 * this function, as a local that is compared with the threshold and dropped: nothing stores
 * it, returns it or sorts by it.
 */
async function evaluateNeed(
  db: Db,
  need: NeedCard,
  people: Map<string, number>,
): Promise<Map<string, Outcome>> {
  const ids = [...people.keys()];
  const touchedBy = new Map<string, Set<string>>(ids.map((id) => [id, new Set()]));
  for (const r of need.requirements) {
    for (const row of await touchingSignals(db, r, { talentIds: ids })) touchedBy.get(row.talentId)?.add(r.id);
  }
  const anchors = need.requirements.filter(isAnchor);
  const threshold =
    anchors.length >= ANCHOR_COUNT_FOR_LARGE_NEED ? ANCHOR_THRESHOLD_LARGE : ANCHOR_THRESHOLD_SMALL;
  const roleMatched = await roleHits(db, ids, need.title);

  const out = new Map<string, Outcome>();
  for (const id of ids) {
    const set = touchedBy.get(id) ?? new Set<string>();
    const touchedAnchors = anchors.filter((a) => set.has(a.id)).length;
    const eligible = touchedAnchors >= threshold || (touchedAnchors >= 1 && roleMatched.has(id));
    out.set(id, {
      eligible,
      touched: need.requirements.filter((r) => set.has(r.id)).map((r) => r.id),
      cardVersion: people.get(id) ?? 1,
    });
  }
  return out;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Write one need's rows for `outcomes`; returns how many rows were written and whether anything changed. */
async function writeNeed(
  db: Db,
  need: NeedCard,
  outcomes: Map<string, Outcome>,
  opts: { talentId?: string },
): Promise<{ rows: number; changed: boolean }> {
  const ids = [...outcomes.keys()];
  const existing = await db
    .select()
    .from(eligibility)
    .where(
      and(
        eq(eligibility.needCardId, need.id),
        opts.talentId ? eq(eligibility.talentId, opts.talentId) : undefined,
      ),
    );
  let changed = false;
  for (const row of existing) {
    const next = row.needCardVersion === need.version ? outcomes.get(row.talentId) : undefined;
    if (
      !next ||
      next.eligible !== row.eligible ||
      next.cardVersion !== row.cardVersion ||
      !sameSet(next.touched, row.touchedRequirementIds)
    ) {
      changed = true;
    }
  }

  // Drop rows of other need versions, and of people no longer evaluable.
  const scopeFilter = opts.talentId ? eq(eligibility.talentId, opts.talentId) : undefined;
  const keepFilter =
    ids.length > 0
      ? or(ne(eligibility.needCardVersion, need.version), notInArray(eligibility.talentId, ids))
      : undefined;
  await db
    .delete(eligibility)
    .where(and(eq(eligibility.needCardId, need.id), scopeFilter, keepFilter));

  const now = new Date();
  for (const [talentId, o] of outcomes) {
    const prev = existing.find((e) => e.talentId === talentId && e.needCardVersion === need.version);
    if (!prev) changed = true;
    await db
      .insert(eligibility)
      .values({
        needCardId: need.id,
        needCardVersion: need.version,
        talentId,
        cardVersion: o.cardVersion,
        eligible: o.eligible,
        touchedRequirementIds: o.touched,
        exclusion: null,
        computedAt: now,
      })
      .onConflictDoUpdate({
        target: [eligibility.needCardId, eligibility.needCardVersion, eligibility.talentId],
        // `exclusion` belongs to the picks code and is left as it is.
        set: {
          cardVersion: o.cardVersion,
          eligible: o.eligible,
          touchedRequirementIds: o.touched,
          computedAt: now,
        },
      });
  }
  return { rows: outcomes.size, changed };
}

function loadNeed(row: typeof needCard.$inferSelect): NeedCard | null {
  const parsed = NeedCard.safeParse({ ...(row.body as object), id: row.id, version: row.version });
  return parsed.success ? parsed.data : null;
}

/**
 * Recomputes eligibility rows, for one need against the pool or for one person against every
 * need. Also reports which needs had any row change, for the queue handlers.
 */
export async function computeEligibilityDetailed(
  db: Db,
  scope: Scope,
): Promise<{ rows: number; changedNeedCardIds: string[] }> {
  let rows = 0;
  const changedNeedCardIds: string[] = [];

  if ("needCardId" in scope) {
    const [row] = await db.select().from(needCard).where(eq(needCard.id, scope.needCardId));
    const need = row ? loadNeed(row) : null;
    if (need) {
      const people = await evaluablePeople(db);
      const outcomes = await evaluateNeed(db, need, people);
      const res = await writeNeed(db, need, outcomes, {});
      rows = res.rows;
      if (res.changed) changedNeedCardIds.push(need.id);
    }
    await audit(db, {
      actor: "system",
      action: "eligibility.computed",
      subjectType: "need_card",
      subjectId: scope.needCardId,
      detail: { rows },
    });
  } else {
    const people = await evaluablePeople(db, [scope.talentId]);
    const needs = await db.select().from(needCard);
    for (const row of needs.sort((a, b) => a.id.localeCompare(b.id))) {
      const need = loadNeed(row);
      if (!need) continue;
      const outcomes = people.size > 0 ? await evaluateNeed(db, need, people) : new Map<string, Outcome>();
      const res = await writeNeed(db, need, outcomes, { talentId: scope.talentId });
      rows += res.rows;
      if (res.changed) changedNeedCardIds.push(need.id);
    }
    await audit(db, {
      actor: "system",
      action: "eligibility.computed",
      subjectType: "talent",
      subjectId: scope.talentId,
      detail: { rows, needs: needs.length },
    });
  }
  return { rows, changedNeedCardIds };
}

/** FEATURE-API: `computeEligibility`. */
export async function computeEligibility(db: Db, scope: Scope): Promise<{ rows: number }> {
  const { rows } = await computeEligibilityDetailed(db, scope);
  return { rows };
}
