import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { talent, talentIdentity } from "@/db/schema";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { createFakeEngine } from "./fake-engine";
import { loadPersonas } from "./persona";
import { runSimulatedInterview, typedLanguage } from "./run";
import type { SimDeps } from "./deps";

// The default wiring calls the features through their public index files. Route them to the fake.
const holder = vi.hoisted(() => ({ engine: null as SimDeps | null }));
vi.mock("@/features/interview", () => ({
  startInterview: (...a: Parameters<SimDeps["startInterview"]>) => holder.engine!.startInterview(...a),
  submitTurn: (...a: Parameters<SimDeps["submitTurn"]>) => holder.engine!.submitTurn(...a),
  settleInterview: (...a: Parameters<SimDeps["settleInterview"]>) => holder.engine!.settleInterview(...a),
}));
vi.mock("@/features/card", () => ({
  cardForPerson: (...a: Parameters<SimDeps["cardForPerson"]>) => holder.engine!.cardForPerson(...a),
  cardForCompany: (...a: Parameters<SimDeps["cardForCompany"]>) => holder.engine!.cardForCompany(...a),
  editCard: (...a: Parameters<SimDeps["editCard"]>) => holder.engine!.editCard(...a),
  approveCard: (...a: Parameters<SimDeps["approveCard"]>) => holder.engine!.approveCard(...a),
  setPoolOptIn: (...a: Parameters<SimDeps["setPoolOptIn"]>) => holder.engine!.setPoolOptIn(...a),
}));

const personas = loadPersonas();
let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  holder.engine = createFakeEngine(t.db, { personas });
});
afterAll(() => t.close());

describe("runSimulatedInterview", () => {
  it("runs a full interview through the public functions and leaves an approved, pooled, labelled person", async () => {
    const persona = personas.find((p) => p.interviewMode === "full" && p.interviewLang === "en")!;
    const run = await runSimulatedInterview(t.db, persona);
    expect(run.mode).toBe("full");
    expect(run.turns[0]).toMatchObject({ index: 0, role: "interviewer", kind: "opening" });
    expect(run.turns.at(-1)).toMatchObject({ role: "interviewer", kind: "closing" });
    // Every answer is the persona's own words.
    const answers = run.turns.filter((x) => x.role === "participant").map((x) => x.text);
    expect(answers[0]).toBe(persona.answers.recent_work);
    expect(answers.at(-1)).toBe(persona.answers.looking_for);
    expect(run.person.status).toBe("approved");
    expect(run.person.inPool).toBe(true);
    expect(run.company?.handle).toBe(run.handle);

    const [row] = await t.db.select().from(talent).where(eq(talent.id, run.talentId));
    expect(row).toMatchObject({ synthetic: true, liveDemo: false, inPool: true, personaKey: persona.id, handle: persona.handle });
    const [identity] = await t.db.select().from(talentIdentity).where(eq(talentIdentity.talentId, run.talentId));
    expect(identity).toMatchObject({ displayName: persona.name, contact: persona.email });
  });

  it("declares how the person wants to work on the card, before approving it", async () => {
    const engine = holder.engine!;
    const persona = personas.find((p) => p.lookingFor.workLanguages.length >= 3)!;
    // What the simulator sends as the card edit when the draft's notes hold these roles.
    const declaredWith = async (rolesOnDraft: string[]) => {
      const calls: string[] = [];
      let edit: Parameters<SimDeps["editCard"]>[2] | null = null;
      const deps: SimDeps = {
        ...engine,
        cardForPerson: async (...a) => {
          const card = await engine.cardForPerson(...a);
          return card && calls.length === 0 ? { ...card, lookingFor: { ...card.lookingFor, roles: rolesOnDraft } } : card;
        },
        editCard: async (...a) => {
          calls.push("editCard");
          edit = a[2];
          return engine.editCard(...a);
        },
        approveCard: async (...a) => {
          calls.push("approveCard");
          return engine.approveCard(...a);
        },
      };
      const run = await runSimulatedInterview(t.db, persona, undefined, { deps });
      expect(calls).toEqual(["editCard", "approveCard"]);
      return { edit: edit as unknown, run };
    };

    // Languages are typed the way a person writes them in the language of the page.
    const typedLanguages = persona.lookingFor.workLanguages.map((code) => typedLanguage(code, persona.interviewLang));
    expect(typedLanguages).not.toEqual(persona.lookingFor.workLanguages);
    const declared = { ...persona.lookingFor, workLanguages: typedLanguages };

    // The notes already hold a role: it stays, and the rest is the person's own declaration.
    const kept = await declaredWith(["Role from the notes"]);
    expect(kept.edit).toEqual({ op: "lookingFor", lookingFor: { ...declared, roles: ["Role from the notes"] } });
    expect(kept.run.person.lookingFor).toMatchObject({
      workMode: persona.lookingFor.workMode,
      startFrom: persona.lookingFor.startFrom,
      workLanguages: typedLanguages,
    });
    // The notes hold no role: the person types theirs in.
    const typed = await declaredWith([]);
    expect(typed.edit).toEqual({ op: "lookingFor", lookingFor: declared });
  });

  it("writes language names as a person would in English, Finnish and Swedish", () => {
    expect(["en", "fi", "sv"].map((code) => typedLanguage(code, "en"))).toEqual(["English", "Finnish", "Swedish"]);
    expect(["en", "fi", "sv"].map((code) => typedLanguage(code, "fi"))).toEqual(["englanti", "suomi", "ruotsi"]);
    expect(["en", "fi", "sv"].map((code) => typedLanguage(code, "sv"))).toEqual(["engelska", "finska", "svenska"]);
    expect(typedLanguage("et", "en")).toBe("et");
  });

  it("answers a probe with the persona's second, more concrete answer", async () => {
    const persona = personas.find((p) => p.id === "p03")!;
    const run = await runSimulatedInterview(t.db, persona);
    const probeIndex = run.turns.findIndex((x) => x.kind === "probe");
    expect(probeIndex).toBeGreaterThan(0);
    expect(run.turns[probeIndex + 1].text).toBe(persona.probes[0]);
  });

  it("ends an express interview after exactly three answers, and honours a mode override", async () => {
    const express = personas.find((p) => p.interviewMode === "express")!;
    const run = await runSimulatedInterview(t.db, express);
    expect(run.turns.filter((x) => x.role === "participant")).toHaveLength(3);
    const overridden = await runSimulatedInterview(t.db, express, "full");
    expect(overridden.mode).toBe("full");
    expect(overridden.turns.filter((x) => x.role === "participant").length).toBeGreaterThanOrEqual(5);
  });

  it("works for Finnish and Swedish personas and mirrors their language", async () => {
    for (const lang of ["fi", "sv"] as const) {
      const persona = personas.find((p) => p.interviewLang === lang)!;
      const run = await runSimulatedInterview(t.db, persona);
      const firstQuestion = run.turns.find((x) => x.kind === "question")!;
      expect(firstQuestion.text).not.toMatch(/\b(what|could you)\b/i);
      expect(run.turns[0].text).not.toMatch(/^Hi, I'm/);
    }
  });

  it("fails the run clearly when the interviewer never closes", async () => {
    const engine = createFakeEngine(t.db, { personas });
    const stuck: SimDeps = {
      ...engine,
      // Always points back at the opening turn, so the interview never reaches a closing.
      submitTurn: async function* () {
        yield { type: "turn.done", turnIndex: 0, text: "x", kind: "question", closing: false };
      },
    };
    await expect(runSimulatedInterview(t.db, personas[0], "full", { deps: stuck })).rejects.toThrow(/did not close after/);
  });
});
