/** Builders for tests: a hand-made pool, companies, needs and eligibility rows. Not used by production code. */
import type { NeedCard, SignalCard } from "@/contracts";
import type { Db } from "@/db/client";
import { company, eligibility, job, needCard, signalCard, talent } from "@/db/schema";

export type Req = Partial<NeedCard["requirements"][number]> & { id: string; text: string };

export function requirement(r: Req): NeedCard["requirements"][number] {
  return {
    kind: "must",
    category: "skill",
    escoSkillUris: [],
    postingSentence: null,
    source: "agent",
    languageCode: null,
    statutory: "none",
    question: null,
    pool: null,
    ...r,
  };
}

export async function addCompany(
  db: Db,
  args: { id: string; displayName?: string; token?: string; participating?: boolean },
): Promise<void> {
  await db.insert(company).values({
    id: args.id,
    displayName: args.displayName ?? `Demo company ${args.id}`,
    realName: "Acme Robotics Oy",
    source: "posting",
    masked: true,
    participating: args.participating ?? true,
    digestToken: args.token ?? `token-${args.id}`,
  });
}

export async function addNeed(
  db: Db,
  args: {
    id: string;
    companyId: string;
    title?: string;
    version?: number;
    status?: "draft" | "confirmed" | "stale";
    requirements: Array<Req>;
    sentences?: string[];
    employerName?: string;
  },
): Promise<NeedCard> {
  const jobId = `job_${args.id}`;
  await db.insert(job).values({
    id: jobId,
    source: "tmt",
    sourceId: jobId,
    url: `https://example.invalid/${jobId}`,
    title: args.title ?? "Data engineer",
    employerName: args.employerName ?? "Acme Robotics Oy",
    sentences: args.sentences ?? [],
  });
  const body: NeedCard = {
    id: args.id,
    jobId,
    companyId: args.companyId,
    version: args.version ?? 1,
    title: args.title ?? "Data engineer",
    summary: "Builds and runs data pipelines.",
    lang: "en",
    status: args.status ?? "draft",
    droppedSentences: [],
    requirements: args.requirements.map(requirement),
    confirmedAt: null,
  };
  await db.insert(needCard).values({
    id: args.id,
    jobId,
    companyId: args.companyId,
    version: body.version,
    body,
    status: body.status,
  });
  return body;
}

export type TestSignal = { id: string; phrase: string; escoUri?: string; rendering?: string };

export async function addTalent(
  db: Db,
  args: { id: string; handle?: string; inPool?: boolean; version?: number; signals?: TestSignal[]; purgeAfter?: Date },
): Promise<SignalCard> {
  const signals = args.signals ?? [{ id: "s1", phrase: "Python data pipelines" }];
  await db.insert(talent).values({
    id: args.id,
    handle: args.handle ?? `Birch-${args.id}`,
    synthetic: true,
    inPool: args.inPool ?? true,
    purgeAfter: args.purgeAfter ?? null,
  });
  const body: SignalCard = {
    version: args.version ?? 1,
    status: "approved",
    handle: args.handle ?? `Birch-${args.id}`,
    headline: "Builds data pipelines",
    signals: signals.map((s, i) => ({
      id: s.id,
      phrase: s.phrase,
      phraseOwn: null,
      kind: "skill" as const,
      esco: s.escoUri ? { uri: s.escoUri, labelEn: s.phrase, labelFi: null } : null,
      evidence: [{ turnIndex: 1, sentenceFrom: i + 1, sentenceTo: i + 1 }],
      hasExample: true,
      status: "approved" as const,
      addedBy: "agent" as const,
    })),
    lookingFor: { roles: [], workMode: null, startFrom: null, workLanguages: [] },
    companyView: {
      label: "English rendering",
      summary: "Builds data pipelines.",
      items: signals.map((s) => ({ signalId: s.id, text: s.rendering ?? `${s.phrase} (English rendering).`, stale: false })),
    },
    approvedAt: "2026-11-10T10:00:00.000Z",
  };
  await db.insert(signalCard).values({
    talentId: args.id,
    status: "approved",
    version: body.version,
    body,
    approvedAt: new Date("2026-11-10T10:00:00.000Z"),
  });
  return body;
}

export async function addEligibility(
  db: Db,
  args: { needCardId: string; talentId: string; touched: string[]; eligible?: boolean; needCardVersion?: number; cardVersion?: number },
): Promise<void> {
  await db.insert(eligibility).values({
    needCardId: args.needCardId,
    needCardVersion: args.needCardVersion ?? 1,
    talentId: args.talentId,
    cardVersion: args.cardVersion ?? 1,
    eligible: args.eligible ?? true,
    touchedRequirementIds: args.touched,
  });
}

import { sql } from "drizzle-orm";
import { appMeta, digest, intro, pick } from "@/db/schema";

/** Empty every table these tests touch, so one in-memory database can serve a whole file. */
export async function resetDb(db: Db): Promise<void> {
  await db.execute(
    sql`truncate table company, talent, job, event, audit_log, app_meta, llm_call, job_queue restart identity cascade`,
  );
}

/** A pick from an earlier day (or any day), with an explicit creation time. Creates the digest if needed. */
export async function addPastPick(
  db: Db,
  args: {
    digestDate: string;
    companyId: string;
    needCardId: string;
    talentId: string;
    createdAt: Date;
    status?: "suggested" | "approved" | "removed";
    needCardVersion?: number;
    cardVersion?: number;
  },
): Promise<string> {
  const digestId = `dig_${args.companyId}_${args.digestDate}`;
  await db
    .insert(digest)
    .values({
      id: digestId,
      companyId: args.companyId,
      date: args.digestDate,
      status: "published",
      seed: `seed-${digestId}`,
      publishedBy: "organiser",
      publishedAt: args.createdAt,
    })
    .onConflictDoNothing();
  const id = `pick_${Math.random().toString(36).slice(2, 10)}`;
  await db.insert(pick).values({
    id,
    digestId,
    companyId: args.companyId,
    needCardId: args.needCardId,
    needCardVersion: args.needCardVersion ?? 1,
    talentId: args.talentId,
    cardVersion: args.cardVersion ?? 1,
    origin: "agent",
    body: { reasons: [], notMentioned: [] },
    status: args.status ?? "approved",
    createdAt: args.createdAt,
  });
  return id;
}

export async function setSetting(db: Db, key: string, value: unknown, eventId = "no-event"): Promise<void> {
  await db.insert(appMeta).values({ key: `settings:${eventId}:${key}`, value });
}

export async function addIntro(
  db: Db,
  args: {
    id: string;
    talentId: string;
    companyId: string;
    status: typeof intro.$inferInsert.status;
    needCardId?: string | null;
    pickId?: string | null;
    initiatedBy?: "company" | "talent";
    respondedAt?: Date | null;
    expiresAt?: Date | null;
  },
): Promise<void> {
  await db.insert(intro).values({
    id: args.id,
    talentId: args.talentId,
    companyId: args.companyId,
    needCardId: args.needCardId ?? null,
    pickId: args.pickId ?? null,
    initiatedBy: args.initiatedBy ?? "company",
    status: args.status,
    respondedAt: args.respondedAt ?? null,
    expiresAt: args.expiresAt ?? null,
  });
}
