import { desc, eq, and } from "drizzle-orm";
import { NeedCard, type NeedCardStatus } from "@/contracts";
import type { Db } from "@/db/client";
import { needCard } from "@/db/schema";

type Row = typeof needCard.$inferSelect;

function parse(row: Row): NeedCard {
  return NeedCard.parse(row.body);
}

export async function getNeedCard(db: Db, needCardId: string): Promise<NeedCard | null> {
  const [row] = await db.select().from(needCard).where(eq(needCard.id, needCardId));
  return row ? parse(row) : null;
}

export async function getNeedCardForJob(db: Db, jobId: string): Promise<NeedCard | null> {
  const [row] = await db.select().from(needCard).where(eq(needCard.jobId, jobId));
  return row ? parse(row) : null;
}

export async function listNeedCards(
  db: Db,
  filter: { companyId?: string; status?: NeedCardStatus } = {},
): Promise<NeedCard[]> {
  const rows = await db
    .select()
    .from(needCard)
    .where(
      and(
        filter.companyId ? eq(needCard.companyId, filter.companyId) : undefined,
        filter.status ? eq(needCard.status, filter.status) : undefined,
      ),
    )
    .orderBy(desc(needCard.updatedAt), desc(needCard.id));
  return rows.map(parse);
}

/** When the row was first created (the "drafted from your posting on" date). */
export async function needCardCreatedAt(db: Db, needCardId: string): Promise<Date | null> {
  const [row] = await db.select({ at: needCard.createdAt }).from(needCard).where(eq(needCard.id, needCardId));
  return row?.at ?? null;
}

/**
 * Write a card back: validates the body and keeps the row's own columns (`version`, `status`,
 * `confirmedAt`) in step with it. The row must exist.
 */
export async function saveNeedCard(db: Db, card: NeedCard, now: Date = new Date()): Promise<NeedCard> {
  const body = NeedCard.parse(card);
  await db
    .update(needCard)
    .set({
      body,
      version: body.version,
      status: body.status,
      companyId: body.companyId,
      confirmedAt: body.confirmedAt ? new Date(body.confirmedAt) : null,
      updatedAt: now,
    })
    .where(eq(needCard.id, body.id));
  return body;
}
