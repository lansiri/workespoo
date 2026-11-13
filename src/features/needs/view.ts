import { eq } from "drizzle-orm";
import type {
  NeedCard,
  NeedCardStatus,
  QuestionAnswer,
  QuestionType,
  Requirement,
  RequirementCategory,
  RequirementKind,
  Statutory,
} from "@/contracts";
import type { Db } from "@/db/client";
import { company as companyTable, job as jobTable } from "@/db/schema";
import { fmt } from "@/lib/i18n";
import { MAX_QUESTIONS_SHOWN, QUESTION_MIN_RELEVANT } from "./constants";
import { employerTerms, maskEmployer } from "./mask";
import type { NeedMessagesText } from "./messages";
import { needCardCreatedAt } from "./store";

// ---------- which questions are shown (need-card.md 4.2.3, 4.2.5) ----------

/**
 * Ids of the requirements whose question is shown. An answered question always stays. An
 * open one is shown when the relevant pool is big enough to say anything and a hard filter
 * would set someone aside (it is never shown for a whole-pool count, where the exclusion
 * number is absent), and only the {@link MAX_QUESTIONS_SHOWN} with the largest exclusion
 * count survive. That orders requirements, never people.
 */
export function visibleQuestionIds(card: Pick<NeedCard, "requirements">): Set<string> {
  const shown = new Set<string>();
  const open: Array<{ id: string; exclude: number; order: number }> = [];
  card.requirements.forEach((r, order) => {
    if (!r.question) return;
    if (r.question.answer) {
      shown.add(r.id);
      return;
    }
    if (r.statutory !== "none") return;
    const pool = r.pool;
    if (!pool || pool.scope !== "relevant" || pool.relevant < QUESTION_MIN_RELEVANT) return;
    if (pool.hardFilterWouldExclude === null || pool.hardFilterWouldExclude === 0) return;
    open.push({ id: r.id, exclude: pool.hardFilterWouldExclude, order });
  });
  open.sort((a, b) => b.exclude - a.exclude || a.order - b.order);
  for (const o of open.slice(0, MAX_QUESTIONS_SHOWN)) shown.add(o.id);
  return shown;
}

// ---------- the company's payload (hidden means absent) ----------

export type CompanyPoolView = {
  scope: "relevant" | "whole_pool";
  relevant: number;
  speakTo: number;
  /** Absent for statutory requirements and for whole-pool counts. */
  hardFilterWouldExclude?: number;
  /** Absent except for languages. */
  selfDeclaredOnly?: number;
  computedAt: string;
};

export type CompanyRequirementView = {
  id: string;
  text: string;
  kind: RequirementKind;
  category: RequirementCategory;
  source: "agent" | "company";
  languageCode: string | null;
  statutory: Statutory;
  /** The posting sentence this came from, with the employer's name replaced when masked. */
  postingSentence: string | null;
  /** Absent when the question is not shown. */
  question?: { type: QuestionType; text: string; why: string; answer: QuestionAnswer | null };
  /** Absent when nothing is counted. */
  pool?: CompanyPoolView;
};

export type CompanyNeedView = {
  id: string;
  version: number;
  status: NeedCardStatus;
  title: string;
  summary: string;
  draftedAt: string | null;
  confirmedAt: string | null;
  company: { displayName: string; masked: boolean };
  requirements: CompanyRequirementView[];
};

function poolView(r: Requirement): CompanyPoolView | undefined {
  const p = r.pool;
  if (!p) return undefined;
  const view: CompanyPoolView = { scope: p.scope, relevant: p.relevant, speakTo: p.speakTo, computedAt: p.computedAt };
  if (r.statutory === "none" && p.hardFilterWouldExclude !== null) view.hardFilterWouldExclude = p.hardFilterWouldExclude;
  if (p.selfDeclaredOnly !== null) view.selfDeclaredOnly = p.selfDeclaredOnly;
  return view;
}

/**
 * Build what a company is allowed to see of its Need Card. While the company is masked, the
 * real employer name (from the company row and from the posting) is replaced by "the company"
 * in every text, and neither id of the posting nor of the company is sent.
 */
export async function buildCompanyView(
  db: Db,
  card: NeedCard,
  co: { displayName: string; masked: boolean; realName: string | null },
): Promise<CompanyNeedView> {
  const [jobRow] = await db
    .select({ sentences: jobTable.sentences, employerName: jobTable.employerName })
    .from(jobTable)
    .where(eq(jobTable.id, card.jobId));
  const sentences = jobRow?.sentences ?? [];
  const terms = co.masked ? employerTerms(co.realName, jobRow?.employerName) : [];
  const mask = (text: string) => (terms.length ? maskEmployer(text, terms) : text);
  const shown = visibleQuestionIds(card);
  const createdAt = await needCardCreatedAt(db, card.id);

  return {
    id: card.id,
    version: card.version,
    status: card.status,
    title: mask(card.title),
    summary: mask(card.summary),
    draftedAt: createdAt ? createdAt.toISOString() : null,
    confirmedAt: card.confirmedAt,
    company: { displayName: co.displayName, masked: co.masked },
    requirements: card.requirements.map((r) => {
      const view: CompanyRequirementView = {
        id: r.id,
        text: mask(r.text),
        kind: r.kind,
        category: r.category,
        source: r.source,
        languageCode: r.languageCode,
        statutory: r.statutory,
        postingSentence: r.postingSentence === null ? null : mask(sentences[r.postingSentence] ?? ""),
      };
      if (r.question && shown.has(r.id)) {
        view.question = {
          type: r.question.type,
          text: mask(r.question.text),
          why: mask(r.question.why),
          answer: r.question.answer,
        };
      }
      const pool = poolView(r);
      if (pool) view.pool = pool;
      return view;
    }),
  };
}

// ---------- pool evidence wording (need-card.md 5.4, exact) ----------

export type TextPart = { text: string; strong: boolean };

/** Split a template on `**` into plain and strong parts, after filling its placeholders. */
export function strongParts(template: string, vars: Record<string, string | number>): TextPart[] {
  return fmt(template, vars)
    .split("**")
    .map((text, i) => ({ text, strong: i % 2 === 1 }))
    .filter((p) => p.text.length > 0);
}

/** The display text of a requirement's pool evidence, in the person's interface language. */
export function poolEvidenceParts(
  m: NeedMessagesText,
  r: Pick<CompanyRequirementView, "statutory" | "category" | "pool">,
): TextPart[] {
  const p = r.pool;
  if (!p) return [];
  if (p.scope === "whole_pool") {
    if (p.relevant === 0) return [{ text: m.poolEmpty, strong: false }];
    return strongParts(m.poolWholePool, { relevant: p.relevant, speakTo: p.speakTo });
  }
  if (r.statutory !== "none") return strongParts(m.poolStatutory, { speakTo: p.speakTo, relevant: p.relevant });
  const parts = strongParts(m.poolNormal, {
    speakTo: p.speakTo,
    relevant: p.relevant,
    exclude: p.hardFilterWouldExclude ?? 0,
  });
  if (r.category === "language" && p.selfDeclaredOnly !== undefined) {
    parts.push({ text: ` ${fmt(m.poolSelfDeclared, { selfDeclaredOnly: p.selfDeclaredOnly })}`, strong: false });
  }
  return parts;
}

// ---------- access ----------

export type CompanyRow = { id: string; displayName: string; masked: boolean; realName: string | null };

export async function loadCompany(db: Db, companyId: string): Promise<CompanyRow | null> {
  const [row] = await db
    .select({
      id: companyTable.id,
      displayName: companyTable.displayName,
      masked: companyTable.masked,
      realName: companyTable.realName,
    })
    .from(companyTable)
    .where(eq(companyTable.id, companyId));
  return row ?? null;
}
