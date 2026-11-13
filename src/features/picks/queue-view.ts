import { and, eq, inArray, or } from "drizzle-orm";
import { NeedCard, type CardForOrganiser } from "@/contracts";
import type { Db } from "@/db/client";
import { company, digest, job, needCard, pick } from "@/db/schema";
import { cardForOrganiser } from "@/features/card";
import { mustFirst } from "./reasons";
import { inDisplayOrder } from "./hash";
import { isOutOfDate, outOfDateFlags } from "./freshness";
import { maskEmployer } from "@/lib/mask";
import { helsinkiDate } from "./time";

/**
 * The organiser's review queue payload. Built field by field from the projections: no
 * quote, name, interview language or input mode is read, and there is no number about a
 * person. Picks are in the seeded shuffled order and the payload says so.
 */
export type QueueRequirement = { id: string; text: string; kind: "must" | "nice"; touched: boolean };

export type QueueReason = {
  text: string;
  requirementId: string;
  requirementText: string;
  signalId: string;
  signalPhrase: string | null;
  /** The labelled English rendering of the signal, from the company-level card. */
  rendering: string | null;
  /** The posting sentence the requirement came from, with the employer's name masked. */
  postingSentence: string | null;
};

export type QueuePick = {
  id: string;
  status: "suggested" | "approved" | "removed";
  origin: "agent" | "organiser" | "talent_request";
  /** Set when the card or the need changed after the reasons were written. Reasons are then withheld. */
  outOfDate: { need: boolean; card: boolean } | null;
  card: CardForOrganiser | null;
  reasons: QueueReason[];
  requirements: QueueRequirement[];
  notMentioned: Array<{ id: string; text: string; statutory: boolean }>;
  basis: { lastDrafted: string | null; seedPrefix: string | null };
  decision: { reasonCode: string | null; note: string | null } | null;
};

export type QueueNeed = {
  needCardId: string;
  title: string;
  /** True when nobody was eligible for this need. */
  nobodyRelates: boolean;
  picks: QueuePick[];
};

export type QueueDigest = {
  id: string;
  company: { id: string; displayName: string };
  date: string;
  status: "draft" | "published";
  publishedAt: string | null;
  /** The company's link, for the demo. Present only once the digest is published. */
  companyPath: string | null;
  undecided: number;
  approved: number;
  removed: number;
  needs: QueueNeed[];
};

export type ReviewQueue = { date: string; order: "no_particular_order"; digests: QueueDigest[] };

async function organiserCard(db: Db, talentId: string): Promise<CardForOrganiser | null> {
  try {
    return await cardForOrganiser(db, talentId);
  } catch (error) {
    console.error("[picks] cardForOrganiser failed:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function buildReviewQueue(db: Db, opts: { now?: Date } = {}): Promise<ReviewQueue> {
  const today = helsinkiDate(opts.now ?? new Date());
  const digests = await db
    .select({ d: digest, companyName: company.displayName, token: company.digestToken })
    .from(digest)
    .innerJoin(company, eq(company.id, digest.companyId))
    .where(or(eq(digest.status, "draft"), and(eq(digest.status, "published"), eq(digest.date, today))));
  digests.sort((a, b) => a.companyName.localeCompare(b.companyName) || a.d.id.localeCompare(b.d.id));
  const digestIds = digests.map((x) => x.d.id);
  if (digestIds.length === 0) return { date: today, order: "no_particular_order", digests: [] };

  const picks = await db.select().from(pick).where(inArray(pick.digestId, digestIds));
  const needIds = [...new Set([...picks.map((p) => p.needCardId), ...digests.flatMap((x) => x.d.emptyNeeds)])];
  const needRows = needIds.length ? await db.select().from(needCard).where(inArray(needCard.id, needIds)) : [];
  const needs = new Map<string, NeedCard>();
  for (const r of needRows) {
    const parsed = NeedCard.safeParse(r.body);
    if (parsed.success) needs.set(r.id, parsed.data);
  }
  const jobIds = [...new Set([...needs.values()].map((n) => n.jobId))];
  const jobRows = jobIds.length
    ? await db.select({ id: job.id, sentences: job.sentences, employerName: job.employerName }).from(job).where(inArray(job.id, jobIds))
    : [];
  const jobs = new Map(jobRows.map((j) => [j.id, j]));
  const freshness = await outOfDateFlags(db, picks);

  const cards = new Map<string, CardForOrganiser | null>();
  for (const talentId of new Set(picks.map((p) => p.talentId))) cards.set(talentId, await organiserCard(db, talentId));

  const out: QueueDigest[] = [];
  for (const { d, companyName, token } of digests) {
    const mine = picks.filter((p) => p.digestId === d.id);
    const groupIds = [...new Set([...mine.map((p) => p.needCardId), ...d.emptyNeeds])].sort();
    const queueNeeds: QueueNeed[] = groupIds.map((needId) => {
      const need = needs.get(needId);
      const jobRow = need ? jobs.get(need.jobId) : undefined;
      const mask = (text: string) => (jobRow ? maskEmployer(text, jobRow.employerName) : text);
      const ordered = inDisplayOrder(
        mine.filter((p) => p.needCardId === needId),
        d.seed,
        (p) => p.id,
      );
      const queuePicks: QueuePick[] = ordered.map((p) => {
        const flags = freshness.get(p.id);
        const stale = isOutOfDate(flags);
        const card = cards.get(p.talentId) ?? null;
        const base = {
          id: p.id,
          status: p.status,
          origin: p.origin,
          outOfDate: stale && flags ? { need: flags.need, card: flags.card } : null,
          card,
          basis: {
            lastDrafted: p.selection ? (p.selection.lastDraftedBefore ? p.selection.lastDraftedBefore.slice(0, 10) : null) : null,
            seedPrefix: p.selection ? p.selection.seed.slice(0, 8) : null,
          },
          decision:
            p.status === "suggested" ? null : { reasonCode: p.reasonCode, note: p.decisionNote },
        };
        if (stale || !need) {
          return { ...base, reasons: [], requirements: [], notMentioned: [] };
        }
        const notMentioned = new Set(p.body.notMentioned);
        const signalsById = new Map((card?.signals ?? []).map((s) => [s.id, s]));
        const reasons: QueueReason[] = p.body.reasons.flatMap((r) => {
          const requirement = need.requirements.find((q) => q.id === r.requirementId);
          if (!requirement) return [];
          const signal = signalsById.get(r.signalId);
          const sentence = requirement.postingSentence === null ? undefined : jobRow?.sentences[requirement.postingSentence];
          return [
            {
              text: r.text,
              requirementId: requirement.id,
              requirementText: mask(requirement.text),
              signalId: r.signalId,
              signalPhrase: signal?.phrase ?? null,
              rendering: signal?.rendering ?? null,
              postingSentence: sentence ? mask(sentence) : null,
            },
          ];
        });
        return {
          ...base,
          reasons,
          requirements: need.requirements.map((r) => ({
            id: r.id,
            text: mask(r.text),
            kind: r.kind,
            touched: !notMentioned.has(r.id),
          })),
          notMentioned: mustFirst(need.requirements)
            .filter((r) => notMentioned.has(r.id))
            .map((r) => ({ id: r.id, text: mask(r.text), statutory: r.statutory !== "none" })),
        };
      });
      return {
        needCardId: needId,
        title: need ? mask(need.title) : needId,
        nobodyRelates: d.emptyNeeds.includes(needId),
        picks: queuePicks,
      };
    });
    out.push({
      id: d.id,
      company: { id: d.companyId, displayName: companyName },
      date: d.date,
      status: d.status,
      publishedAt: d.publishedAt ? d.publishedAt.toISOString() : null,
      companyPath: d.status === "published" ? `/c/${token}` : null,
      undecided: mine.filter((p) => p.status === "suggested").length,
      approved: mine.filter((p) => p.status === "approved").length,
      removed: mine.filter((p) => p.status === "removed").length,
      needs: queueNeeds,
    });
  }
  return { date: today, order: "no_particular_order", digests: out };
}
