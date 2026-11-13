import { and, eq, isNull } from "drizzle-orm";
import type { ConsentKind } from "@/contracts";
import type { Db } from "@/db/client";
import { consent } from "@/db/schema";
import { newId } from "@/lib/ids";

/** Bump when the wording shown to people changes. Stored with every grant. */
export const CONSENT_TEXT_VERSION = "2026-11-v1";

type ConsentRef = { subjectType: "talent" | "company"; subjectId: string; kind: ConsentKind };

function active(c: ConsentRef) {
  return and(
    eq(consent.subjectType, c.subjectType),
    eq(consent.subjectId, c.subjectId),
    eq(consent.kind, c.kind),
    isNull(consent.withdrawnAt),
  );
}

/** Grant consent. A no-op when an active grant exists; after a withdrawal it adds a new row. */
export async function recordConsent(db: Db, c: ConsentRef): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: consent.id }).from(consent).where(active(c)).limit(1);
    if (existing) return;
    await tx.insert(consent).values({
      id: newId("con"),
      subjectType: c.subjectType,
      subjectId: c.subjectId,
      kind: c.kind,
      textVersion: CONSENT_TEXT_VERSION,
    });
  });
}

export async function withdrawConsent(db: Db, c: ConsentRef): Promise<void> {
  await db.update(consent).set({ withdrawnAt: new Date() }).where(active(c));
}

export async function hasConsent(db: Db, c: ConsentRef): Promise<boolean> {
  const [row] = await db.select({ id: consent.id }).from(consent).where(active(c)).limit(1);
  return row !== undefined;
}
