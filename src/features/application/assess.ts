import { and, eq } from "drizzle-orm";
import {
  APPLICATION_RUBRIC_VERSION,
  ApplicationAssessOutput,
  parseEvidenceLabel,
  type ApplicationAssessment,
  type ApplicationPlan,
  type ApplicationTurn,
  type EvidenceRef,
  type LocalText,
  type RequirementRating,
} from "@/contracts";
import type { Db } from "@/db/client";
import { application, applicationTurn, company, job, needCard } from "@/db/schema";
import { audit } from "@/lib/audit";
import { chatJson } from "@/lib/llm";
import { findBannedEvaluative, findProtectedCard, findReasonJudgement } from "@/lib/lexicon";
import { employerTerms, maskEmployer } from "@/lib/mask";
import { splitSentences } from "@/lib/sentences";
import { LEFT_OUT, answersAbout, questionsAbout, toApplicationTurn } from "./assess-turns";
import { CODE_REASONS, CODE_SUMMARY, NOT_ANSWERED_REASON } from "./levels";
import { assessMessages } from "./prompts-assess";

/**
 * The assessment of one application (docs/specs/job-interview.md section 6): what the model
 * is given, the call, and the checks that decide what is stored. The model never sees who it
 * is reading, and nothing it returns is stored unchecked.
 */

/** A sentence the assessor may cite, or one that was left out because it carries a protected detail. */
export interface AssessorSentence {
  /** `T<turnIndex>.S<n>`, n 1-based. */
  label: string;
  turnIndex: number;
  sentence: number;
  /** The sentence, or `[left out]`. */
  text: string;
  leftOut: boolean;
}

/** Exactly what the assessor reads about the person: questions and labelled answer sentences per requirement. No name, nickname, language field or input mode. */
export interface AssessorInput {
  jobTitle: string;
  requirements: Array<{
    /** R1, R2, ... in the plan's order. */
    label: string;
    requirementId: string;
    text: string;
    kind: "must" | "nice";
    /** The ad's sentence this requirement came from, employer masked, or null. */
    adSentence: string | null;
    /** The interviewer's questions about it, in order. */
    questions: string[];
    /** The person's answer sentences about it. Empty when skipped, unanswered or removed. */
    sentences: AssessorSentence[];
  }>;
}

/**
 * Builds the assessor's input from the stored plan and turns. Removed answers contribute
 * nothing; a sentence in which the protected-detail check finds something becomes
 * `[left out]` and keeps its label so numbering stays true. Pure.
 */
export function buildAssessorInput(args: {
  jobTitle: string;
  plan: ApplicationPlan;
  turns: ApplicationTurn[];
  /** Posting sentences, already masked, indexed as `Job.sentences`. */
  adSentences: string[];
}): AssessorInput {
  const { plan, turns } = args;
  return {
    jobTitle: args.jobTitle,
    requirements: plan.requirements.map((req, i) => {
      const sentences: AssessorSentence[] = [];
      for (const turn of answersAbout(turns, req.requirementId)) {
        turn.sentences.forEach((text, k) => {
          const leftOut = findProtectedCard(text).length > 0;
          sentences.push({
            label: `T${turn.index}.S${k + 1}`,
            turnIndex: turn.index,
            sentence: k + 1,
            text: leftOut ? LEFT_OUT : text,
            leftOut,
          });
        });
      }
      return {
        label: `R${i + 1}`,
        requirementId: req.requirementId,
        text: req.text,
        kind: req.kind,
        adSentence: req.postingSentence === null ? null : (args.adSentences[req.postingSentence] ?? null),
        questions: questionsAbout(plan, turns, req.requirementId),
        sentences,
      };
    }),
  };
}

const LANGS = ["en", "fi", "sv"] as const;

/** True when any text fails a check: it is empty, judges, names a protected detail or names the employer. */
function textFails(text: string, terms: readonly string[]): boolean {
  if (text.trim().length === 0) return true;
  if (findBannedEvaluative(text).length > 0) return true;
  if (findProtectedCard(text).length > 0) return true;
  if (findReasonJudgement(text).length > 0) return true;
  return terms.length > 0 && maskEmployer(text, terms) !== text;
}

const localFails = (t: LocalText, terms: readonly string[]): boolean => LANGS.some((l) => textFails(t[l], terms));

/** Evidence labels that point at a shown, not left out sentence of this input. A range counts only when every sentence in it does. */
function resolveEvidence(labels: readonly string[], citable: ReadonlySet<string>): EvidenceRef[] {
  const refs: EvidenceRef[] = [];
  const seen = new Set<string>();
  for (const label of labels) {
    const ref = parseEvidenceLabel(label);
    if (!ref) continue;
    let ok = true;
    for (let s = ref.sentenceFrom; s <= ref.sentenceTo; s++) if (!citable.has(`${ref.turnIndex}:${s}`)) ok = false;
    const key = `${ref.turnIndex}:${ref.sentenceFrom}:${ref.sentenceTo}`;
    if (!ok || seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  return refs.slice(0, 4);
}

/**
 * Turns the model's output into the stored assessment, applying every check of section 6:
 * unknown requirements dropped, levels clamped, references resolved against `input` (a level
 * above 0 without a valid reference becomes 0), reasons that judge the person, name a
 * protected detail or name the employer replaced by the code's sentence for that level,
 * requirements the model left out or that have no answer set to level 0. One rating per
 * covered requirement, in the plan's order. `output` null means the call failed: every
 * requirement with answers then gets no rating and the function returns null. Pure.
 */
export function checkAssessment(args: {
  input: AssessorInput;
  output: unknown;
  employerTerms: readonly string[];
  now: Date;
}): ApplicationAssessment | null {
  if (args.output === null || args.output === undefined) return null;
  const parsed = ApplicationAssessOutput.safeParse(args.output);
  if (!parsed.success) return null;
  const out = parsed.data;
  const terms = args.employerTerms;

  const citable = new Set<string>();
  for (const r of args.input.requirements) for (const s of r.sentences) if (!s.leftOut) citable.add(`${s.turnIndex}:${s.sentence}`);

  const ratings: RequirementRating[] = args.input.requirements.map((req) => {
    if (req.sentences.length === 0) {
      return { requirementId: req.requirementId, level: 0, evidence: [], reason: NOT_ANSWERED_REASON, wording: "code" };
    }
    const given = out.ratings.find((r) => r.requirement === req.label);
    if (!given) {
      return { requirementId: req.requirementId, level: 0, evidence: [], reason: CODE_REASONS[0], wording: "code" };
    }
    const evidence = given.level > 0 ? resolveEvidence(given.evidence, citable) : [];
    const downgraded = given.level > 0 && evidence.length === 0;
    const level = downgraded ? 0 : Math.min(3, Math.max(0, Math.trunc(given.level)));
    const reason: LocalText = { en: given.reason_en.trim(), fi: given.reason_fi.trim(), sv: given.reason_sv.trim() };
    if (downgraded || localFails(reason, terms)) {
      return { requirementId: req.requirementId, level, evidence, reason: CODE_REASONS[level], wording: "code" };
    }
    return { requirementId: req.requirementId, level, evidence, reason, wording: "model" };
  });

  let summary: LocalText = { en: out.summary_en.trim(), fi: out.summary_fi.trim(), sv: out.summary_sv.trim() };
  const tooLong = LANGS.some((l) => splitSentences(summary[l]).length > 2);
  if (tooLong || localFails(summary, terms)) {
    const n = String(ratings.filter((r) => r.level >= 2).length);
    const m = String(ratings.length);
    summary = {
      en: CODE_SUMMARY.en.replace("{n}", n).replace("{m}", m),
      fi: CODE_SUMMARY.fi.replace("{n}", n).replace("{m}", m),
      sv: CODE_SUMMARY.sv.replace("{n}", n).replace("{m}", m),
    };
  }

  return { rubricVersion: APPLICATION_RUBRIC_VERSION, ratings, summary, assessedAt: args.now.toISOString() };
}

/**
 * The body of the `application.assess` job: loads a `submitted` application, builds the
 * input, calls the model (`analyst`, purpose `application.assess`, one attempt of up to
 * 75 s), checks the output, stores the assessment, sets status `assessed` and audits
 * `application.assessed`. An application that is already assessed, or no longer exists, is
 * left alone. Throws when the model did not deliver, so the queue tries again.
 */
export async function assessApplication(db: Db, applicationId: string, options?: { now?: () => Date }): Promise<ApplicationAssessment | null> {
  const [app] = await db.select().from(application).where(eq(application.id, applicationId)).limit(1);
  if (!app) return null;
  if (app.status === "assessed") return app.assessment;
  if (app.status !== "submitted") return null;

  const [row] = await db
    .select({ job, company, card: needCard.body })
    .from(job)
    .innerJoin(company, eq(company.id, app.companyId))
    .leftJoin(needCard, eq(needCard.jobId, job.id))
    .where(eq(job.id, app.jobId))
    .limit(1);
  if (!row) return null;

  const terms = row.company.masked ? employerTerms(row.company.realName, row.job.employerName) : [];
  const mask = (text: string): string => (terms.length > 0 ? maskEmployer(text, terms) : text);
  const turns = (await db.select().from(applicationTurn).where(eq(applicationTurn.applicationId, app.id)).orderBy(applicationTurn.index)).map(toApplicationTurn);
  const input = buildAssessorInput({
    jobTitle: mask(row.card?.title ?? row.job.title),
    plan: app.plan,
    turns,
    adSentences: row.job.sentences.map(mask),
  });

  let output: unknown = { ratings: [], summary_en: "", summary_fi: "", summary_sv: "" };
  if (input.requirements.some((r) => r.sentences.length > 0)) {
    const result = await chatJson({
      role: "analyst",
      purpose: "application.assess",
      messages: assessMessages(input),
      temperature: 0,
      maxTokens: 1800,
      timeoutMs: 75_000,
      deadlineMs: 75_000,
      db,
      schema: ApplicationAssessOutput,
    });
    if (result.data === null) throw new Error(`The assessment call failed: ${result.error}`);
    output = result.data;
  }

  const now = (options?.now ?? (() => new Date()))();
  const assessment = checkAssessment({ input, output, employerTerms: terms, now });
  if (!assessment) throw new Error("The assessment could not be checked");

  const stored = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(application)
      .set({ assessment, status: "assessed", assessedAt: now })
      .where(and(eq(application.id, app.id), eq(application.status, "submitted")))
      .returning({ id: application.id });
    if (!updated) return false;
    await audit(tx, {
      actor: "system",
      action: "application.assessed",
      subjectType: "application",
      subjectId: app.id,
      detail: { talentId: app.talentId, jobId: app.jobId, rubricVersion: assessment.rubricVersion },
    });
    return true;
  });
  return stored ? assessment : null;
}
