import { eq } from "drizzle-orm";
import { signalEvidenceIsValid, type SignalCard } from "@/contracts";
import type { Db } from "@/db/client";
import { signal as signalTable, signalCard, talent, talentLanguage } from "@/db/schema";
import { audit } from "@/lib/audit";
import { hasConsent, recordConsent, withdrawConsent } from "@/lib/consent";
import { HttpError } from "@/lib/http";
import { enqueue } from "@/lib/queue";
import { languageCodes } from "./languages";
import { latestInterview, loadCard } from "./store";

/**
 * Approves the draft: validates it, replaces the approved row, rebuilds the person's `signal`
 * rows (status `approved`) and `talent_language`, writes `card.approved` to the audit log, and
 * enqueues `matching.card_approved`.
 */
export function approveCard(db: Db, talentId: string): Promise<{ version: number }> {
  return db.transaction(async (tx) => {
    // Serialise with review edits: the draft read below must be the draft that gets approved.
    await tx.select({ id: talent.id }).from(talent).where(eq(talent.id, talentId)).for("update");
    return approveLocked(tx, talentId);
  });
}

async function approveLocked(db: Db, talentId: string): Promise<{ version: number }> {
  const draft = await loadCard(db, talentId, "draft");
  if (!draft) throw new HttpError(409, "no_draft", "There is no draft card to approve");
  const active = draft.signals.filter((s) => s.status !== "removed");
  if (active.length === 0) throw new HttpError(409, "approve_empty", "Keep at least one note to approve");
  const itemFor = new Map(draft.companyView.items.map((i) => [i.signalId, i]));
  if (active.some((s) => !itemFor.get(s.id) || itemFor.get(s.id)!.stale)) {
    throw new HttpError(409, "stale_rendering", "Some company descriptions are not ready yet");
  }
  if (active.some((s) => !signalEvidenceIsValid(s))) {
    throw new HttpError(409, "evidence_invalid", "A note has no words behind it");
  }

  const now = new Date();
  const approvedSignals = active.map((s) => ({ ...s, status: "approved" as const }));
  const approved: SignalCard = {
    ...draft,
    status: "approved",
    signals: approvedSignals,
    companyView: {
      ...draft.companyView,
      items: draft.companyView.items.filter((i) => active.some((s) => s.id === i.signalId)),
    },
    approvedAt: now.toISOString(),
  };
  const iv = await latestInterview(db, talentId);
  const codes = languageCodes(draft.lookingFor.workLanguages);

  {
    const tx = db;
    await tx.delete(signalCard).where(eq(signalCard.talentId, talentId));
    await tx.insert(signalCard).values({
      talentId,
      status: "approved",
      version: approved.version,
      body: approved,
      approvedAt: now,
    });
    await tx.delete(signalTable).where(eq(signalTable.talentId, talentId));
    if (approvedSignals.length > 0) {
      await tx.insert(signalTable).values(
        approvedSignals.map((s) => ({
          talentId,
          id: s.id,
          interviewId: iv?.id ?? null,
          phrase: s.phrase,
          phraseOwn: s.phraseOwn,
          kind: s.kind,
          escoUri: s.esco?.uri ?? null,
          escoLabelEn: s.esco?.labelEn ?? null,
          escoLabelFi: s.esco?.labelFi ?? null,
          evidence: s.evidence,
          hasExample: s.hasExample,
          status: "approved" as const,
          addedBy: s.addedBy,
        })),
      );
    }
    await tx.delete(talentLanguage).where(eq(talentLanguage.talentId, talentId));
    if (codes.length > 0) {
      await tx.insert(talentLanguage).values(codes.map((code) => ({ talentId, code, basis: "declared" as const })));
    }
  }

  await audit(db, {
    actor: `talent:${talentId}`,
    action: "card.approved",
    subjectType: "signal_card",
    subjectId: talentId,
    detail: { version: approved.version, signalCount: approvedSignals.length },
  });
  await enqueue(
    db,
    "matching.card_approved",
    { talentId, cardVersion: approved.version },
    { dedupeKey: `matching.card_approved:${talentId}:${approved.version}` },
  );
  return { version: approved.version };
}

/** Pool membership changed: ask matching to recompute this person's eligibility. */
const enqueueEligibility = (db: Db, talentId: string, version: number) =>
  enqueue(db, "matching.card_approved", { talentId, cardVersion: version }, { dedupeKey: `matching.card_approved:${talentId}:${version}` });

/**
 * Opt in to (or out of) being suggested to companies. Opting in needs an approved card.
 * Withdrawing pending suggestions and introductions is the matching feature's job.
 */
export async function setPoolOptIn(db: Db, talentId: string, inPool: boolean): Promise<void> {
  const [person] = await db.select().from(talent).where(eq(talent.id, talentId));
  if (!person) throw new HttpError(404, "not_found", "Unknown person");
  const ref = { subjectType: "talent" as const, subjectId: talentId, kind: "pool" as const };
  if (inPool) {
    const approved = await loadCard(db, talentId, "approved");
    if (!approved) throw new HttpError(409, "no_approved_card", "Approve your card before joining the pool");
    if (!(await hasConsent(db, ref))) await recordConsent(db, ref);
    if (person.inPool) return;
    await db.update(talent).set({ inPool: true }).where(eq(talent.id, talentId));
    await audit(db, { actor: `talent:${talentId}`, action: "pool.opted_in", subjectType: "pool", subjectId: talentId });
    await enqueueEligibility(db, talentId, approved.version);
  } else {
    await withdrawConsent(db, ref);
    if (!person.inPool) return;
    await db.update(talent).set({ inPool: false }).where(eq(talent.id, talentId));
    await audit(db, { actor: `talent:${talentId}`, action: "pool.opted_out", subjectType: "pool", subjectId: talentId });
    const approved = await loadCard(db, talentId, "approved");
    if (approved) await enqueueEligibility(db, talentId, approved.version);
  }
}
