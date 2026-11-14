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
import { GENDERED_PRONOUNS, findBannedEvaluative, findReasonJudgement } from "@/lib/lexicon";
import { employerTerms, maskEmployer } from "@/lib/mask";
import { splitSentences } from "@/lib/sentences";
import { findProtectedWritten, screenAnswerSentence } from "./assess-protected";
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
          // Left out whole when the person says something protected about themselves; a
          // country or nationality word is hidden and the sentence stays (assess-protected.ts).
          const screened = screenAnswerSentence(text);
          sentences.push({
            label: `T${turn.index}.S${k + 1}`,
            turnIndex: turn.index,
            sentence: k + 1,
            text: screened.leftOut ? LEFT_OUT : screened.text,
            leftOut: screened.leftOut,
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

const SWEDISH_PRONOUNS = /(?<![\p{L}\p{N}])(?:han|hon|hans|henne|honom)(?![\p{L}\p{N}])/iu;
/**
 * Words the prompt bans because they blame the answer or the person: weak, poor, lacks,
 * fails, only, and their Finnish and Swedish forms. Verb forms, not stems: "puuttuvat
 * lukemat" (missing readings) describes the work, "vastauksesta puuttuu" blames the answer.
 */
const BLAME = /(?<![\p{L}\p{N}])(?:weak|poor|lacks?|lacking|fails?|failed|only|heikk\p{L}*|huono\p{L}*|puuttuu|puutteelli\p{L}*|epäonnistu\p{L}*|vain|ainoastaan|svag\p{L}*|dålig\p{L}*|saknar|saknas|misslyck\p{L}*|bara|endast)(?![\p{L}\p{N}])/iu;
const QUOTE_MARKS = /["“”„«»]/u;
/** A reason is one sentence of about 30 words and a summary two: longer than this is not what was asked for, and the stored text holds 500. */
const MAX_WRITTEN = 420;
/** Copied wording: this many of the person's words in a row, whatever they are. */
const RUN = 8;
/** Copied speech: this many in a row when the person speaks of themselves in them ("I rebuilt the nightly import"). */
const OWN_RUN = 5;
const FIRST_PERSON = new Set(["i", "my", "me", "we", "our", "myself", "minä", "minun", "minulla", "me", "meidän", "jag", "min", "mitt", "mina", "vi", "vår", "vårt"]);

const words = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * The runs of the person's own words that a reason must not repeat: every run of RUN words,
 * and every run of OWN_RUN words in which the person speaks of themselves. A description of
 * evidence shares shorter stretches with the answer by nature ("English technical
 * documentation"); a longer one, or the person's "I ...", is their words passed off as ours.
 */
export function answerRunsOf(input: AssessorInput): Set<string> {
  const runs = new Set<string>();
  for (const r of input.requirements) {
    for (const s of r.sentences) {
      if (s.leftOut) continue;
      const w = words(s.text);
      for (let i = 0; i + RUN <= w.length; i++) runs.add(w.slice(i, i + RUN).join(" "));
      for (let i = 0; i + OWN_RUN <= w.length; i++) {
        const run = w.slice(i, i + OWN_RUN);
        if (run.some((x) => FIRST_PERSON.has(x))) runs.add(run.join(" "));
      }
    }
  }
  return runs;
}

/** True when the text repeats one of those runs. */
function copiesAnswer(text: string, runs: ReadonlySet<string>): boolean {
  const w = words(text);
  for (const n of [OWN_RUN, RUN]) {
    for (let i = 0; i + n <= w.length; i++) if (runs.has(w.slice(i, i + n).join(" "))) return true;
  }
  return false;
}

/**
 * Words from the shared lists that are ordinary work vocabulary in a description of evidence
 * ("the stock counts matched", "the parts fit", "the top shelf", "täydelliset lukemat" for
 * complete readings, "mentored junior developers"): they judge a person only in a reason for a
 * pick or in something the interviewer says, which this is not.
 */
const WORK_WORDS = new Set(["match", "matches", "matched", "fit", "fits", "top", "score", "scores", "percent", "täydelli", "senior", "junior"]);
/**
 * How the person came across, which a reason must never mention: the way they talk, whether
 * they spoke or typed, and the names for the person that hint at either. Verbs such as "speak"
 * and "translate" are not here: speaking Finnish with customers is the evidence itself.
 */
const MANNER = /(?<![\p{L}\p{N}])(?:accent|fluen|pronunciation|typed|typing|the speaker|the respondent|the candidate|the applicant|the interviewee|vastaaja|hakija|puhuja|svarande|sökande|talaren)/iu;
/** A requirement's label is for the model only: nobody who reads a reason knows what R2 is. */
const REQUIREMENT_LABEL = /(?<![\p{L}\p{N}])R\d+(?![\p{L}\p{N}])/u;

/**
 * Why a text the model wrote is not used, as the name of the check, or null when it passes:
 * it is empty, judges, blames, quotes the person, names a protected detail, a gender, how the
 * person came across, a requirement's label or the employer.
 */
export function writtenProblem(text: string, terms: readonly string[], runs: ReadonlySet<string>): string | null {
  if (text.trim().length === 0) return "empty";
  if (text.length > MAX_WRITTEN) return "long";
  const judged = findReasonJudgement(text, { pronouns: true }).filter((hit) => !WORK_WORDS.has(hit));
  // About the person.
  if (findProtectedWritten(text).length > 0) return "protected";
  if (SWEDISH_PRONOUNS.test(text) || judged.some((hit) => GENDERED.has(hit))) return "pronoun";
  if (MANNER.test(text)) return "manner";
  if (terms.length > 0 && maskEmployer(text, terms) !== text) return "employer";
  // A judgement.
  if (findBannedEvaluative(text).some((hit) => !WORK_WORDS.has(hit))) return "evaluative";
  if (judged.length > 0) return "judgement";
  if (BLAME.test(text)) return "blame";
  // Wording only.
  if (QUOTE_MARKS.test(text)) return "quote";
  if (REQUIREMENT_LABEL.test(text)) return "label";
  return copiesAnswer(text, runs) ? "copied" : null;
}

const GENDERED: ReadonlySet<string> = new Set(GENDERED_PRONOUNS);

/**
 * Checks that find something about the person in the text: a protected detail, a gender, how
 * they came across, the employer's name, or a judgement of them. When one of the three
 * languages fails such a check, all three are replaced: the word lists are not equally
 * complete in every language ("Hyvä." passes where "A strong answer." does not), and the
 * three say the same thing. The other checks are about wording only (empty, a quotation
 * mark, a requirement's label, the person's words repeated, too long) and replace just the
 * language they fail in.
 */
const ABOUT_THE_PERSON_CHECKS = new Set(["protected", "pronoun", "manner", "employer", "evaluative", "judgement", "blame"]);

/**
 * Local diagnosis only (`ASSESS_DEBUG=1`): which check replaced a text. The name of the check
 * is printed, never the text, since the text may hold exactly what must not be shown.
 */
function noteReplaced(where: string, lang: string, check: string): void {
  if (process.env.ASSESS_DEBUG === "1") console.warn(`[assess] ${where} (${lang}) replaced by the code's sentence: ${check}`);
}

/** The model's text in three languages after the checks, with the code's sentence wherever a check failed. `wording` is "code" only when nothing of the model's is left. */
function checkedText(given: LocalText, fallback: LocalText, terms: readonly string[], runs: ReadonlySet<string>, where: string, extra?: (text: string) => string | null): { text: LocalText; wording: "model" | "code" } {
  const problems = LANGS.map((l) => writtenProblem(given[l], terms, runs) ?? extra?.(given[l]) ?? null);
  problems.forEach((p, i) => {
    if (p !== null) noteReplaced(where, LANGS[i]!, p);
  });
  if (problems.some((p) => p !== null && ABOUT_THE_PERSON_CHECKS.has(p))) return { text: fallback, wording: "code" };
  const text = { en: problems[0] === null ? given.en : fallback.en, fi: problems[1] === null ? given.fi : fallback.fi, sv: problems[2] === null ? given.sv : fallback.sv };
  return { text, wording: problems.every((p) => p !== null) ? "code" : "model" };
}

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
 * protected detail or name the employer replaced by the code's sentence for that level (in
 * all three languages when the failed check is about the person, else in the language that failed),
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
  const runs = answerRunsOf(args.input);

  const citable = new Set<string>();
  for (const r of args.input.requirements) for (const s of r.sentences) if (!s.leftOut) citable.add(`${s.turnIndex}:${s.sentence}`);

  let matched = 0;
  const ratings: RequirementRating[] = args.input.requirements.map((req) => {
    if (req.sentences.length === 0) {
      return { requirementId: req.requirementId, level: 0, evidence: [], reason: NOT_ANSWERED_REASON, wording: "code" };
    }
    const given = out.ratings.find((r) => r.requirement === req.label);
    if (given) matched++;
    if (!given) {
      return { requirementId: req.requirementId, level: 0, evidence: [], reason: CODE_REASONS[0], wording: "code" };
    }
    const evidence = given.level > 0 ? resolveEvidence(given.evidence, citable) : [];
    const downgraded = given.level > 0 && evidence.length === 0;
    const level = downgraded ? 0 : Math.min(3, Math.max(0, Math.trunc(given.level)));
    if (downgraded) return { requirementId: req.requirementId, level, evidence, reason: CODE_REASONS[level], wording: "code" };
    const written: LocalText = { en: given.reason_en.trim(), fi: given.reason_fi.trim(), sv: given.reason_sv.trim() };
    const reason = checkedText(written, CODE_REASONS[level], terms, runs, req.label);
    return { requirementId: req.requirementId, level, evidence, reason: reason.text, wording: reason.wording };
  });

  // Output that matches none of the answered requirements is a failed call, not a rating.
  if (matched === 0 && args.input.requirements.some((r) => r.sentences.length > 0)) return null;

  const n = String(ratings.filter((r) => r.level >= 2).length);
  const m = String(ratings.length);
  const codeSummary: LocalText = {
    en: CODE_SUMMARY.en.replace("{n}", n).replace("{m}", m),
    fi: CODE_SUMMARY.fi.replace("{n}", n).replace("{m}", m),
    sv: CODE_SUMMARY.sv.replace("{n}", n).replace("{m}", m),
  };
  const summary = checkedText(
    { en: out.summary_en.trim(), fi: out.summary_fi.trim(), sv: out.summary_sv.trim() },
    codeSummary,
    terms,
    runs,
    "summary",
    (text) => (splitSentences(text).length > 2 ? "long" : null),
  ).text;

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

/**
 * Starts the rating now, in this process, without making the caller wait: the person who just
 * sent an application sees their ratings in the time one model call takes, whatever the
 * worker is busy with. A failure is logged and left to the queued job, which tries again.
 */
export function assessSoon(db: Db, applicationId: string): void {
  void assessApplication(db, applicationId).catch((error: unknown) => {
    console.error("[application] the first rating attempt failed; the queued job will try again:", error instanceof Error ? error.message : String(error));
  });
}
