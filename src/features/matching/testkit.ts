/** Builders for matching tests: people with approved cards, and hand-written Need Cards. Not used by production code. */
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { NeedCard, Requirement, SignalCard } from "@/contracts";
import { company, escoConcept, job, needCard, signal, signalCard, talent, talentLanguage } from "@/db/schema";
import { rowsOf } from "@/lib/sql";

export async function uriByLabel(db: Db, labelEn: string): Promise<string> {
  const [row] = await db.select().from(escoConcept).where(eq(escoConcept.labelEn, labelEn));
  if (!row) throw new Error(`no fixture concept "${labelEn}"`);
  return row.uri;
}

/** Essential skills (label, uri) of the first occupation of the fixture posting whose title contains `title`. */
export async function occupationSkillsOf(db: Db, title: string, take = 4) {
  const rows = rowsOf<{ uri: string; label_en: string }>(
    await db.execute(sql`
      SELECT c.uri, c.label_en FROM job j
      JOIN esco_occupation_skill os ON os.occupation_uri = j.esco_occupation_uris[1] AND os.relation = 'essential'
      JOIN esco_concept c ON c.uri = os.skill_uri
      WHERE j.title ILIKE ${`%${title}%`}
      ORDER BY c.uri LIMIT ${take}`),
  );
  return rows.map((r) => ({ uri: r.uri, label: r.label_en }));
}

export type TestSignal = { id: string; phrase: string; escoUri?: string | null; evidence?: SignalCard["signals"][number]["evidence"] };

export type TestPerson = {
  id: string;
  handle?: string;
  inPool?: boolean;
  version?: number;
  signals: TestSignal[];
  roles?: string[];
  languages?: Array<{ code: string; basis: "evidenced" | "declared" }>;
};

/** Insert a person with an approved card, approved `signal` rows and language rows. Returns the card. */
export async function addPerson(db: Db, p: TestPerson): Promise<SignalCard> {
  const labels = new Map<string, { labelEn: string; labelFi: string | null }>();
  for (const s of p.signals) {
    if (!s.escoUri) continue;
    const [c] = await db.select().from(escoConcept).where(eq(escoConcept.uri, s.escoUri));
    if (c) labels.set(s.escoUri, { labelEn: c.labelEn, labelFi: c.labelFi });
  }
  const card: SignalCard = {
    version: p.version ?? 1,
    status: "approved",
    handle: p.handle ?? `Handle-${p.id}`,
    headline: "Test headline",
    signals: p.signals.map((s) => ({
      id: s.id,
      phrase: s.phrase,
      phraseOwn: null,
      kind: "skill",
      esco: s.escoUri ? { uri: s.escoUri, ...(labels.get(s.escoUri) ?? { labelEn: s.phrase, labelFi: null }) } : null,
      evidence: s.evidence ?? [{ turnIndex: 1, sentenceFrom: 1, sentenceTo: 1 }],
      hasExample: false,
      status: "approved",
      addedBy: "agent",
    })),
    lookingFor: { roles: p.roles ?? [], workMode: null, startFrom: null, workLanguages: [] },
    companyView: {
      label: "English rendering",
      summary: "Test summary",
      items: p.signals.map((s) => ({ signalId: s.id, text: `Did work involving ${s.phrase} (English rendering).`, stale: false })),
    },
    approvedAt: "2026-11-01T00:00:00.000Z",
  };
  await db.insert(talent).values({ id: p.id, handle: card.handle, inPool: p.inPool ?? true });
  await db.insert(signalCard).values({ talentId: p.id, status: "approved", version: card.version, body: card, approvedAt: new Date("2026-11-01") });
  for (const s of card.signals) {
    await db.insert(signal).values({
      talentId: p.id,
      id: s.id,
      phrase: s.phrase,
      kind: s.kind,
      escoUri: s.esco?.uri ?? null,
      escoLabelEn: s.esco?.labelEn ?? null,
      escoLabelFi: s.esco?.labelFi ?? null,
      evidence: s.evidence,
      status: "approved",
    });
  }
  for (const l of p.languages ?? []) await db.insert(talentLanguage).values({ talentId: p.id, code: l.code, basis: l.basis });
  return card;
}

export function req(id: string, text: string, over: Partial<Requirement> = {}): Requirement {
  return {
    id,
    text,
    kind: "must",
    category: "skill",
    escoSkillUris: [],
    postingSentence: null,
    source: "agent",
    languageCode: null,
    statutory: "none",
    question: null,
    pool: null,
    ...over,
  };
}

/** Insert a hand-written Need Card for a posting. */
export async function addNeed(
  db: Db,
  input: { id: string; jobId: string; title?: string; requirements: Requirement[]; version?: number; companyId?: string | null },
): Promise<NeedCard> {
  const body: NeedCard = {
    id: input.id,
    jobId: input.jobId,
    companyId: input.companyId ?? null,
    version: input.version ?? 1,
    title: input.title ?? "Test need",
    summary: "",
    lang: "en",
    status: "draft",
    droppedSentences: [],
    requirements: input.requirements,
    confirmedAt: null,
  };
  await db.insert(needCard).values({
    id: input.id,
    jobId: input.jobId,
    companyId: body.companyId,
    version: body.version,
    body,
    status: "draft",
  });
  return body;
}

export async function addMaskedCompany(db: Db, id: string) {
  await db.insert(company).values({ id, displayName: "Demo company 01", realName: "Real Oy", source: "posting", masked: true, digestToken: `tok_${id}` });
}

export async function jobIdByTitle(db: Db, title: string): Promise<string> {
  const [row] = await db.select({ id: job.id }).from(job).where(sql`${job.title} ILIKE ${`%${title}%`}`).limit(1);
  if (!row) throw new Error(`no fixture job "${title}"`);
  return row.id;
}
