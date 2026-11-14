/**
 * A stand-in for the application feature, so the simulated applications, the seed and the
 * snapshot can be exercised without it (and without a model). It writes real rows through the
 * real tables: a plan of the first two requirements of the job's Need Card, one question each,
 * and a made-up assessment. NEVER use its output as evidence about the product.
 */
import { eq } from "drizzle-orm";
import { APPLICATION_RUBRIC_VERSION, type ApplicationAssessment, type ApplicationPlan, type ApplicationTurn } from "@/contracts";
import type { Db } from "@/db/client";
import { application, applicationTurn, needCard } from "@/db/schema";
import { newId } from "@/lib/ids";
import { splitSentences } from "@/lib/sentences";
import { seededHash } from "./prng";
import type { ApplicationDeps } from "./deps";

export type FakeApplicationOptions = {
  /** Make `assessApplication` return null for this application's talent, to exercise a failed run. */
  failAssessmentFor?: (talentId: string) => boolean;
};

export function createFakeApplications(db: Db, options: FakeApplicationOptions = {}): ApplicationDeps {
  async function insertTurn(applicationId: string, row: Pick<ApplicationTurn, "role" | "kind" | "requirementId" | "text"> & { inputMode?: ApplicationTurn["inputMode"] }): Promise<ApplicationTurn> {
    const existing = await db.select({ id: applicationTurn.id }).from(applicationTurn).where(eq(applicationTurn.applicationId, applicationId));
    const index = existing.length;
    const sentences = splitSentences(row.text);
    const [saved] = await db
      .insert(applicationTurn)
      .values({ id: newId("apt"), applicationId, index, sentences, role: row.role, kind: row.kind, requirementId: row.requirementId, text: row.text, inputMode: row.inputMode ?? null })
      .returning();
    return { ...saved, inputMode: saved.inputMode ?? null, requirementId: saved.requirementId ?? null, removedAt: null, at: saved.at.toISOString() };
  }

  const planOf = async (applicationId: string) => {
    const [row] = await db.select().from(application).where(eq(application.id, applicationId));
    if (!row) throw new Error(`unknown application ${applicationId}`);
    return row;
  };

  const deps: ApplicationDeps = {
    async startApplication(_db, talentId, request) {
      const [need] = await db.select().from(needCard).where(eq(needCard.jobId, request.jobId));
      if (!need?.companyId) throw new Error(`no Need Card for job ${request.jobId}`);
      const requirements = need.body.requirements.slice(0, 2).map((r) => ({
        requirementId: r.id,
        text: r.text,
        kind: r.kind,
        category: r.category,
        postingSentence: r.postingSentence,
        question: `Tell me about your own work with this: ${r.text}`,
        wording: "code" as const,
      }));
      if (requirements.length === 0) throw new Error("the Need Card has no requirements");
      const plan: ApplicationPlan = { needCardId: need.id, needCardVersion: need.version, lang: request.uiLang, requirements };
      const id = newId("app");
      await db.insert(application).values({
        id,
        talentId,
        jobId: request.jobId,
        companyId: need.companyId,
        plan,
        state: { cursor: 0, followUps: {}, progress: Object.fromEntries(requirements.map((r, i) => [r.requirementId, i === 0 ? "asked" : "waiting"])), noted: {} },
      });
      const opening = await insertTurn(id, { role: "interviewer", kind: "opening", requirementId: requirements[0].requirementId, text: requirements[0].question });
      return { applicationId: id, opening };
    },

    async *submitApplicationTurn(_db, applicationId, request) {
      const row = await planOf(applicationId);
      const turns = await db.select().from(applicationTurn).where(eq(applicationTurn.applicationId, applicationId));
      const lastQuestion = turns.filter((t) => t.role === "interviewer").sort((a, b) => b.index - a.index)[0];
      const stored = await insertTurn(applicationId, { role: "participant", kind: "answer", requirementId: lastQuestion?.requirementId ?? null, text: request.text, inputMode: request.inputMode });
      yield { type: "answer.stored", turn: stored };
      const asked = new Set(turns.filter((t) => t.role === "interviewer").map((t) => t.requirementId));
      const next = row.plan.requirements.find((r) => !asked.has(r.requirementId));
      const reply = next
        ? await insertTurn(applicationId, { role: "interviewer", kind: "question", requirementId: next.requirementId, text: next.question })
        : await insertTurn(applicationId, { role: "interviewer", kind: "closing", requirementId: null, text: "That was the last one. Look through your answers, then send your application." });
      if (!next) await db.update(application).set({ status: "review" }).where(eq(application.id, applicationId));
      yield { type: "turn.done", turn: reply, ended: !next };
    },

    async submitApplication(_db, applicationId) {
      await db.update(application).set({ status: "submitted", submittedAt: new Date() }).where(eq(application.id, applicationId));
    },

    async assessApplication(_db, applicationId) {
      const row = await planOf(applicationId);
      if (options.failAssessmentFor?.(row.talentId)) return null;
      const turns = await db.select().from(applicationTurn).where(eq(applicationTurn.applicationId, applicationId));
      const answers = turns.filter((t) => t.role === "participant");
      const assessment: ApplicationAssessment = {
        rubricVersion: APPLICATION_RUBRIC_VERSION,
        ratings: row.plan.requirements.map((r, i) => {
          const answer = answers[i];
          const level = answer ? (Number.parseInt(seededHash("fake-level", `${row.talentId}:${r.requirementId}`).slice(0, 2), 16) % 4) : 0;
          const text = { en: "Fake reason.", fi: "Valeperuste.", sv: "Låtsasskäl." };
          return {
            requirementId: r.requirementId,
            level: level > 0 && answer ? level : 0,
            evidence: level > 0 && answer ? [{ turnIndex: answer.index, sentenceFrom: 1, sentenceTo: 1 }] : [],
            reason: text,
            wording: "code" as const,
          };
        }),
        summary: { en: "Fake summary.", fi: "Valeyhteenveto.", sv: "Låtsassammanfattning." },
        assessedAt: new Date().toISOString(),
      };
      await db.update(application).set({ status: "assessed", assessment, assessedAt: new Date() }).where(eq(application.id, applicationId));
      return assessment;
    },
  };
  return deps;
}
