import { and, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { AUDIT_ACTIONS, type AuditAction } from "@/contracts";
import type { Db } from "@/db/client";
import { auditLog, company, digest, pick, talent } from "@/db/schema";
import { HttpError } from "@/lib/http";

/** Audit entries per page. */
export const AUDIT_PAGE_SIZE = 100;

export type AuditRow = {
  id: number;
  at: string;
  actor: string;
  action: string;
  subjectType: string;
  subjectId: string;
  /** The detail as stored: ids and counts. */
  detail: Record<string, unknown>;
  /** True for history written by the demo seed, not by a person's action. */
  seeded: boolean;
};

export type AuditPage = { rows: AuditRow[]; nextBefore: number | null };

export function parseAuditAction(value: string | null | undefined): AuditAction | null {
  if (!value) return null;
  if (!(AUDIT_ACTIONS as readonly string[]).includes(value)) throw new HttpError(400, "invalid_action", "Unknown audit action");
  return value as AuditAction;
}

export function parseAuditBefore(value: string | null | undefined): number | null {
  if (!value) return null;
  if (!/^\d{1,15}$/.test(value)) throw new HttpError(400, "invalid_before", "before must be the id of an audit row");
  return Number(value);
}

/** Newest first, `AUDIT_PAGE_SIZE` at a time. `before` is the id of the last row of the page already shown. */
export async function listAudit(db: Db, args: { action?: AuditAction | null; before?: number | null } = {}): Promise<AuditPage> {
  const conditions = [];
  if (args.action) conditions.push(eq(auditLog.action, args.action));
  if (args.before != null) {
    // Compared inside the database: a JavaScript Date would lose the microseconds of `at`.
    conditions.push(
      sql`(${auditLog.at}, ${auditLog.id}) < (select a.at, a.id from audit_log a where a.id = ${args.before})`,
    );
  }
  const found = await db
    .select()
    .from(auditLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(AUDIT_PAGE_SIZE + 1);
  const page = found.slice(0, AUDIT_PAGE_SIZE);
  const rows: AuditRow[] = page.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    actor: r.actor,
    action: r.action,
    subjectType: r.subjectType,
    subjectId: r.subjectId,
    detail: withoutHiddenKeys(r.detail),
    seeded: r.detail?.seeded === true,
  }));
  return { rows, nextBefore: found.length > AUDIT_PAGE_SIZE ? rows[rows.length - 1].id : null };
}

/** Keys that would show interview language or input mode (voice consent is the precondition for voice). Never shown to organisers. */
const HIDDEN_DETAIL_KEYS = new Set(
  ["voice", "voicevendor", "lang", "language", "interviewlang", "interviewlanguage", "inputmode", "consent"],
);

function withoutHiddenKeys(detail: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail ?? {})) {
    if (!HIDDEN_DETAIL_KEYS.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

export const EXPOSURE_BANDS = ["never", "few", "several", "many"] as const;
export type ExposureBand = (typeof EXPOSURE_BANDS)[number];

export type ExposureView = {
  windowDays: number;
  /** Always the four bands, in this order. Handles are alphabetical. No counts per person. */
  bands: Array<{ band: ExposureBand; handles: string[] }>;
  poolSize: number;
};

export const EXPOSURE_WINDOW_DAYS = 7;

function bandOf(picks: number): ExposureBand {
  if (picks === 0) return "never";
  if (picks <= 2) return "few";
  if (picks <= 5) return "several";
  return "many";
}

/**
 * Who in the pool has been suggested how often in the last seven days, in bands. Each band lists
 * handles alphabetically; nothing else orders people and no per-person number leaves this function.
 */
export async function buildExposure(db: Db, now: Date = new Date()): Promise<ExposureView> {
  const since = new Date(now.getTime() - EXPOSURE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const people = await db.select({ id: talent.id, handle: talent.handle }).from(talent).where(eq(talent.inPool, true));
  const counts = new Map<string, number>();
  if (people.length > 0) {
    const rows = await db
      .select({ talentId: pick.talentId, n: count() })
      .from(pick)
      .where(and(inArray(pick.talentId, people.map((p) => p.id)), gt(pick.createdAt, since)))
      .groupBy(pick.talentId);
    for (const r of rows) counts.set(r.talentId, Number(r.n));
  }
  const byBand = new Map<ExposureBand, string[]>(EXPOSURE_BANDS.map((b) => [b, []]));
  for (const p of people) byBand.get(bandOf(counts.get(p.id) ?? 0))!.push(p.handle);
  return {
    windowDays: EXPOSURE_WINDOW_DAYS,
    bands: EXPOSURE_BANDS.map((band) => ({ band, handles: byBand.get(band)!.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) })),
    poolSize: people.length,
  };
}

export type OrganiserCounts = { poolPeople: number; companies: number; digestsWaiting: number };

/** The three numbers on the organiser's start page. Aggregates only. */
export async function organiserCounts(db: Db): Promise<OrganiserCounts> {
  const [pool] = await db.select({ n: count() }).from(talent).where(eq(talent.inPool, true));
  const [companies] = await db.select({ n: count() }).from(company).where(eq(company.participating, true));
  const [waiting] = await db
    .select({ n: sql<number>`count(distinct ${digest.id})` })
    .from(digest)
    .innerJoin(pick, eq(pick.digestId, digest.id))
    .where(eq(digest.status, "draft"));
  return { poolPeople: Number(pool.n), companies: Number(companies.n), digestsWaiting: Number(waiting.n) };
}
