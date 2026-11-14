import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  auditLog,
  company,
  consent,
  interview,
  intro,
  jobQueue,
  notification,
  pick,
  signal as signalTable,
  signalCard,
  talent,
  talentIdentity,
  turn,
} from "@/db/schema";
import { dropPeopleFromRankings, exportApplications } from "@/features/application";
import { audit } from "@/lib/audit";
import { HttpError } from "@/lib/http";

/**
 * Everything stored about one person, for them to download. Only their own rows: no other
 * person, no company contact details, no organiser notes and no model logs. Redacted turns stay
 * redacted: their text was removed when they were redacted, and it is not brought back.
 */
export async function exportPersonData(db: Db, talentId: string) {
  const [person] = await db.select().from(talent).where(eq(talent.id, talentId));
  if (!person) throw new HttpError(404, "not_found", "Unknown person");

  const cards = await db.select().from(signalCard).where(eq(signalCard.talentId, talentId));
  const signals = await db.select().from(signalTable).where(eq(signalTable.talentId, talentId));
  const interviews = await db.select().from(interview).where(eq(interview.talentId, talentId));
  const transcript = [];
  for (const iv of interviews) {
    const turns = await db.select().from(turn).where(eq(turn.interviewId, iv.id)).orderBy(turn.index);
    transcript.push({
      interviewId: iv.id,
      mode: iv.mode,
      lang: iv.lang,
      status: iv.status,
      startedAt: iv.startedAt.toISOString(),
      completedAt: iv.completedAt?.toISOString() ?? null,
      turns: turns.map((t) => ({
        index: t.index,
        role: t.role,
        kind: t.kind,
        text: t.redactedAt ? null : t.text,
        sentences: t.redactedAt ? [] : t.sentences,
        lang: t.lang,
        inputMode: t.inputMode,
        redacted: t.redactedAt !== null,
        at: t.at.toISOString(),
      })),
    });
  }
  const consents = await db
    .select()
    .from(consent)
    .where(and(eq(consent.subjectType, "talent"), eq(consent.subjectId, talentId)));
  const intros = await db
    .select({ row: intro, companyName: company.displayName })
    .from(intro)
    .leftJoin(company, eq(company.id, intro.companyId))
    .where(eq(intro.talentId, talentId));
  const [identityRow] = await db.select().from(talentIdentity).where(eq(talentIdentity.talentId, talentId));
  // Rows about the person that are logged under their interview, introduction or pick, or name
  // them in the detail (for example identity.revealed written by the other side).
  const pickRows = await db
    .select({ id: pick.id })
    .from(pick)
    .where(eq(pick.talentId, talentId));
  const applications = await exportApplications(db, talentId);
  const applicationIds = applications.map((a) => (a as { id: string }).id);
  const ownIds = [
    talentId,
    ...interviews.map((i) => i.id),
    ...intros.map((i) => i.row.id),
    ...pickRows.map((p) => p.id),
    ...applicationIds,
  ];
  const auditRows = await db
    .select()
    .from(auditLog)
    .where(
      or(
        inArray(auditLog.subjectId, ownIds),
        eq(auditLog.actor, `talent:${talentId}`),
        sql`${auditLog.detail}->>'talentId' = ${talentId}`,
      ),
    )
    .orderBy(auditLog.id);

  await audit(db, {
    actor: `talent:${talentId}`,
    action: "data.exported",
    subjectType: "talent",
    subjectId: talentId,
    detail: { cards: cards.length, signals: signals.length, interviews: interviews.length, intros: intros.length },
  });

  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return {
    exportedAt: new Date().toISOString(),
    person: {
      id: person.id,
      handle: person.handle,
      inPool: person.inPool,
      synthetic: person.synthetic,
      liveDemo: person.liveDemo,
      purgeAfter: iso(person.purgeAfter),
      createdAt: person.createdAt.toISOString(),
    },
    identity: identityRow
      ? { displayName: identityRow.displayName, contact: identityRow.contact, createdAt: identityRow.createdAt.toISOString() }
      : null,
    cards: cards.map((c) => ({ status: c.status, version: c.version, approvedAt: iso(c.approvedAt), body: c.body })),
    signals: signals.map((s) => ({
      id: s.id,
      phrase: s.phrase,
      phraseOwn: s.phraseOwn,
      kind: s.kind,
      esco: s.escoUri ? { uri: s.escoUri, labelEn: s.escoLabelEn, labelFi: s.escoLabelFi } : null,
      evidence: s.evidence,
      status: s.status,
      addedBy: s.addedBy,
    })),
    transcript,
    applications,
    consents: consents.map((c) => ({ kind: c.kind, textVersion: c.textVersion, grantedAt: c.grantedAt.toISOString(), withdrawnAt: iso(c.withdrawnAt) })),
    introductions: intros.map(({ row, companyName }) => ({
      id: row.id,
      company: companyName,
      initiatedBy: row.initiatedBy,
      status: row.status,
      requestNote: row.requestNote,
      requestedAt: row.requestedAt.toISOString(),
      respondedAt: iso(row.respondedAt),
      acceptedAt: iso(row.acceptedAt),
      revealedAt: iso(row.revealedAt),
    })),
    audit: auditRows.map((a) => ({ at: a.at.toISOString(), actor: a.actor, action: a.action, subjectType: a.subjectType, detail: a.detail })),
  };
}

/** Rows that carry a person's id without a foreign key, so the talent cascade misses them. */
export async function deleteResidue(tx: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await tx.delete(consent).where(and(eq(consent.subjectType, "talent"), inArray(consent.subjectId, ids)));
  await tx.delete(notification).where(and(eq(notification.recipientType, "talent"), inArray(notification.recipientId, ids)));
  await tx.delete(jobQueue).where(inArray(sql<string>`${jobQueue.payload}->>'talentId'`, ids));
  // An approved list of applicants is a stored copy, and a pin names an application: neither hangs off the person.
  await dropPeopleFromRankings(tx, ids);
}

/**
 * Deletes the person and everything that hangs off them. Rows without a foreign key to the
 * person (consents, notifications, queued jobs) are removed here. One audit row records ids
 * and counts only; the audit log itself stays.
 */
export function deletePerson(db: Db, talentId: string): Promise<{ deleted: boolean }> {
  return db.transaction(async (tx) => {
    const [person] = await tx.select({ id: talent.id }).from(talent).where(eq(talent.id, talentId)).for("update");
    if (!person) return { deleted: false };
    const n = async (q: Promise<Array<{ n: number }>>) => (await q)[0]?.n ?? 0;
    const counts = {
      interviews: await n(tx.select({ n: sql<number>`count(*)::int` }).from(interview).where(eq(interview.talentId, talentId))),
      signals: await n(tx.select({ n: sql<number>`count(*)::int` }).from(signalTable).where(eq(signalTable.talentId, talentId))),
      cards: await n(tx.select({ n: sql<number>`count(*)::int` }).from(signalCard).where(eq(signalCard.talentId, talentId))),
      introductions: await n(tx.select({ n: sql<number>`count(*)::int` }).from(intro).where(eq(intro.talentId, talentId))),
    };
    await deleteResidue(tx, [talentId]);
    await tx.delete(talent).where(eq(talent.id, talentId)); // cascades to everything else
    await audit(tx, {
      actor: `talent:${talentId}`,
      action: "talent.deleted",
      subjectType: "talent",
      subjectId: talentId,
      detail: counts,
    });
    return { deleted: true };
  });
}
