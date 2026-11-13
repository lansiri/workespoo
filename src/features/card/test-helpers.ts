/** Helpers for this feature's tests. Not used by production code. */
import { initialInterviewState, type Signal, type SignalCard } from "@/contracts";
import type { Db } from "@/db/client";
import { escoConcept, interview, signal as signalTable, talent, turn } from "@/db/schema";
import { splitSentences } from "@/lib/sentences";
import { COMPANY_RENDERING_LABEL } from "./checks";
import { saveCard } from "./store";

export const SENTENCES = {
  T1: "I worked at a logistics centre, mainly receiving goods. We used handheld scanners and SAP for everything.",
  T3: "Once a truck came with the wrong pallets and half of the order was missing. I checked every pallet against the delivery note, took photos and filed the claim in SAP before the driver left. Then I told the purchasing team so they could reorder.",
  T5: "Mostly with the drivers and the purchasing people. I also trained two summer workers on the scanners.",
  T7: "Back in Lagos I did bookkeeping for my uncle's shop.",
  T9: "I'd like a warehouse coordinator job, or something in purchasing.",
} as const;

export type SeedOptions = {
  talentId?: string;
  interviewId?: string;
  handle?: string;
  mode?: "express" | "full";
  lang?: string;
  inputMode?: "voice" | "text";
  turns?: Record<string, string>;
  liveSignals?: Array<Partial<typeof signalTable.$inferInsert> & { id: string; phrase: string }>;
};

/** A talent with an interview whose participant turns are the given texts (key `T<index>`). */
export async function seedInterview(db: Db, opts: SeedOptions = {}) {
  const talentId = opts.talentId ?? "tal_test00000001";
  const interviewId = opts.interviewId ?? "int_test00000001";
  await db.insert(talent).values({ id: talentId, handle: opts.handle ?? "Birch-27" }).onConflictDoNothing();
  await db.insert(interview).values({
    id: interviewId,
    talentId,
    mode: opts.mode ?? "full",
    lang: opts.lang ?? "en",
    state: initialInterviewState("en", new Date().toISOString()),
  });
  await db.insert(turn).values({
    id: `trn_${interviewId}_0`,
    interviewId,
    index: 0,
    role: "interviewer",
    kind: "opening",
    text: "Hello. What work have you done?",
    sentences: ["Hello.", "What work have you done?"],
  });
  for (const [key, text] of Object.entries(opts.turns ?? SENTENCES)) {
    const index = Number(key.slice(1));
    await db.insert(turn).values({
      id: `trn_${interviewId}_${index}`,
      interviewId,
      index,
      role: "participant",
      kind: "answer",
      text,
      sentences: splitSentences(text),
      lang: opts.lang ?? "en",
      inputMode: opts.inputMode ?? "voice",
    });
  }
  for (const s of opts.liveSignals ?? []) {
    await db.insert(signalTable).values({
      talentId,
      interviewId,
      kind: "skill",
      evidence: [{ turnIndex: 1, sentenceFrom: 1, sentenceTo: 1 }],
      ...s,
    });
  }
  return { talentId, interviewId };
}

export async function seedEsco(db: Db) {
  await db.insert(escoConcept).values([
    { uri: "http://data.europa.eu/esco/skill/test-claims", type: "skill", labelEn: "manage supplier claims", labelFi: "hallita toimittajareklamaatioita" },
    { uri: "http://data.europa.eu/esco/skill/test-sap", type: "skill", labelEn: "SAP", labelFi: "SAP" },
  ]).onConflictDoNothing();
}

export function signal(partial: Partial<Signal> & Pick<Signal, "id" | "phrase">): Signal {
  return {
    phraseOwn: null,
    kind: "skill",
    esco: null,
    evidence: [{ turnIndex: 1, sentenceFrom: 1, sentenceTo: 1 }],
    hasExample: true,
    status: "proposed",
    addedBy: "agent",
    ...partial,
  };
}

/** Write a card directly. Renderings default to a sentence per signal. */
export async function seedCard(
  db: Db,
  talentId: string,
  opts: { status: "draft" | "approved"; version?: number; signals: Signal[]; stale?: string[]; lookingFor?: Partial<SignalCard["lookingFor"]> },
) {
  const card: SignalCard = {
    version: opts.version ?? 1,
    status: opts.status,
    handle: "Birch-27",
    headline: "Goods receiving and SAP",
    signals: opts.signals,
    lookingFor: { roles: [], workMode: null, startFrom: null, workLanguages: [], ...opts.lookingFor },
    companyView: {
      label: COMPANY_RENDERING_LABEL,
      summary: "They talked about goods receiving and SAP.",
      items: opts.signals
        .filter((s) => s.status !== "removed")
        .map((s) => ({ signalId: s.id, text: `They worked with ${s.phrase.toLowerCase()}.`, stale: opts.stale?.includes(s.id) ?? false })),
    },
    approvedAt: opts.status === "approved" ? new Date().toISOString() : null,
  };
  await saveCard(db, talentId, card);
  return card;
}
