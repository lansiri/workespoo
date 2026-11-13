import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { company, digest, pick } from "@/db/schema";
import { audit } from "@/lib/audit";
import { HttpError } from "@/lib/http";
import { REMOVE_NOTE_MAX, REMOVE_REASON_CODES, UNDO_WINDOW_MS } from "./constants";
import { isOutOfDate, outOfDateFlags } from "./freshness";

const PickId = z.string().min(1).max(64);

/**
 * The body of `POST /api/picks/decision`. It names exactly one pick: `strictObject` means a
 * request carrying `pickIds`, or anything else unknown, is refused. There is no bulk path.
 */
export const DecisionBody = z.discriminatedUnion("decision", [
  z.strictObject({ pickId: PickId, decision: z.literal("approve") }),
  z.strictObject({
    pickId: PickId,
    decision: z.literal("remove"),
    reasonCode: z.enum(REMOVE_REASON_CODES),
    note: z.string().max(REMOVE_NOTE_MAX).optional(),
  }),
  z.strictObject({ pickId: PickId, decision: z.literal("undo") }),
]);
export type DecisionBody = z.infer<typeof DecisionBody>;

async function loadPick(db: Db, pickId: string) {
  const [row] = await db
    .select({ pick, digestStatus: digest.status })
    .from(pick)
    .innerJoin(digest, eq(digest.id, pick.digestId))
    .where(eq(pick.id, pickId))
    .limit(1);
  if (!row) throw new HttpError(404, "pick_not_found", "No such pick");
  return row;
}

/** Apply one decision to one pick. Throws `HttpError` for anything the rules refuse. */
export async function decidePick(
  db: Db,
  input: DecisionBody,
  opts: { now?: Date } = {},
): Promise<{ id: string; status: "suggested" | "approved" | "removed" }> {
  const now = opts.now ?? new Date();
  const { pick: p, digestStatus } = await loadPick(db, input.pickId);
  if (digestStatus !== "draft") throw new HttpError(409, "digest_published", "This digest is already published");

  if (input.decision === "approve") {
    if (p.status !== "suggested") throw new HttpError(409, "already_decided", "Undo the earlier decision first");
    const flags = (await outOfDateFlags(db, [p])).get(p.id);
    if (isOutOfDate(flags)) {
      throw new HttpError(409, "out_of_date", "The card or the need changed since this pick was drafted. Run today's picks again.");
    }
    const changed = await db
      .update(pick)
      .set({ status: "approved", decidedBy: "organiser", decidedAt: now })
      .where(and(eq(pick.id, p.id), eq(pick.status, "suggested")))
      .returning({ id: pick.id });
    if (changed.length === 0) throw new HttpError(409, "already_decided", "Undo the earlier decision first");
    await audit(db, {
      actor: "organiser",
      action: "pick.approved",
      subjectType: "pick",
      subjectId: p.id,
      detail: { pickId: p.id, digestId: p.digestId, needCardId: p.needCardId },
    });
    return { id: p.id, status: "approved" };
  }

  if (input.decision === "remove") {
    const note = input.note?.trim() ?? "";
    if (input.reasonCode === "other" && note.length === 0) {
      throw new HttpError(400, "invalid_body", "Write why when the reason is Other");
    }
    if (p.status !== "suggested") throw new HttpError(409, "already_decided", "Undo the earlier decision first");
    const changed = await db
      .update(pick)
      .set({ status: "removed", reasonCode: input.reasonCode, decisionNote: note || null, decidedBy: "organiser", decidedAt: now })
      .where(and(eq(pick.id, p.id), eq(pick.status, "suggested")))
      .returning({ id: pick.id });
    if (changed.length === 0) throw new HttpError(409, "already_decided", "Undo the earlier decision first");
    // The note stays on the pick. The audit row holds ids and the reason code only.
    await audit(db, {
      actor: "organiser",
      action: "pick.removed",
      subjectType: "pick",
      subjectId: p.id,
      detail: { pickId: p.id, digestId: p.digestId, needCardId: p.needCardId, reasonCode: input.reasonCode },
    });
    return { id: p.id, status: "removed" };
  }

  // undo
  if (p.status === "suggested") throw new HttpError(409, "not_decided", "This pick has no decision to undo");
  if (p.decidedAt && now.getTime() - p.decidedAt.getTime() > UNDO_WINDOW_MS) {
    throw new HttpError(409, "undo_window_closed", "A decision can be undone for ten minutes");
  }
  const previous = p.status;
  const changed = await db
    .update(pick)
    .set({ status: "suggested", reasonCode: null, decisionNote: null, decidedBy: null, decidedAt: null })
    .where(and(eq(pick.id, p.id), eq(pick.status, previous)))
    .returning({ id: pick.id });
  if (changed.length === 0) throw new HttpError(409, "already_decided", "The decision changed; reload");
  await audit(db, {
    actor: "organiser",
    action: "pick.decision_undone",
    subjectType: "pick",
    subjectId: p.id,
    detail: { pickId: p.id, digestId: p.digestId, previous },
  });
  return { id: p.id, status: "suggested" };
}

/** Publish one digest. Refused while any pick is undecided. Records who and when. */
export async function publishDigest(
  db: Db,
  digestId: string,
  opts: { now?: Date } = {},
): Promise<{ id: string; status: "published"; publishedAt: string; companyPath: string }> {
  const now = opts.now ?? new Date();
  const [d] = await db
    .select({ digest, token: company.digestToken })
    .from(digest)
    .innerJoin(company, eq(company.id, digest.companyId))
    .where(eq(digest.id, digestId))
    .limit(1);
  if (!d) throw new HttpError(404, "digest_not_found", "No such digest");
  if (d.digest.status === "published") throw new HttpError(409, "already_published", "This digest is already published");

  const picks = await db.select({ status: pick.status }).from(pick).where(eq(pick.digestId, digestId));
  if (picks.some((p) => p.status === "suggested")) {
    throw new HttpError(409, "undecided", "Decide every pick first");
  }
  const changed = await db
    .update(digest)
    .set({ status: "published", publishedBy: "organiser", publishedAt: now })
    .where(and(eq(digest.id, digestId), eq(digest.status, "draft")))
    .returning({ id: digest.id });
  if (changed.length === 0) throw new HttpError(409, "already_published", "This digest is already published");
  await audit(db, {
    actor: "organiser",
    action: "digest.published",
    subjectType: "digest",
    subjectId: digestId,
    detail: {
      digestId,
      approved: picks.filter((p) => p.status === "approved").length,
      removed: picks.filter((p) => p.status === "removed").length,
    },
  });
  return { id: digestId, status: "published", publishedAt: now.toISOString(), companyPath: `/c/${d.token}` };
}
