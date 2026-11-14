/**
 * A stand-in for the interview, card, needs, matching and picks features, so the simulator,
 * the evaluation and the seed can be exercised before those streams merge (and in tests).
 * It writes real rows through the real tables, but everything it "understands" is a shortcut:
 * the card is built from the persona's own fact sheet, questions come from the fallback bank.
 *
 * NEVER use its output as evidence about the product. Reports built on it say "fake engine".
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  initialInterviewState,
  type CardForCompany,
  type CardForPerson,
  type NeedCard,
  type SignalCard,
  type Turn,
  type UiLang,
} from "@/contracts";
import type { Db } from "@/db/client";
import {
  company,
  digest,
  eligibility,
  escoOccupationSkill,
  interview,
  job,
  needCard,
  pick,
  signal,
  signalCard,
  talent,
  turn,
} from "@/db/schema";
import { FALLBACK_QUESTIONS, INTERVIEW_LINES, GENERIC_PROBE } from "@/lib/i18n/content/interview-lines";
import { newHandle, newId } from "@/lib/ids";
import { splitSentences } from "@/lib/sentences";
import type { SeedDeps } from "./deps";
import { createFakeApplications } from "./fake-applications";
import { detectLang } from "./metrics";
import { loadPersonas, type Persona } from "./persona";
import { seededHash } from "./prng";

export type FakeEngineOptions = {
  /** Personas, to build each card from its fact sheet. Defaults to the files in `seed/personas`. */
  personas?: Persona[];
  /** Text to append to every headline: proves the leak check bites. */
  injectIntoHeadline?: (persona: Persona) => string;
  /** Ask a probe after the tools answer in full mode (exercises the probe path). */
  probeAfterTools?: boolean;
  /** Also stand in for the application feature, so the seed makes simulated applications. */
  applications?: boolean;
};

type Plan = Array<{ kind: "question" | "probe"; target: Turn["target"] }>;

function planFor(persona: Persona, mode: "express" | "full", probe: boolean): Plan {
  if (mode === "express") return [{ kind: "question", target: "example" }, { kind: "question", target: "looking_for" }];
  const plan: Plan = [{ kind: "question", target: "example" }, { kind: "question", target: "tools" }];
  if (probe && persona.probes.length > 0) plan.push({ kind: "probe", target: "tools" });
  plan.push({ kind: "question", target: "people" }, { kind: "question", target: "beyond" }, { kind: "question", target: "looking_for" });
  return plan;
}

const stripParens = (label: string) => label.replace(/\s*\(.*\)/, "");

export function createFakeEngine(db: Db, options: FakeEngineOptions = {}): SeedDeps {
  const personas = options.personas ?? loadPersonas();
  const cards = new Map<string, { person: CardForPerson; company: CardForCompany; body: SignalCard }>();
  const talentPersona = new Map<string, Persona>();
  const interviewTalent = new Map<string, { talentId: string; mode: "express" | "full"; plan: Plan | null; ui: UiLang }>();
  const turnCount = new Map<string, number>();

  async function insertTurn(interviewId: string, row: Omit<typeof turn.$inferInsert, "id" | "interviewId" | "index" | "sentences">): Promise<Turn> {
    const index = turnCount.get(interviewId) ?? 0;
    turnCount.set(interviewId, index + 1);
    const sentences = splitSentences(row.text);
    const [saved] = await db.insert(turn).values({ id: newId("trn"), interviewId, index, sentences, ...row }).returning();
    return { ...saved, target: saved.target ?? null, sentencesOriginal: null, lang: saved.lang ?? null, inputMode: saved.inputMode ?? null, redactedAt: null, at: saved.at.toISOString() };
  }

  const deps: SeedDeps = {
    async startInterview(_db, request) {
      const talentId = newId("tal");
      const handle = await newHandle(async (h) => (await db.select().from(talent).where(eq(talent.handle, h))).length > 0);
      await db.insert(talent).values({ id: talentId, handle });
      const interviewId = newId("int");
      await db.insert(interview).values({ id: interviewId, talentId, mode: request.mode, state: initialInterviewState(request.uiLang, new Date().toISOString()) });
      const lines = INTERVIEW_LINES[request.uiLang];
      const opening = await insertTurn(interviewId, {
        role: "interviewer",
        kind: "opening",
        target: "recent_work",
        text: request.mode === "express" ? lines.openingExpress : lines.openingFull,
      });
      interviewTalent.set(interviewId, { talentId, mode: request.mode, plan: null, ui: request.uiLang });
      return { interviewId, talentId, handle, opening };
    },

    async *submitTurn(_db, interviewId, request) {
      const ctx = interviewTalent.get(interviewId);
      if (!ctx) throw new Error(`unknown interview ${interviewId}`);
      const persona = await personaForInterview(interviewId);
      ctx.plan ??= planFor(persona, ctx.mode, options.probeAfterTools ?? true);
      const said = detectLang(request.text);
      await insertTurn(interviewId, { role: "participant", kind: "answer", target: null, text: request.text, lang: said === "unknown" ? ctx.ui : said, inputMode: request.inputMode });
      const next = ctx.plan.shift();
      const lang = said === "unknown" ? ctx.ui : said;
      if (!next) {
        const text = INTERVIEW_LINES[lang].closing;
        const closing = await insertTurn(interviewId, { role: "interviewer", kind: "closing", target: null, text });
        await db.update(interview).set({ status: "completed", completedAt: new Date() }).where(eq(interview.id, interviewId));
        yield { type: "turn.done", turnIndex: closing.index, text, kind: "closing", closing: true };
        return;
      }
      const text = next.kind === "probe" ? GENERIC_PROBE[lang] : FALLBACK_QUESTIONS[lang][next.target!][0];
      const reply = await insertTurn(interviewId, { role: "interviewer", kind: next.kind, target: next.target, text });
      yield { type: "turn.delta", text };
      yield { type: "turn.done", turnIndex: reply.index, text, kind: next.kind, closing: false };
    },

    async settleInterview(_db, interviewId) {
      const ctx = interviewTalent.get(interviewId);
      if (!ctx) throw new Error(`unknown interview ${interviewId}`);
      const persona = await personaForInterview(interviewId);
      const turns = (await db.select().from(turn).where(eq(turn.interviewId, interviewId))).sort((a, b) => a.index - b.index);
      const answers = turns.filter((t) => t.role === "participant");
      const [t] = await db.select().from(talent).where(eq(talent.id, ctx.talentId));
      const signals = persona.facts.map((f, i) => {
        const source = answers[(i + 1) % answers.length];
        return {
          id: `s${i + 1}`,
          phrase: stripParens(f.label),
          phraseOwn: null,
          kind: "skill" as const,
          esco: { uri: f.skillUri, labelEn: f.label, labelFi: null },
          evidence: [{ turnIndex: source.index, sentenceFrom: 1, sentenceTo: 1 }],
          hasExample: true,
          status: "proposed" as const,
          addedBy: "agent" as const,
        };
      });
      const headline = `${persona.occupationLabel.replace(/^./, (c) => c.toUpperCase())}${options.injectIntoHeadline?.(persona) ?? ""}`;
      const body: SignalCard = {
        version: 1,
        status: "draft",
        handle: t.handle,
        headline: headline.slice(0, 90),
        signals,
        lookingFor: { ...persona.lookingFor },
        companyView: {
          label: "English rendering of what the person said",
          summary: `Describes work as ${persona.occupationLabel}.`,
          items: signals.map((s) => ({ signalId: s.id, text: `Has worked with ${s.phrase}.`, stale: false })),
        },
        approvedAt: null,
      };
      await storeCard(ctx.talentId, body, false);
      talentPersona.set(ctx.talentId, persona);
    },

    async cardForPerson(_db, talentId) {
      return cards.get(talentId)?.person ?? null;
    },

    async editCard(_db, talentId, edit) {
      const stored = cards.get(talentId);
      if (!stored) throw new Error(`fake engine: no card for ${talentId}`);
      if (edit.op !== "lookingFor") throw new Error(`fake engine: the edit "${edit.op}" is not implemented`);
      await storeCard(talentId, { ...stored.body, lookingFor: { ...edit.lookingFor } }, stored.body.status === "approved");
      return { sensitive: false };
    },
    async cardForCompany(_db, talentId) {
      const c = cards.get(talentId);
      return c && c.person.status === "approved" ? c.company : null;
    },
    async approveCard(_db, talentId) {
      const c = cards.get(talentId);
      if (!c) throw new Error(`no draft card for ${talentId}`);
      const body: SignalCard = { ...c.body, status: "approved", approvedAt: new Date().toISOString(), signals: c.body.signals.map((s) => ({ ...s, status: "approved" })) };
      await storeCard(talentId, body, true);
      await db.delete(signal).where(eq(signal.talentId, talentId));
      await db.insert(signal).values(
        body.signals.map((s) => ({
          talentId,
          id: s.id,
          phrase: s.phrase,
          kind: s.kind,
          escoUri: s.esco?.uri,
          escoLabelEn: s.esco?.labelEn,
          evidence: s.evidence,
          hasExample: s.hasExample,
          status: "approved" as const,
          addedBy: s.addedBy,
        })),
      );
      return { version: 1 };
    },
    async setPoolOptIn(_db, talentId, inPool) {
      await db.update(talent).set({ inPool }).where(eq(talent.id, talentId));
      const c = cards.get(talentId);
      if (c) c.person = { ...c.person, inPool };
    },

    async draftNeedCard(_db, jobId, companyId) {
      const [j] = await db.select().from(job).where(eq(job.id, jobId));
      if (!j) throw new Error(`no posting ${jobId}`);
      const existing = await db.select().from(needCard).where(eq(needCard.jobId, jobId));
      const id = existing[0]?.id ?? newId("nc");
      const body: NeedCard = {
        id,
        jobId,
        companyId,
        version: (existing[0]?.version ?? 0) + 1,
        title: j.title.slice(0, 140),
        summary: "",
        lang: j.lang,
        status: "draft",
        droppedSentences: [],
        // With the applications stand-in on, the card holds two requirements, so there is something to ask about.
        requirements: options.applications
          ? [
              { text: `Own work as a ${j.title.slice(0, 80)}`, kind: "must" as const },
              { text: "Working with other people", kind: "nice" as const },
            ].map((r, i) => ({
              id: `req_${id.slice(3)}_${i + 1}`,
              text: r.text,
              kind: r.kind,
              category: "experience" as const,
              escoSkillUris: [],
              postingSentence: null,
              source: "agent" as const,
              languageCode: null,
              statutory: "none" as const,
              question: null,
              pool: null,
            }))
          : [],
        confirmedAt: null,
      };
      if (existing[0]) await db.update(needCard).set({ companyId, body, version: body.version }).where(eq(needCard.id, id));
      else await db.insert(needCard).values({ id, jobId, companyId, version: 1, body, status: "draft" });
      return body;
    },

    async computeEligibility(_db, scope) {
      const needs = "needCardId" in scope ? await db.select().from(needCard).where(eq(needCard.id, scope.needCardId)) : await db.select().from(needCard);
      const people = await db.select().from(talent).where(eq(talent.inPool, true));
      let rows = 0;
      for (const n of needs) {
        const [j] = await db.select().from(job).where(eq(job.id, n.jobId));
        const links = j.escoOccupationUris.length === 0 ? [] : await db.select().from(escoOccupationSkill).where(inArray(escoOccupationSkill.occupationUri, j.escoOccupationUris));
        const wanted = new Set(links.map((l) => l.skillUri));
        for (const p of people) {
          if ("talentId" in scope && scope.talentId !== p.id) continue;
          const mine = await db.select().from(signal).where(and(eq(signal.talentId, p.id), eq(signal.status, "approved")));
          const ok = mine.some((s) => s.escoUri && wanted.has(s.escoUri));
          await db
            .insert(eligibility)
            .values({ needCardId: n.id, needCardVersion: n.version, talentId: p.id, cardVersion: 1, eligible: ok, touchedRequirementIds: [] })
            .onConflictDoUpdate({ target: [eligibility.needCardId, eligibility.needCardVersion, eligibility.talentId], set: { eligible: ok } });
          rows++;
        }
      }
      return { rows };
    },

    async draftDailyDigests(_db, date) {
      const participating = new Set((await db.select().from(company)).filter((c) => c.participating).map((c) => c.id));
      const companies = (await db.select().from(needCard)).filter((n) => n.companyId && participating.has(n.companyId));
      let digests = 0;
      let picks = 0;
      for (const n of companies) {
        const exists = await db.select().from(digest).where(and(eq(digest.companyId, n.companyId!), eq(digest.date, date)));
        if (exists.length > 0) continue;
        const digestId = newId("dig");
        await db.insert(digest).values({ id: digestId, companyId: n.companyId!, date, seed: seededHash("digest", `${n.id}:${date}`), status: "draft" });
        digests++;
        const elig = (await db.select().from(eligibility).where(and(eq(eligibility.needCardId, n.id), eq(eligibility.eligible, true)))).slice(0, 3);
        for (const e of elig) {
          await db.insert(pick).values({ id: newId("pick"), digestId, companyId: n.companyId!, needCardId: n.id, needCardVersion: n.version, talentId: e.talentId, cardVersion: e.cardVersion, body: { reasons: [], notMentioned: [] } });
          picks++;
        }
      }
      return { digests, picks };
    },

    async runQueue() {
      return 0;
    },
  };

  async function personaForInterview(interviewId: string): Promise<Persona> {
    const ctx = interviewTalent.get(interviewId)!;
    const [t] = await db.select().from(talent).where(eq(talent.id, ctx.talentId));
    const persona = personas.find((p) => p.id === t.personaKey);
    if (!persona) throw new Error("fake engine: the persona key was not set before the first answer");
    return persona;
  }

  async function storeCard(talentId: string, body: SignalCard, approved: boolean) {
    const [t] = await db.select().from(talent).where(eq(talent.id, talentId));
    const ctx = [...interviewTalent.values()].find((c) => c.talentId === talentId)!;
    const interviewId = [...interviewTalent.entries()].find(([, c]) => c === ctx)![0];
    const turns = (await db.select().from(turn).where(eq(turn.interviewId, interviewId))).sort((a, b) => a.index - b.index);
    const quote = (ref: { turnIndex: number; sentenceFrom: number }) => turns.find((x) => x.index === ref.turnIndex)?.sentences[ref.sentenceFrom - 1] ?? "";
    const person: CardForPerson = {
      talentId,
      handle: body.handle,
      synthetic: t.synthetic,
      inPool: t.inPool,
      status: body.status,
      version: body.version,
      hasApprovedVersion: approved,
      headline: body.headline,
      summary: body.companyView.summary,
      renderingLabel: body.companyView.label,
      signals: body.signals.map((s) => {
        const { hasExample: _h, ...rest } = s;
        void _h;
        return { ...rest, quotes: s.evidence.map(quote), rendering: body.companyView.items.find((i) => i.signalId === s.id)?.text ?? null, stale: false };
      }),
      lookingFor: body.lookingFor,
      approvedAt: body.approvedAt,
    };
    const company: CardForCompany = {
      handle: body.handle,
      synthetic: t.synthetic,
      headline: body.headline,
      summary: body.companyView.summary,
      renderingLabel: body.companyView.label,
      signals: body.signals.map((s) => ({ id: s.id, phrase: s.phrase, kind: s.kind, esco: s.esco, rendering: body.companyView.items.find((i) => i.signalId === s.id)?.text ?? null })),
      lookingFor: body.lookingFor,
    };
    cards.set(talentId, { person, company, body });
    const status = approved ? "approved" : "draft";
    await db
      .insert(signalCard)
      .values({ talentId, status, version: body.version, body, approvedAt: approved ? new Date() : null })
      .onConflictDoUpdate({ target: [signalCard.talentId, signalCard.status], set: { body, version: body.version } });
  }

  if (options.applications) deps.applications = createFakeApplications(db);
  return deps;
}
