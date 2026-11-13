import { createHash } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  NeedCard,
  NeedCardDraftOutput,
  type EscoRef,
  type Job,
  type Requirement,
  type RequirementQuestion,
} from "@/contracts";
import type { Db } from "@/db/client";
import { appMeta, company, escoConcept, escoOccupationSkill, jobSkill, needCard } from "@/db/schema";
import { audit, listAudit } from "@/lib/audit";
import { employerTerms, maskEmployer } from "@/lib/mask";
import { HttpError } from "@/lib/http";
import { escoByUris, escoCandidates } from "@/lib/esco";
import { newId } from "@/lib/ids";
import { chatJson } from "@/lib/llm";
import { enqueue } from "@/lib/queue";
import { getJob } from "@/features/jobs";
import {
  ESCO_FALLBACK_MARGIN,
  ESCO_FALLBACK_MIN_SIMILARITY,
  ESCO_PROMPT_MIN_SIMILARITY,
  MAX_ESCO_CANDIDATES,
  MAX_PROMPT_SENTENCES,
  MAX_REQUIREMENTS,
  QUESTION_TEXT_MAX,
  REQUIREMENT_TEXT_MAX,
  SALIENT_PHRASE_MAX_CHARS,
  SALIENT_PHRASE_MAX_SENTENCES,
  TITLE_MAX,
  TRIGRAM_CANDIDATE_RESERVE,
  WHY_MAX,
} from "./constants";
import { recomputePoolEvidence } from "./pool";
import { buildDraftMessages, type EscoPromptCandidate } from "./prompt";
import { classifyStatutory, decideQuestion, DEFAULT_WHY, isWorkPermitText, textDescribesPerson } from "./rules";
import { getNeedCardForJob, saveNeedCard } from "./store";

// ---------- ESCO candidates for the prompt ----------

/** The prompt's `K1..Kn` list: the posting's own skills, its occupations' skills, then phrase matches. */
export async function buildEscoCandidates(db: Db, job: Job): Promise<EscoPromptCandidate[]> {
  const out: EscoPromptCandidate[] = [];
  const seen = new Set<string>();
  const add = (ref: EscoRef | undefined) => {
    if (!ref || seen.has(ref.uri) || out.length >= MAX_ESCO_CANDIDATES) return;
    seen.add(ref.uri);
    out.push({ uri: ref.uri, labelEn: ref.labelEn, labelFi: ref.labelFi });
  };
  const ownLimit = MAX_ESCO_CANDIDATES - TRIGRAM_CANDIDATE_RESERVE;

  // a. the posting's own skill URIs
  const own = await escoByUris(db, job.escoSkillUris);
  for (const uri of job.escoSkillUris) {
    if (out.length >= ownLimit) break;
    add(own.get(uri));
  }

  // b. essential, then optional skills of the posting's occupations
  if (job.escoOccupationUris.length > 0 && out.length < ownLimit) {
    const rows = await db
      .select({
        uri: escoConcept.uri,
        labelEn: escoConcept.labelEn,
        labelFi: escoConcept.labelFi,
        relation: escoOccupationSkill.relation,
      })
      .from(escoOccupationSkill)
      .innerJoin(escoConcept, eq(escoConcept.uri, escoOccupationSkill.skillUri))
      .where(and(inArray(escoOccupationSkill.occupationUri, job.escoOccupationUris), eq(escoConcept.retired, false)))
      .orderBy(
        sql`CASE ${escoOccupationSkill.relation} WHEN 'essential' THEN 0 ELSE 1 END`,
        asc(escoConcept.labelEn),
        asc(escoConcept.uri),
      )
      .limit(MAX_ESCO_CANDIDATES * 3);
    for (const r of rows) {
      if (out.length >= ownLimit) break;
      add(r);
    }
  }

  // c. trigram candidates for short, list-like posting sentences
  if (out.length < MAX_ESCO_CANDIDATES) {
    const phrases = job.sentences
      .slice(0, MAX_PROMPT_SENTENCES)
      .filter((s) => s.length >= 3 && s.length <= SALIENT_PHRASE_MAX_CHARS && !s.endsWith(":"))
      .slice(0, SALIENT_PHRASE_MAX_SENTENCES);
    for (const phrase of phrases) {
      if (out.length >= MAX_ESCO_CANDIDATES) break;
      const [best] = await escoCandidates(db, phrase, { type: "skill", limit: 1 });
      if (best && best.similarity >= ESCO_PROMPT_MIN_SIMILARITY) add(best);
    }
  }
  return out;
}

/** Trigram fallback for a skill or experience requirement with no `K` id (need-card.md 3.4.3). */
async function fallbackEsco(db: Db, text: string): Promise<string[]> {
  const [best, runnerUp] = await escoCandidates(db, text, { type: "skill", limit: 2 });
  if (!best || best.similarity < ESCO_FALLBACK_MIN_SIMILARITY) return [];
  if (runnerUp && best.similarity - runnerUp.similarity < ESCO_FALLBACK_MARGIN) return [];
  return [best.uri];
}
export { fallbackEsco as escoFallbackForRequirement };

// ---------- validation of the model output (need-card.md 7) ----------

export type ValidatedDraft = {
  title: string;
  summary: string;
  requirements: Requirement[];
  droppedSentences: number[];
  /** Requirements dropped because their text or cited sentence asks for a protected characteristic. */
  droppedProtected: number;
};

/** Total budget for the draft call (analyst and bulk alike). */
export const DRAFT_DEADLINE_MS = 90_000;
/** Reasoning counts toward the limit; the gateway default of 800 truncates the card (NC-2). */
export const DRAFT_MAX_TOKENS = 4000;

/**
 * Safeguard for a model that writes "" or "Finnish" in `language`, or 3.5 in `years` (NC-1):
 * `language` becomes null unless two lower-case letters, `years` null unless an integer.
 */
const SUMMARY_MAX = 300;
const DANGLING = /[\s,;:–—-]+(?:and|or|with|in|of|for|to|the|a|an|as|at|on|by|including)?$/i;

/** Cut a text that is too long at a word boundary, without leaving a dangling "and" or comma. */
export function shortenAtWord(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const at = cut.lastIndexOf(" ");
  let out = (at > max * 0.5 ? cut.slice(0, at) : t.slice(0, max)).trimEnd();
  for (let i = 0; i < 3; i++) out = out.replace(DANGLING, "").trimEnd();
  return out;
}

/**
 * Repairs the small ways a model answer misses the shape, before validation, so that one long
 * requirement or one missing key does not cost the whole card (the first real run lost a card
 * to a requirement of 86 characters). Meaning is never added: texts are only shortened, lists
 * only cut (every "must" before any "nice", as rule 4 of the prompt says), unknown values set
 * to their neutral default.
 */
export function coerceDraftOutput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { requirements?: unknown }).requirements)) return raw;
  const o = raw as Record<string, unknown> & { requirements: unknown[] };
  let requirements = o.requirements.map((item) => {
    if (!item || typeof item !== "object") return item;
    const r = item as Record<string, unknown>;
    return {
      ...r,
      ...(typeof r.text === "string" ? { text: shortenAtWord(r.text, REQUIREMENT_TEXT_MAX) } : {}),
      ...(Array.isArray(r.esco) ? { esco: r.esco.filter((k): k is string => typeof k === "string" && /^K\d+$/.test(k)).slice(0, 3) } : {}),
      language: typeof r.language === "string" && /^[a-z]{2}$/.test(r.language) ? r.language : null,
      years: typeof r.years === "number" && Number.isInteger(r.years) ? r.years : null,
      ...(r.statutory === "law" || r.statutory === "none" ? {} : { statutory: "none" }),
    };
  });
  if (requirements.length > MAX_REQUIREMENTS) {
    const isMust = (x: unknown) => !!x && typeof x === "object" && (x as { kind?: unknown }).kind === "must";
    requirements = [...requirements.filter(isMust), ...requirements.filter((x) => !isMust(x))].slice(0, MAX_REQUIREMENTS);
  }
  return {
    ...o,
    ...(typeof o.title === "string" ? { title: shortenAtWord(o.title, TITLE_MAX) } : {}),
    ...(typeof o.summary === "string" ? { summary: shortenAtWord(o.summary, SUMMARY_MAX) } : {}),
    requirements,
    ...(Array.isArray(o.dropped) ? { dropped: o.dropped.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0) } : {}),
  };
}

function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/**
 * Apply the validation, statutory and question rules to a parsed model output and turn it into
 * requirements. Pure apart from the ESCO fallback lookups.
 */
export async function validateDraft(
  db: Db,
  job: Job,
  output: NeedCardDraftOutput,
  candidates: EscoPromptCandidate[],
): Promise<ValidatedDraft> {
  const usable = Math.min(job.sentences.length, MAX_PROMPT_SENTENCES);
  const terms = employerTerms(job.employerName);
  const dropped = new Set<number>(output.dropped.filter((i) => Number.isInteger(i) && i >= 0 && i < usable));
  let droppedProtected = 0;

  type Kept = { out: NeedCardDraftOutput["requirements"][number]; index: number };
  let kept: Kept[] = [];
  output.requirements.forEach((r, index) => {
    // 1. the cited sentence must exist
    if (r.sentence < 0 || r.sentence >= usable) return;
    const sentence = job.sentences[r.sentence]!;
    // 3. protected characteristics never become requirements
    const hits = textDescribesPerson(r.text) || textDescribesPerson(sentence);
    if (hits) {
      droppedProtected++;
      dropped.add(r.sentence);
      return;
    }
    kept.push({ out: r, index });
  });

  // 5. dedupe on text (case-insensitive), or on the same ESCO set and category
  const seenText = new Set<string>();
  const seenEsco: Array<{ category: string; uris: string[] }> = [];
  const resolveUris = (r: Kept["out"]): string[] => {
    if (r.category !== "skill" && r.category !== "experience" && r.category !== "education") return [];
    const uris: string[] = [];
    for (const label of r.esco) {
      const n = Number(label.slice(1));
      const c = candidates[n - 1];
      if (c && !uris.includes(c.uri)) uris.push(c.uri);
    }
    return uris;
  };
  kept = kept.filter(({ out }) => {
    const key = out.text.trim().toLowerCase();
    if (seenText.has(key)) return false;
    const uris = resolveUris(out);
    if (uris.length > 0 && seenEsco.some((e) => e.category === out.category && sameSet(e.uris, uris))) return false;
    seenText.add(key);
    if (uris.length > 0) seenEsco.push({ category: out.category, uris });
    return true;
  });

  // cap: all must first, then nice, each in posting order (the model's order)
  if (kept.length > MAX_REQUIREMENTS) {
    const must = kept.filter((k) => k.out.kind === "must");
    const nice = kept.filter((k) => k.out.kind === "nice");
    kept = [...must, ...nice].slice(0, MAX_REQUIREMENTS);
  }
  kept.sort((a, b) => a.out.sentence - b.out.sentence || a.index - b.index);

  const requirements: Requirement[] = [];
  for (const { out } of kept) {
    const sentence = job.sentences[out.sentence]!;
    const text = clip(maskEmployer(out.text, terms), REQUIREMENT_TEXT_MAX);
    // A work-permit requirement is recorded as authorisation, whatever category the model chose.
    const category = isWorkPermitText(text) ? "authorisation" : out.category;
    let uris = category === out.category ? resolveUris(out) : [];
    if (uris.length === 0 && (category === "skill" || category === "experience")) {
      uris = await fallbackEsco(db, text);
    }
    const languageCode = category === "language" ? out.language : null;
    const statutory = classifyStatutory({
      category,
      text,
      sentence,
      modelLaw: out.statutory === "law",
      job,
    });
    const question = decideQuestion({
      category,
      kind: out.kind,
      statutory,
      text,
      sentence,
      languageCode,
      jobLang: job.lang,
      model: { years: out.years, questionType: out.questionType, question: out.question, why: out.why },
    });
    if (question) {
      question.text = maskEmployer(question.text, terms);
      question.why = maskEmployer(question.why, terms);
      // Masking can lengthen a text ("Vala" becomes "the company"); re-apply the limits.
      if (question.why.length > WHY_MAX) question.why = DEFAULT_WHY[question.type];
    }
    requirements.push({
      id: newId("req"),
      text,
      kind: out.kind,
      category,
      escoSkillUris: uris,
      postingSentence: out.sentence,
      source: "agent",
      languageCode,
      statutory,
      question: question && question.text.length > QUESTION_TEXT_MAX ? null : question,
      pool: null,
    });
  }

  return {
    title: clip(maskEmployer(output.title, terms), TITLE_MAX),
    summary: clip(maskEmployer(output.summary, terms), 300),
    requirements,
    droppedSentences: [...dropped].sort((a, b) => a - b),
    droppedProtected,
  };
}

// ---------- drafting ----------

/** Fingerprint of what the model reads, so an unchanged posting is not drafted again by the queue. */
export function postingFingerprint(job: Job): string {
  return createHash("sha256")
    .update(JSON.stringify([job.title, job.lang, job.workLanguages, job.sentences, job.escoSkillUris]))
    .digest("hex")
    .slice(0, 32);
}

const fingerprintKey = (jobId: string) => `needcard:src:${jobId}`;

/** True when a card exists for the posting and the posting has not changed since it was drafted. */
export async function isDraftCurrent(db: Db, jobId: string): Promise<boolean> {
  const job = await getJob(db, jobId);
  if (!job) return false;
  const card = await getNeedCardForJob(db, jobId);
  if (!card) return false;
  const [meta] = await db.select().from(appMeta).where(eq(appMeta.key, fingerprintKey(jobId)));
  return meta?.value === postingFingerprint(job);
}

/** Questions the company already answered stay with a requirement whose text is unchanged. */
function carryAnswers(next: Requirement[], previous: NeedCard | null): void {
  if (!previous) return;
  for (const r of next) {
    const old = previous.requirements.find(
      (o) => o.text.trim().toLowerCase() === r.text.trim().toLowerCase() && o.question?.answer,
    );
    if (old?.question) r.question = old.question as RequirementQuestion;
  }
}

/** True when the company answered a question, removed or reworded something, or confirmed the card. */
export async function hasCompanyActivity(db: Db, card: NeedCard): Promise<boolean> {
  if (card.status !== "draft") return true;
  if (card.requirements.some((r) => r.question?.answer)) return true;
  const answered = await listAudit(db, {
    subjectType: "need_card",
    subjectId: card.id,
    action: "needcard.question_answered",
    limit: 1,
  });
  return answered.length > 0;
}

/**
 * Drafts (or re-drafts) the Need Card for a posting with the analyst model and stores it.
 * `companyId` is null for a card that only explains a posting in a person's feed (role `bulk`).
 * Enqueues `matching.need_changed`.
 */
export async function draftNeedCard(db: Db, jobId: string, companyId: string | null): Promise<NeedCard> {
  const job = await getJob(db, jobId);
  if (!job) throw new Error(`draftNeedCard: unknown job ${jobId}`);
  if (companyId) {
    const [c] = await db.select({ id: company.id }).from(company).where(eq(company.id, companyId));
    if (!c) throw new Error(`draftNeedCard: unknown company ${companyId}`);
  }

  // A card the company has answered or confirmed is not drafted over: that would undo its answers.
  const existing = await getNeedCardForJob(db, jobId);
  if (existing && (await hasCompanyActivity(db, existing))) {
    throw new HttpError(409, "has_company_answers", "The company has already answered this card");
  }

  const candidates = await buildEscoCandidates(db, job);
  const role = companyId ? "analyst" : "bulk";
  const result = await chatJson({
    role,
    purpose: "needs.draft",
    db,
    temperature: 0.2,
    maxTokens: DRAFT_MAX_TOKENS,
    deadlineMs: DRAFT_DEADLINE_MS,
    messages: buildDraftMessages(job, candidates),
    schema: NeedCardDraftOutput,
    coerce: coerceDraftOutput,
  });
  if (result.data === null) throw new Error(`draftNeedCard: the model returned no valid draft (${result.error})`);

  const validated = await validateDraft(db, job, result.data, candidates);
  const card = await db.transaction(async (tx) => {
    // Read again inside the transaction: the company may have answered while the model was
    // working. Then its version stays and this draft is dropped.
    const previous = await getNeedCardForJob(tx, jobId);
    if (previous && (await hasCompanyActivity(tx, previous))) {
      throw new HttpError(409, "has_company_answers", "The company has already answered this card");
    }
    carryAnswers(validated.requirements, previous);
    const card: NeedCard = NeedCard.parse({
      id: previous?.id ?? newId("nc"),
      jobId,
      companyId: companyId ?? previous?.companyId ?? null,
      version: (previous?.version ?? 0) + 1,
      title: validated.title || job.title.slice(0, TITLE_MAX),
      summary: validated.summary,
      lang: job.lang,
      status: "draft",
      droppedSentences: validated.droppedSentences,
      requirements: validated.requirements,
      confirmedAt: null,
    });
    if (previous) {
      // Only lands if the row still has the version read above.
      await saveNeedCard(tx, card, new Date(), previous.version);
    } else {
      const inserted = await tx
        .insert(needCard)
        .values({
          id: card.id,
          jobId: card.jobId,
          companyId: card.companyId,
          version: card.version,
          body: card,
          status: card.status,
        })
        .onConflictDoNothing({ target: needCard.jobId })
        .returning({ id: needCard.id });
      // Another request drafted this posting first: keep its card, do not fail with a database error.
      if (inserted.length === 0) throw new HttpError(409, "draft_in_progress", "A card for this posting was just drafted");
    }

    // job_skill rows with origin `needcard`
    await tx.delete(jobSkill).where(and(eq(jobSkill.jobId, jobId), eq(jobSkill.origin, "needcard")));
    const uris = [...new Set(card.requirements.flatMap((r) => r.escoSkillUris))];
    if (uris.length > 0) {
      await tx
        .insert(jobSkill)
        .values(uris.map((skillUri) => ({ jobId, skillUri, origin: "needcard" as const })))
        .onConflictDoNothing();
    }

    await audit(tx, {
      actor: `agent:${role}`,
      action: "needcard.drafted",
      subjectType: "need_card",
      subjectId: card.id,
      detail: {
        jobId,
        version: card.version,
        requirements: card.requirements.length,
        questions: card.requirements.filter((r) => r.question).length,
        droppedSentences: card.droppedSentences.length,
        droppedProtected: validated.droppedProtected,
      },
    });

    // Written last: a card counts as current for this posting only once everything above is stored.
    await tx
      .insert(appMeta)
      .values({ key: fingerprintKey(jobId), value: postingFingerprint(job) })
      .onConflictDoUpdate({ target: appMeta.key, set: { value: postingFingerprint(job), updatedAt: new Date() } });
    return card;
  });

  await enqueue(
    db,
    "matching.need_changed",
    { needCardId: card.id, version: card.version },
    { dedupeKey: `matching.need_changed:${card.id}:${card.version}` },
  );
  // Counts over the whole pool until matching has written eligibility rows for this version.
  // A failure only leaves the old numbers; matching schedules needs.recompute_pool later.
  try {
    await recomputePoolEvidence(db, card.id);
  } catch (error) {
    console.error("needs.draft: pool evidence not computed", error instanceof Error ? error.message : error);
  }
  return (await getNeedCardForJob(db, jobId)) ?? card;
}
