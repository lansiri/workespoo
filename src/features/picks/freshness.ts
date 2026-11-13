import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { needCard, signalCard } from "@/db/schema";

export type Freshness = { need: boolean; card: boolean };

type Versioned = { needCardId: string; needCardVersion: number; talentId: string; cardVersion: number };

/**
 * A pick's reasons were written for one Need Card version and one card version. When either
 * has moved on, the pick is out of date and its old reasons must not be shown as current.
 */
export async function outOfDateFlags<T extends Versioned & { id: string }>(
  db: Db,
  picks: readonly T[],
): Promise<Map<string, Freshness>> {
  const needIds = [...new Set(picks.map((p) => p.needCardId))];
  const talentIds = [...new Set(picks.map((p) => p.talentId))];
  const needVersions = new Map<string, number>();
  const cardVersions = new Map<string, number>();
  if (needIds.length > 0) {
    for (const r of await db.select({ id: needCard.id, version: needCard.version }).from(needCard).where(inArray(needCard.id, needIds))) {
      needVersions.set(r.id, r.version);
    }
  }
  if (talentIds.length > 0) {
    for (const r of await db
      .select({ talentId: signalCard.talentId, version: signalCard.version })
      .from(signalCard)
      .where(and(inArray(signalCard.talentId, talentIds), eq(signalCard.status, "approved")))) {
      cardVersions.set(r.talentId, r.version);
    }
  }
  const out = new Map<string, Freshness>();
  for (const p of picks) {
    out.set(p.id, {
      need: needVersions.get(p.needCardId) !== p.needCardVersion,
      card: cardVersions.get(p.talentId) !== p.cardVersion,
    });
  }
  return out;
}

export const isOutOfDate = (f: Freshness | undefined): boolean => Boolean(f && (f.need || f.card));
