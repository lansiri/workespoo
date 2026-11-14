/**
 * Applications for the simulated people (docs/specs/job-interview.md section 11).
 *
 * Every demo company's job is applied to by the simulated people who are eligible for it, at
 * most `MAX_JOBS_PER_PERSON` jobs per person and `MAX_APPLICANTS_PER_JOB` people per job (four on
 * the pitch company's job, so the person on stage becomes the fifth). Each goes through the
 * application feature's public functions: start with the consent, answer every question from
 * the persona sheet, send, then assess directly (no queue). A run that did not end assessed is
 * deleted and reported, never left half-done.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { ApplicationPlan } from "@/contracts";
import type { Db } from "@/db/client";
import { application, eligibility, needCard, talent } from "@/db/schema";
import type { ApplicationDeps } from "./deps";
import { answerJobQuestion } from "./job-candidate";
import type { Persona } from "./persona";
import { seededHash } from "./prng";

export const MAX_JOBS_PER_PERSON = 2;
export const MAX_APPLICANTS_PER_JOB = 5;
export const PITCH_COMPANY_NUMBER = 3;
export const PITCH_APPLICANTS = 4;
/** Safety stop: six requirements, one follow-up each, and a few repairs. */
const MAX_ANSWERS = 20;

export type ApplyCompany = { number: number; companyId: string; jobId: string; needCardId: string | null };
export type Assignment = { personaId: string; talentId: string; companyNumber: number; companyId: string; jobId: string };

/**
 * Who applies to what. Pure and the same on every run: people are put in order by a hash of
 * the persona id and the company number (never the random row id), and a person with fewer
 * applications so far goes first, so later companies are not left empty.
 */
export function chooseApplicants(
  companies: Array<{ number: number; companyId: string; jobId: string; eligible: Array<{ personaId: string; talentId: string }> }>,
): Assignment[] {
  const out: Assignment[] = [];
  const perPerson = new Map<string, number>();
  for (const c of [...companies].sort((a, b) => a.number - b.number)) {
    const cap = c.number === PITCH_COMPANY_NUMBER ? PITCH_APPLICANTS : MAX_APPLICANTS_PER_JOB;
    const ordered = [...c.eligible].sort(
      (a, b) =>
        (perPerson.get(a.personaId) ?? 0) - (perPerson.get(b.personaId) ?? 0) ||
        seededHash("apply", `${a.personaId}:${c.number}`).localeCompare(seededHash("apply", `${b.personaId}:${c.number}`)) ||
        a.personaId.localeCompare(b.personaId),
    );
    let taken = 0;
    for (const p of ordered) {
      if (taken >= cap) break;
      if ((perPerson.get(p.personaId) ?? 0) >= MAX_JOBS_PER_PERSON) continue;
      perPerson.set(p.personaId, (perPerson.get(p.personaId) ?? 0) + 1);
      out.push({ personaId: p.personaId, talentId: p.talentId, companyNumber: c.number, companyId: c.companyId, jobId: c.jobId });
      taken++;
    }
  }
  return out;
}

export type ApplicationsReport = {
  planned: number;
  assessed: number;
  failed: Array<{ personaId: string; companyNumber: number; reason: string }>;
};

export type ApplicationOptions = {
  deps: ApplicationDeps;
  /** The answer to one question. Defaults to the model-played candidate. */
  answer?: typeof answerJobQuestion;
  log?: (line: string) => void;
};

/** Read who is eligible for each company's job from the rows the seed already made. */
export async function eligiblePeople(db: Db, companies: ApplyCompany[], personas: Persona[]) {
  const out: Array<{ number: number; companyId: string; jobId: string; eligible: Array<{ personaId: string; talentId: string }> }> = [];
  for (const c of companies) {
    if (!c.needCardId) continue;
    const [need] = await db.select({ version: needCard.version, body: needCard.body }).from(needCard).where(eq(needCard.id, c.needCardId));
    // A card with no requirements gives nothing to ask about: nobody can apply to it.
    if (!need || need.body.requirements.length === 0) continue;
    const rows = await db
      .select({ talentId: eligibility.talentId, personaKey: talent.personaKey })
      .from(eligibility)
      .innerJoin(talent, eq(talent.id, eligibility.talentId))
      .where(and(eq(eligibility.needCardId, c.needCardId), eq(eligibility.needCardVersion, need.version), eq(eligibility.eligible, true), eq(talent.synthetic, true), eq(talent.inPool, true)));
    const known = new Set(personas.map((p) => p.id));
    out.push({
      number: c.number,
      companyId: c.companyId,
      jobId: c.jobId,
      eligible: rows.flatMap((r) => (r.personaKey && known.has(r.personaKey) ? [{ personaId: r.personaKey, talentId: r.talentId }] : [])),
    });
  }
  return out;
}

/** One whole simulated application. Returns the application id, or throws; the caller removes what a failure left. */
export async function runSimulatedApplication(
  db: Db,
  persona: Persona,
  a: Pick<Assignment, "talentId" | "jobId">,
  options: ApplicationOptions,
): Promise<string> {
  const { deps } = options;
  const answer = options.answer ?? answerJobQuestion;
  const started = await deps.startApplication(db, a.talentId, { jobId: a.jobId, uiLang: persona.interviewLang, consent: { assessment: true } });
  const applicationId = started.applicationId;
  try {
    const [row] = await db.select({ plan: application.plan }).from(application).where(eq(application.id, applicationId));
    const plan = row?.plan as ApplicationPlan | undefined;
    const requirementText = (id: string | null, fallback: string) => plan?.requirements.find((r) => r.requirementId === id)?.text ?? fallback;

    const said = new Map<string, string[]>();
    let last = started.opening;
    let lastAnswer = "";
    for (let answers = 0; last.kind !== "closing"; answers++) {
      if (answers >= MAX_ANSWERS) throw new Error(`the interview did not close after ${MAX_ANSWERS} answers`);
      const key = last.requirementId ?? "";
      const text =
        last.kind === "repair" && lastAnswer
          ? lastAnswer
          : await answer(db, persona, {
              requirementText: requirementText(last.requirementId, last.text),
              question: last.text,
              followUp: last.kind === "follow_up",
              earlier: said.get(key) ?? [],
            });
      lastAnswer = text;
      said.set(key, [...(said.get(key) ?? []), text]);
      let next: typeof last | null = null;
      for await (const event of deps.submitApplicationTurn(db, applicationId, { text, inputMode: persona.inputMode })) {
        if (event.type === "turn.done") next = event.turn;
        if (event.type === "error") throw new Error(`the interview engine reported an error: ${event.message}`);
      }
      if (!next) throw new Error("the interviewer never replied");
      last = next;
    }
    await deps.submitApplication(db, applicationId);
    const assessment = await deps.assessApplication(db, applicationId);
    if (!assessment) throw new Error("the model gave no assessment");
    const [done] = await db.select({ status: application.status }).from(application).where(eq(application.id, applicationId));
    if (done?.status !== "assessed") throw new Error(`the application ended as ${done?.status ?? "missing"}, not assessed`);
    return applicationId;
  } catch (error) {
    await db.delete(application).where(eq(application.id, applicationId));
    throw error;
  }
}

/** Run every chosen application one after the other (the key allows 40 requests a minute for everything). */
export async function runSimulatedApplications(
  db: Db,
  personas: Persona[],
  companies: ApplyCompany[],
  options: ApplicationOptions,
): Promise<ApplicationsReport> {
  const log = options.log ?? (() => {});
  const plan = chooseApplicants(await eligiblePeople(db, companies, personas));
  const report: ApplicationsReport = { planned: plan.length, assessed: 0, failed: [] };
  const present = new Set(
    (await db.select({ talentId: application.talentId, jobId: application.jobId }).from(application).where(inArray(application.talentId, [...plan.map((p) => p.talentId), ""]))).map((r) => `${r.talentId}:${r.jobId}`),
  );
  for (const a of plan) {
    const persona = personas.find((p) => p.id === a.personaId);
    if (!persona) continue;
    // Idempotent: an application that is already there is kept as it is.
    if (present.has(`${a.talentId}:${a.jobId}`)) {
      report.assessed++;
      continue;
    }
    try {
      await runSimulatedApplication(db, persona, a, options);
      report.assessed++;
      log(`${a.personaId} applied to Demo company ${String(a.companyNumber).padStart(2, "0")}`);
    } catch (error) {
      const reason = (error instanceof Error ? error.message : String(error)).slice(0, 160);
      report.failed.push({ personaId: a.personaId, companyNumber: a.companyNumber, reason });
      log(`  application of ${a.personaId} to company ${a.companyNumber} left out: ${reason}`);
    }
  }
  return report;
}
