/** Builders for the needs tests. Not imported by production code. */
import { eq } from "drizzle-orm";
import type { NeedCard } from "@/contracts";
import type { Db } from "@/db/client";
import {
  company,
  eligibility,
  escoConcept,
  job,
  jobQueue,
  signal,
  signalCard,
  talent,
  talentLanguage,
} from "@/db/schema";
import { newId, newToken } from "@/lib/ids";
import type { LlmOptions } from "@/lib/llm";

export async function addCompany(
  db: Db,
  over: Partial<{ id: string; displayName: string; realName: string | null; masked: boolean; token: string }> = {},
) {
  const id = over.id ?? newId("co");
  const token = over.token ?? newToken();
  await db.insert(company).values({
    id,
    displayName: over.displayName ?? "Demo company 07",
    realName: over.realName === undefined ? "Academic Work Finland Oy" : over.realName,
    source: "posting",
    masked: over.masked ?? true,
    participating: true,
    digestToken: token,
  });
  return { id, token };
}

/** The id of the fixture posting whose title contains `fragment`. */
export async function jobIdByTitle(db: Db, fragment: string): Promise<string> {
  const rows = await db.select({ id: job.id, title: job.title }).from(job);
  const hit = rows.find((r) => r.title.includes(fragment));
  if (!hit) throw new Error(`no fixture posting titled like ${fragment}`);
  return hit.id;
}

/** A small hand-written posting. */
export async function addJobRow(
  db: Db,
  over: Partial<typeof job.$inferInsert> & { sentences: string[] },
): Promise<string> {
  const id = over.id ?? newId("job");
  await db.insert(job).values({
    id,
    source: "tmt",
    sourceId: id,
    url: `https://example.invalid/${id}`,
    title: "Test role",
    employerName: "Testiyhtiö Oy",
    sector: "private",
    lang: "en",
    description: over.sentences.join(" "),
    ...over,
  });
  return id;
}

export async function addEscoSkill(db: Db, uri: string, labelEn: string, labelFi: string | null = null) {
  await db.insert(escoConcept).values({ uri, type: "skill", labelEn, labelFi, retired: false }).onConflictDoNothing();
}

export function userMessage(opts: LlmOptions): string {
  return opts.messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
}

/** The `K<n>` label of the candidate whose text contains `fragment` in the prompt, or null. */
export function kLabel(opts: LlmOptions, fragment: string): string | null {
  const re = new RegExp(`^(K\\d+): .*${fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "im");
  return re.exec(userMessage(opts))?.[1] ?? null;
}

type DraftReq = {
  text: string;
  sentence: number;
  kind?: "must" | "nice";
  category?: "skill" | "language" | "education" | "experience" | "authorisation" | "other";
  esco?: string[];
  language?: string | null;
  years?: number | null;
  statutory?: "law" | "none";
  questionType?: "none" | "language" | "years" | "degree" | "tool" | "vague";
  question?: string | null;
  why?: string | null;
};

/** A model output in the shape of the prompt's schema, with defaults filled in. */
export function draftOutput(title: string, requirements: DraftReq[], dropped: number[] = [], summary = "Builds software.") {
  return {
    title,
    summary,
    requirements: requirements.map((r) => ({
      text: r.text,
      kind: r.kind ?? "must",
      category: r.category ?? "skill",
      sentence: r.sentence,
      esco: r.esco ?? [],
      language: r.language ?? null,
      years: r.years ?? null,
      statutory: r.statutory ?? "none",
      questionType: r.questionType ?? "none",
      question: r.question ?? null,
      why: r.why ?? null,
    })),
    dropped,
  };
}

let talentCounter = 0;
/** A person in the pool with an approved card, approved signals and languages. */
export async function addTalent(
  db: Db,
  opts: {
    id?: string;
    inPool?: boolean;
    approved?: boolean;
    purgeAfter?: Date | null;
    personaKey?: string | null;
    signals?: Array<{ phrase: string; escoUri?: string | null; status?: "approved" | "proposed" | "removed" }>;
    languages?: Array<{ code: string; basis: "evidenced" | "declared" }>;
  } = {},
): Promise<string> {
  const id = opts.id ?? `tal_t${String(++talentCounter).padStart(4, "0")}`;
  await db.insert(talent).values({
    id,
    handle: `Birch-${id}`,
    synthetic: true,
    inPool: opts.inPool ?? true,
    purgeAfter: opts.purgeAfter ?? null,
    personaKey: opts.personaKey ?? null,
  });
  if (opts.approved ?? true) {
    await db.insert(signalCard).values({ talentId: id, status: "approved", version: 1, body: {} as never, approvedAt: new Date() });
  }
  let n = 0;
  for (const s of opts.signals ?? []) {
    await db.insert(signal).values({
      talentId: id,
      id: `s${++n}`,
      phrase: s.phrase,
      kind: "skill",
      escoUri: s.escoUri ?? null,
      status: s.status ?? "approved",
    });
  }
  for (const l of opts.languages ?? []) await db.insert(talentLanguage).values({ talentId: id, code: l.code, basis: l.basis });
  return id;
}

export async function addEligibility(
  db: Db,
  needCardId: string,
  version: number,
  talentIds: string[],
  eligible = true,
) {
  for (const talentId of talentIds) {
    await db.insert(eligibility).values({
      needCardId,
      needCardVersion: version,
      talentId,
      cardVersion: 1,
      eligible,
      touchedRequirementIds: [],
    });
  }
}

export async function queued(db: Db, kind: string) {
  const rows = await db.select().from(jobQueue).where(eq(jobQueue.kind, kind));
  return rows.map((r) => r.payload as Record<string, unknown>);
}

/** Replace a stored card body directly (to set up pool numbers and questions for a test). */
export async function overwriteCard(db: Db, card: NeedCard) {
  const { needCard } = await import("@/db/schema");
  await db
    .update(needCard)
    .set({ body: card, version: card.version, status: card.status })
    .where(eq(needCard.id, card.id));
}

/** Insert a stored card directly, with requirements given in short form. */
export async function makeCard(
  db: Db,
  opts: {
    jobId: string;
    companyId: string | null;
    version?: number;
    status?: NeedCard["status"];
    requirements: Array<Partial<NeedCard["requirements"][number]> & { text: string }>;
  },
): Promise<NeedCard> {
  const { needCard } = await import("@/db/schema");
  const card: NeedCard = {
    id: newId("nc"),
    jobId: opts.jobId,
    companyId: opts.companyId,
    version: opts.version ?? 1,
    title: "Test role",
    summary: "Does test things.",
    lang: "en",
    status: opts.status ?? "draft",
    droppedSentences: [],
    confirmedAt: null,
    requirements: opts.requirements.map((r) => ({
      id: newId("req"),
      kind: "must",
      category: "skill",
      escoSkillUris: [],
      postingSentence: 0,
      source: "agent",
      languageCode: null,
      statutory: "none",
      question: null,
      pool: null,
      ...r,
    })),
  };
  await db.insert(needCard).values({
    id: card.id,
    jobId: card.jobId,
    companyId: card.companyId,
    version: card.version,
    body: card,
    status: card.status,
  });
  return card;
}
