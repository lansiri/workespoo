import { and, eq, isNull } from "drizzle-orm";
import type { ConsentKind } from "@/contracts";
import type { Db } from "@/db/client";
import { consent } from "@/db/schema";
import { newId } from "@/lib/ids";

/** Bump when the wording shown to people changes. Stored with every grant. */
export const CONSENT_TEXT_VERSION = "2026-11-v2";

/**
 * The voice consent has two wordings. This one promises that the audio is turned into text on
 * WorkEspoo's own server and that no other company receives it. It is stored with the grant so
 * that the promise can be kept later: a person who agreed to this wording is never handed to
 * another speech service, whatever the deployment would otherwise choose at that moment.
 */
export const VOICE_OWN_SERVER_TEXT_VERSION = `${CONSENT_TEXT_VERSION}/own-server`;

type ConsentRef = { subjectType: "talent" | "company"; subjectId: string; kind: ConsentKind };

function active(c: ConsentRef) {
  return and(
    eq(consent.subjectType, c.subjectType),
    eq(consent.subjectId, c.subjectId),
    eq(consent.kind, c.kind),
    isNull(consent.withdrawnAt),
  );
}

/**
 * Grant consent under one wording. A no-op when an active grant under the same wording exists.
 * A grant under another wording closes the older one and adds a new row, because the text a
 * person agreed to last is the one that holds. After a withdrawal it adds a new row.
 */
export async function recordConsent(db: Db, c: ConsentRef, textVersion: string = CONSENT_TEXT_VERSION): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: consent.id, textVersion: consent.textVersion })
      .from(consent)
      .where(active(c))
      .limit(1);
    if (existing?.textVersion === textVersion) return;
    if (existing) await tx.update(consent).set({ withdrawnAt: new Date() }).where(eq(consent.id, existing.id));
    await tx.insert(consent).values({
      id: newId("con"),
      subjectType: c.subjectType,
      subjectId: c.subjectId,
      kind: c.kind,
      textVersion,
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

/** The wording the active grant was given under, or null when there is no active grant. */
export async function activeConsentTextVersion(db: Db, c: ConsentRef): Promise<string | null> {
  const [row] = await db.select({ textVersion: consent.textVersion }).from(consent).where(active(c)).limit(1);
  return row?.textVersion ?? null;
}
