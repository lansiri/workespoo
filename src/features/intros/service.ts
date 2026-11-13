import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Intro, IntroStatus, AuditAction } from "@/contracts";
import type { Db } from "@/db/client";
import { digest, intro, pick, talentIdentity } from "@/db/schema";
import { audit } from "@/lib/audit";
import { HttpError } from "@/lib/http";
import { newId } from "@/lib/ids";
import { companyFromToken } from "@/lib/session";
import { getCurrentEvent } from "@/features/picks/settings";
import { DECLINE_COOLDOWN_DAYS, INTRO_EXPIRY_MS } from "@/features/picks/constants";
import { OPEN_STATUSES, partyMayMove, ruleFor, type Party } from "./machine";

type IntroRow = typeof intro.$inferSelect;

export type Mover =
  | { party: "talent"; id: string }
  | { party: "company"; id: string }
  | { party: "organiser" }
  | { party: "system" };

const actorOf = (m: Mover): string => (m.party === "talent" || m.party === "company" ? `${m.party}:${m.id}` : m.party);

/** The audit action for a move. `cancelled` has no agreed action name yet; see the report. */
function auditActionFor(from: IntroStatus | null, to: IntroStatus): AuditAction | null {
  if (from === null) return "intro.requested";
  switch (to) {
    case "awaiting_company":
    case "not_approved":
      return "intro.reviewed";
    case "accepted":
      return "intro.accepted";
    case "declined":
      return "intro.declined";
    case "withdrawn":
      return "intro.withdrawn";
    case "expired":
      return "intro.expired";
    default:
      return null;
  }
}

export const TalentAnswer = z.discriminatedUnion("decision", [
  z.strictObject({
    decision: z.literal("accept"),
    name: z.string().trim().min(1).max(80),
    contact: z.string().trim().min(3).max(120),
  }),
  z.strictObject({ decision: z.literal("decline") }),
]);
export type TalentAnswer = z.infer<typeof TalentAnswer>;

/**
 * Move an introduction along the transition table. Anything not in the table is a 409, a
 * move by the wrong party is a 403. Accepting by the person writes their name and contact
 * and sets `acceptedAt` and `revealedAt` in the same step; nothing is revealed before.
 */
export async function transitionIntro(
  db: Db,
  args: { introId: string; to: IntroStatus; by: Mover; identity?: { name: string; contact: string }; now?: Date },
): Promise<IntroRow> {
  const now = args.now ?? new Date();
  const [row] = await db.select().from(intro).where(eq(intro.id, args.introId)).limit(1);
  if (!row) throw new HttpError(404, "intro_not_found", "No such introduction");

  const rule = ruleFor(row.status, args.to);
  if (!rule) throw new HttpError(409, "illegal_transition", `An introduction cannot go from ${row.status} to ${args.to}`);
  if (!partyMayMove(rule.who, args.by.party as Party, row.initiatedBy)) {
    throw new HttpError(403, "forbidden", "This is not yours to change");
  }
  if (args.by.party === "talent" && args.by.id !== row.talentId) throw new HttpError(403, "forbidden", "This is not your introduction");
  if (args.by.party === "company" && args.by.id !== row.companyId) throw new HttpError(403, "forbidden", "This is not your introduction");

  return db.transaction(async (tx) => {
    if (args.to === "accepted") {
      if (args.identity) {
        await tx
          .insert(talentIdentity)
          .values({ talentId: row.talentId, displayName: args.identity.name, contact: args.identity.contact })
          .onConflictDoUpdate({
            target: talentIdentity.talentId,
            set: { displayName: args.identity.name, contact: args.identity.contact },
          });
      } else {
        const [known] = await tx.select({ id: talentIdentity.talentId }).from(talentIdentity).where(eq(talentIdentity.talentId, row.talentId)).limit(1);
        if (!known) throw new HttpError(409, "identity_needed", "The person has not yet given a name and contact");
      }
    }

    const changes: Partial<typeof intro.$inferInsert> = { status: args.to, respondedAt: now };
    if (args.to === "accepted") {
      changes.acceptedAt = now;
      changes.revealedAt = now;
    }
    const [updated] = await tx
      .update(intro)
      .set(changes)
      .where(and(eq(intro.id, row.id), eq(intro.status, row.status)))
      .returning();
    if (!updated) throw new HttpError(409, "illegal_transition", "The introduction changed; reload");

    const action = auditActionFor(row.status, args.to);
    const actor = actorOf(args.by);
    if (action) {
      await audit(tx, {
        actor: actor as never,
        action,
        subjectType: "intro",
        subjectId: row.id,
        detail: { introId: row.id, from: row.status, to: args.to, actor },
      });
    }
    if (args.to === "accepted") {
      await audit(tx, {
        actor: actor as never,
        action: "identity.revealed",
        subjectType: "intro",
        subjectId: row.id,
        detail: { introId: row.id, talentId: row.talentId, companyId: row.companyId },
      });
    }
    return updated;
  });
}

/** The person's answer to a request. Accepting needs a name and a contact; declining reveals nothing. */
export async function respondToIntro(
  db: Db,
  args: { introId: string; talentId: string; answer: TalentAnswer; now?: Date },
): Promise<{ id: string; status: IntroStatus }> {
  const [row] = await db.select({ talentId: intro.talentId }).from(intro).where(eq(intro.id, args.introId)).limit(1);
  if (!row) throw new HttpError(404, "intro_not_found", "No such introduction");
  if (row.talentId !== args.talentId) throw new HttpError(403, "forbidden", "This is not your introduction");
  const updated = await transitionIntro(db, {
    introId: args.introId,
    to: args.answer.decision === "accept" ? "accepted" : "declined",
    by: { party: "talent", id: args.talentId },
    identity: args.answer.decision === "accept" ? { name: args.answer.name, contact: args.answer.contact } : undefined,
    now: args.now,
  });
  return { id: updated.id, status: updated.status };
}

/**
 * A company, identified by the secret in its link, asks to meet the person in one of its
 * approved picks. The pick must belong to the company and sit in a published digest.
 */
export async function requestToMeet(
  db: Db,
  args: { token: string; pickId: string; now?: Date },
): Promise<{ id: string; status: IntroStatus; expiresAt: string | null }> {
  const now = args.now ?? new Date();
  const co = await companyFromToken(db, args.token);
  if (!co) throw new HttpError(404, "unknown_link", "This link has expired");

  const [row] = await db
    .select({ pick, digestStatus: digest.status })
    .from(pick)
    .innerJoin(digest, eq(digest.id, pick.digestId))
    .where(eq(pick.id, args.pickId))
    .limit(1);
  if (!row || row.pick.companyId !== co.id || row.pick.status !== "approved" || row.digestStatus !== "published") {
    throw new HttpError(403, "not_available", "You can only ask to meet someone from your approved picks");
  }

  const event = await getCurrentEvent(db);
  let expiresAt = new Date(now.getTime() + INTRO_EXPIRY_MS);
  if (event && event.startsAt.getTime() > now.getTime()) {
    const limit = new Date(event.startsAt.getTime() - 24 * 60 * 60 * 1000);
    if (limit.getTime() > now.getTime() && limit < expiresAt) expiresAt = limit;
  }

  const created = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`intro:${co.id}:${row.pick.talentId}`}))`);
    const existing = await tx
      .select({ status: intro.status, respondedAt: intro.respondedAt, requestedAt: intro.requestedAt })
      .from(intro)
      .where(and(eq(intro.companyId, co.id), eq(intro.talentId, row.pick.talentId)));
    const cooldownStart = new Date(now.getTime() - DECLINE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    const blocked = existing.some(
      (e) =>
        e.status === "accepted" ||
        (OPEN_STATUSES as readonly string[]).includes(e.status) ||
        (e.status === "declined" && (e.respondedAt ?? e.requestedAt) >= cooldownStart),
    );
    if (blocked) throw new HttpError(409, "already_requested", "There is already a request for this person");

    const [inserted] = await tx
      .insert(intro)
      .values({
        id: newId("intro"),
        talentId: row.pick.talentId,
        companyId: co.id,
        needCardId: row.pick.needCardId,
        pickId: row.pick.id,
        initiatedBy: "company",
        status: "awaiting_talent",
        requestPairs: [],
        requestedAt: now,
        expiresAt,
      })
      .returning();
    await audit(tx, {
      actor: `company:${co.id}` as never,
      action: "intro.requested",
      subjectType: "intro",
      subjectId: inserted.id,
      detail: { introId: inserted.id, pickId: row.pick.id, needCardId: row.pick.needCardId, to: "awaiting_talent", actor: `company:${co.id}` },
    });
    return inserted;
  });
  return { id: created.id, status: created.status, expiresAt: created.expiresAt ? created.expiresAt.toISOString() : null };
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

function toIntro(row: IntroRow): Intro {
  return {
    id: row.id,
    talentId: row.talentId,
    companyId: row.companyId,
    needCardId: row.needCardId,
    pickId: row.pickId,
    initiatedBy: row.initiatedBy,
    status: row.status,
    requestPairs: row.requestPairs,
    requestNote: row.requestNote,
    // The person sees the outcome, not the organiser's note.
    organiserDecision: row.organiserDecision
      ? { by: "organiser", at: row.organiserDecision.at, reasonCode: row.organiserDecision.reasonCode, note: null }
      : null,
    requestedAt: row.requestedAt.toISOString(),
    respondedAt: iso(row.respondedAt),
    acceptedAt: iso(row.acceptedAt),
    revealedAt: iso(row.revealedAt),
    expiresAt: iso(row.expiresAt),
  };
}

/** The introductions a person has to answer or has answered, newest first. */
export async function introsForTalent(db: Db, talentId: string): Promise<Intro[]> {
  const rows = await db
    .select()
    .from(intro)
    .where(eq(intro.talentId, talentId))
    .orderBy(desc(intro.requestedAt), desc(intro.id));
  return rows.map(toIntro);
}

