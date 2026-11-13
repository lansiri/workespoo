import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { NeedCard, type CardForCompany, type IntroStatus } from "@/contracts";
import type { Db } from "@/db/client";
import { digest, intro, job, needCard, pick } from "@/db/schema";
import { cardForCompany, cardForCompanyRevealed } from "@/features/card";
import { companyFromToken } from "@/lib/session";
import { inDisplayOrder } from "./hash";
import { maskEmployer } from "@/lib/mask";
import { mustFirst } from "./reasons";

/**
 * What a company's digest page is built from. Every field is chosen here, one by one, from
 * the company-level projections: no name, contact, quote, interview language, input mode,
 * number or ordering signal reaches this object until an introduction is accepted, and then
 * only for that one pair. The real employer name never appears: posting text is masked.
 */
export type CompanyPick = {
  id: string;
  card: CardForCompany;
  /** True when the person asked to meet this company. */
  askedByPerson: boolean;
  reasons: Array<{
    text: string;
    requirementText: string;
    signalId: string;
    rendering: string | null;
    postingSentence: string | null;
  }>;
  requirements: Array<{ id: string; text: string; mentioned: boolean }>;
  notMentioned: Array<{ text: string; statutory: boolean }>;
  canAsk: boolean;
  intro: { id: string; status: IntroStatus; expiresAt: string | null } | null;
  /** Present only after both sides agreed. Never includes interview language or input mode. */
  revealed: null | {
    name: string;
    contact: string | null;
    signals: Array<{ id: string; phrase: string; phraseOwn: string | null; quotes: string[] }>;
  };
};

export type CompanyPageData = {
  demo: true;
  company: { displayName: string };
  needs: Array<{ id: string; title: string; summary: string; status: "draft" | "confirmed" }>;
  digest: null | {
    date: string;
    groups: Array<{ needCardId: string; title: string; nobodyRelates: boolean; picks: CompanyPick[] }>;
  };
};

const REASKABLE: readonly IntroStatus[] = ["withdrawn", "expired"];

async function safe<T>(fn: () => Promise<T | null>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    console.error("[picks] card projection failed:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function buildCompanyPage(db: Db, token: string): Promise<CompanyPageData | null> {
  const co = await companyFromToken(db, token);
  if (!co) return null;

  const needRows = await db
    .select()
    .from(needCard)
    .where(and(eq(needCard.companyId, co.id), ne(needCard.status, "stale")))
    .orderBy(needCard.id);
  const needs = new Map<string, { card: NeedCard; version: number }>();
  for (const r of needRows) {
    const parsed = NeedCard.safeParse(r.body);
    if (parsed.success) needs.set(r.id, { card: parsed.data, version: r.version });
  }
  const jobRows = needs.size
    ? await db
        .select({ id: job.id, sentences: job.sentences, employerName: job.employerName })
        .from(job)
        .where(inArray(job.id, [...needs.values()].map((n) => n.card.jobId)))
    : [];
  const jobs = new Map(jobRows.map((j) => [j.id, j]));
  const maskFor = (n: NeedCard) => {
    const employer = jobs.get(n.jobId)?.employerName ?? "";
    return (text: string) => maskEmployer(text, employer);
  };

  const needList: CompanyPageData["needs"] = [...needs.entries()].map(([id, { card }]) => ({
    id,
    title: maskFor(card)(card.title),
    summary: maskFor(card)(card.summary),
    status: card.status === "confirmed" ? "confirmed" : "draft",
  }));

  const [latest] = await db
    .select()
    .from(digest)
    .where(and(eq(digest.companyId, co.id), eq(digest.status, "published")))
    .orderBy(desc(digest.date), desc(digest.publishedAt))
    .limit(1);
  if (!latest) return { demo: true, company: { displayName: co.displayName }, needs: needList, digest: null };

  const approved = await db
    .select()
    .from(pick)
    .where(and(eq(pick.digestId, latest.id), eq(pick.status, "approved")));
  const introRows = approved.length
    ? await db
        .select()
        .from(intro)
        .where(and(eq(intro.companyId, co.id), inArray(intro.talentId, [...new Set(approved.map((p) => p.talentId))])))
        .orderBy(desc(intro.requestedAt), desc(intro.id))
    : [];

  const picksByNeed = new Map<string, CompanyPick[]>();
  for (const p of inDisplayOrder(approved, latest.seed, (x) => x.id)) {
    const card = await safe(() => cardForCompany(db, p.talentId));
    if (!card) continue;
    const need = needs.get(p.needCardId);
    // Picks keep the version they were drafted against (need-card.md 6.1): a company save does not hide them.
    const live = need ? need.card : null;
    const changed = !!need && need.version !== p.needCardVersion;
    const mask = need ? maskFor(need.card) : (t: string) => t;
    const signalIds = new Set(card.signals.map((s) => s.id));
    const renderings = new Map(card.signals.map((s) => [s.id, s.rendering]));
    const pairIntro = introRows.find((i) => i.talentId === p.talentId) ?? null;

    const reasons = p.body.reasons.flatMap((r) => {
      const requirement = live?.requirements.find((q) => q.id === r.requirementId);
      // A reason about a signal the person has since removed, or a requirement that changed, is not shown.
      if (!live || !requirement || !signalIds.has(r.signalId)) return [];
      const sentence = requirement.postingSentence === null ? undefined : jobs.get(live.jobId)?.sentences[requirement.postingSentence];
      return [
        {
          text: mask(r.text),
          requirementText: mask(requirement.text),
          signalId: r.signalId,
          rendering: renderings.get(r.signalId) ?? null,
          postingSentence: sentence ? mask(sentence) : null,
        },
      ];
    });
    const mentioned = new Set(p.body.notMentioned);
    // After a company save, requirements added since drafting are unknown to this pick: leave them out.
    const known = new Set([...p.body.notMentioned, ...p.body.reasons.map((r) => r.requirementId)]);
    const visible = live ? live.requirements.filter((r) => !changed || known.has(r.id)) : [];
    const requirements = live
      ? visible.map((r) => ({ id: r.id, text: mask(r.text), mentioned: !mentioned.has(r.id) }))
      : [];
    const notMentioned = live
      ? mustFirst(visible)
          .filter((r) => mentioned.has(r.id))
          .map((r) => ({ text: mask(r.text), statutory: r.statutory !== "none" }))
      : [];

    let revealed: CompanyPick["revealed"] = null;
    if (pairIntro?.status === "accepted") {
      const full = await safe(() => cardForCompanyRevealed(db, p.talentId));
      if (full) {
        revealed = {
          name: full.identity.displayName,
          contact: full.identity.contact,
          signals: full.signals.map((s) => ({ id: s.id, phrase: s.phrase, phraseOwn: s.phraseOwn, quotes: s.quotes })),
        };
      }
    }

    const entry: CompanyPick = {
      id: p.id,
      card,
      askedByPerson: p.origin === "talent_request",
      reasons,
      requirements,
      notMentioned,
      canAsk: !pairIntro || REASKABLE.includes(pairIntro.status),
      intro: pairIntro
        ? { id: pairIntro.id, status: pairIntro.status, expiresAt: pairIntro.expiresAt ? pairIntro.expiresAt.toISOString() : null }
        : null,
      revealed,
    };
    picksByNeed.set(p.needCardId, [...(picksByNeed.get(p.needCardId) ?? []), entry]);
  }

  const groupIds = [...new Set([...needs.keys(), ...picksByNeed.keys(), ...latest.emptyNeeds])].sort();
  return {
    demo: true,
    company: { displayName: co.displayName },
    needs: needList,
    digest: {
      date: latest.date,
      groups: groupIds.map((id) => {
        const need = needs.get(id);
        return {
          needCardId: id,
          title: need ? maskFor(need.card)(need.card.title) : id,
          nobodyRelates: latest.emptyNeeds.includes(id),
          picks: picksByNeed.get(id) ?? [],
        };
      }),
    },
  };
}
