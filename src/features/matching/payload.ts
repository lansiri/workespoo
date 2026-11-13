import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { JOB_SOURCE_ATTRIBUTION, type EvidenceRef, type IntroForTalent, type IntroStatus, type JobSource } from "@/contracts";
import { jobQueue, needCard, signal, turn } from "@/db/schema";
import { getApprovedCard } from "@/features/card";
import { introsForTalent } from "@/features/intros";
import { renderEvidence } from "@/lib/sentences";
import { feedForTalent } from "./feed";
import { splitNotMentioned } from "./reasons";

/** What the person's `/matches` page needs. Their own data only: no order numbers, no counts. */
export type MatchItem = {
  jobId: string;
  title: string;
  employerName: string;
  municipality: string | null;
  url: string;
  source: JobSource;
  attribution: string;
  closesAt: string | null;
  /** How the posting was found, in words the page translates. */
  found: Array<"direct" | "occupation" | "text" | "role">;
  reasons: Array<{
    text: string;
    signalId: string;
    /** The labelled English rendering from the card, when there is one. */
    rendering: string | null;
    /** The person's own words, rendered by code from their transcript. */
    quote: string | null;
    /** The posting sentence the reason points at. */
    postingSentence: string | null;
  }>;
  /** `null` while the posting has no Need Card: its requirements are not read yet, which is not the same as none. */
  notMentioned: Array<{ text: string; statutory: boolean }> | null;
};

/**
 * An introduction as the person's browser receives it. Only what picks-and-intros.md section 6
 * lets the person see: who asks, about what, and the state. The organiser's note and name,
 * the request note, the company id and the pick id are not sent.
 */
export type TalentIntro = {
  id: string;
  initiatedBy: "company" | "talent";
  status: IntroStatus;
  companyName: string;
  needTitle: string | null;
  requestedAt: string;
  expiresAt: string | null;
  acceptedAt: string | null;
  /** The label code of a request that was not approved; never the organiser's free-text note. */
  notApprovedReason: IntroNotApprovedCode | null;
};

export type MatchesPayload = {
  matches: MatchItem[];
  intros: TalentIntro[];
  /** True while step two of the feed (model wording of the reasons) is still queued or running. */
  refining: boolean;
};

/** Reason codes the organiser can give when an introduction is not approved. The page has a label for each. */
export const INTRO_NOT_APPROVED_CODES = ["need_unrelated", "company_full", "other"] as const;
export type IntroNotApprovedCode = (typeof INTRO_NOT_APPROVED_CODES)[number];

/** A code the page has a label for; anything else is shown as "other". Never the organiser's note. */
export function introReasonCode(code: string | null): IntroNotApprovedCode {
  return (INTRO_NOT_APPROVED_CODES as readonly string[]).includes(code ?? "") ? (code as IntroNotApprovedCode) : "other";
}

async function isRefining(db: Db, talentId: string): Promise<boolean> {
  const rows = await db
    .select({ id: jobQueue.id })
    .from(jobQueue)
    .where(
      and(
        eq(jobQueue.kind, "matching.refine_feed"),
        sql`${jobQueue.payload}->>'talentId' = ${talentId}`,
        sql`${jobQueue.doneAt} is null`,
        lt(jobQueue.attempts, jobQueue.maxAttempts),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export function toTalentIntro(i: IntroForTalent): TalentIntro {
  const reason = i.status === "not_approved" ? introReasonCode(i.organiserDecision?.reasonCode ?? null) : null;
  return {
    id: i.id,
    initiatedBy: i.initiatedBy,
    status: i.status,
    companyName: i.companyName,
    needTitle: i.needTitle,
    requestedAt: i.requestedAt,
    expiresAt: i.expiresAt,
    acceptedAt: i.acceptedAt,
    notApprovedReason: reason,
  };
}

async function quotesFor(
  db: Db,
  talentId: string,
  wanted: Array<{ signalId: string; evidence: EvidenceRef }>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (wanted.length === 0) return out;
  const signals = await db
    .select({ id: signal.id, interviewId: signal.interviewId })
    .from(signal)
    .where(and(eq(signal.talentId, talentId), inArray(signal.id, [...new Set(wanted.map((w) => w.signalId))])));
  const interviewOf = new Map(signals.map((s) => [s.id, s.interviewId]));
  const interviewIds = [...new Set(signals.flatMap((s) => (s.interviewId ? [s.interviewId] : [])))];
  if (interviewIds.length === 0) return out;
  const turns = await db.select().from(turn).where(inArray(turn.interviewId, interviewIds));
  for (const w of wanted) {
    const interviewId = interviewOf.get(w.signalId);
    const t = turns.find((x) => x.interviewId === interviewId && x.index === w.evidence.turnIndex);
    const text = t ? renderEvidence(t.sentences, w.evidence.sentenceFrom, w.evidence.sentenceTo) : null;
    if (text) out.set(`${w.signalId}|${w.evidence.turnIndex}|${w.evidence.sentenceFrom}|${w.evidence.sentenceTo}`, text);
  }
  return out;
}

/** The feed and the introductions for one person. Either part degrades to empty if its feature is not available. */
export async function matchesPayload(db: Db, talentId: string): Promise<MatchesPayload> {
  const feed = await feedForTalent(db, talentId);
  let renderings = new Map<string, string>();
  try {
    const card = await getApprovedCard(db, talentId);
    if (card) renderings = new Map(card.companyView.items.map((i) => [i.signalId, i.text]));
  } catch {
    // The card feature is not available: reasons show without renderings.
  }
  const quotes = await quotesFor(
    db,
    talentId,
    feed.flatMap(({ match }) =>
      match.reasons.flatMap((r) => (r.evidence ? [{ signalId: r.signalId, evidence: r.evidence }] : [])),
    ),
  );

  const readIds = new Set(
    feed.length === 0
      ? []
      : (
          await db
            .select({ jobId: needCard.jobId })
            .from(needCard)
            .where(inArray(needCard.jobId, feed.map((f) => f.job.id)))
        ).map((r) => r.jobId),
  );

  const matches: MatchItem[] = feed.map(({ match, job }) => ({
    jobId: job.id,
    title: job.title,
    employerName: job.employerName,
    municipality: job.municipality,
    url: job.url,
    source: job.source,
    attribution: JOB_SOURCE_ATTRIBUTION[job.source],
    closesAt: job.expiresAt,
    found: match.basis,
    reasons: match.reasons.map((r) => ({
      text: r.text,
      signalId: r.signalId,
      rendering: renderings.get(r.signalId) ?? null,
      quote: r.evidence
        ? (quotes.get(`${r.signalId}|${r.evidence.turnIndex}|${r.evidence.sentenceFrom}|${r.evidence.sentenceTo}`) ?? null)
        : null,
      postingSentence: r.postingSentence === null ? null : (job.sentences[r.postingSentence] ?? null),
    })),
    notMentioned: readIds.has(job.id) ? match.notMentioned.map(splitNotMentioned) : null,
  }));

  let intros: TalentIntro[] = [];
  try {
    intros = (await introsForTalent(db, talentId)).map(toTalentIntro);
  } catch {
    // The introductions feature is not available yet: an empty list.
  }
  return { matches, intros, refining: await isRefining(db, talentId) };
}
