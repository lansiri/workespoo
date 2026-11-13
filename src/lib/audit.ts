import { and, desc, eq, lt } from "drizzle-orm";
import type { Actor, AuditAction, AuditEvent, SubjectType } from "@/contracts";
import type { Db } from "@/db/client";
import { auditLog } from "@/db/schema";
import { getEnv } from "@/lib/env";

const EMAIL = /[^\s@<>()[\]"']+@[^\s@<>()[\]"']+\.[A-Za-z]{2,}/;
const ISO_DATE = /\d{4}-\d{2}-\d{2}(?:[T ]\d{2}(?::\d{2}(?::\d{2}(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/g;
const PHONE_CANDIDATE = /\+?\d[\d\s().-]{6,}\d/g;

/** Private check, deliberately independent of src/lib/redact.ts. */
function hasContact(text: string): boolean {
  if (EMAIL.test(text)) return true;
  const stripped = text.replace(ISO_DATE, " ");
  for (const m of stripped.matchAll(PHONE_CANDIDATE)) {
    const candidate = m[0];
    const digits = candidate.replace(/\D/g, "").length;
    if (digits < 8 || digits > 15) continue;
    if (candidate.startsWith("+") || /[\s().-]/.test(candidate)) return true;
  }
  // Unseparated national numbers such as 0401234567.
  return /(?<![\w.])0\d{8,10}(?![\w.])/.test(stripped);
}

function containsContactDeep(value: unknown): boolean {
  if (typeof value === "string") return hasContact(value);
  if (Array.isArray(value)) return value.some(containsContactDeep);
  if (value && typeof value === "object") return Object.values(value).some(containsContactDeep);
  return false;
}

function stripContacts(value: unknown): unknown {
  if (typeof value === "string") return hasContact(value) ? "[removed]" : value;
  if (Array.isArray(value)) return value.map(stripContacts);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripContacts(v)]));
  }
  return value;
}

export async function audit(
  db: Db,
  event: {
    actor: Actor;
    action: AuditAction;
    subjectType: SubjectType;
    subjectId: string;
    /** Ids and counts only: never transcript text, names or contacts. */
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  let detail = event.detail ?? {};
  if (containsContactDeep(detail)) {
    if (getEnv().NODE_ENV === "test") {
      throw new Error(`audit detail for ${event.action} contains an email address or phone number`);
    }
    console.warn(`[audit] detail for ${event.action} contained a contact detail; stripped`);
    detail = stripContacts(detail) as Record<string, unknown>;
  }
  await db.insert(auditLog).values({
    actor: event.actor,
    action: event.action,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    detail,
  });
}

/** Newest first, default limit 100. */
export async function listAudit(
  db: Db,
  filter: { subjectType?: SubjectType; subjectId?: string; action?: AuditAction; limit?: number; beforeId?: number } = {},
): Promise<AuditEvent[]> {
  const conditions = [
    filter.subjectType ? eq(auditLog.subjectType, filter.subjectType) : undefined,
    filter.subjectId ? eq(auditLog.subjectId, filter.subjectId) : undefined,
    filter.action ? eq(auditLog.action, filter.action) : undefined,
    filter.beforeId !== undefined ? lt(auditLog.id, filter.beforeId) : undefined,
  ].filter((c) => c !== undefined);
  const rows = await db
    .select()
    .from(auditLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(filter.limit ?? 100);
  return rows.map((r) => ({
    id: String(r.id),
    at: r.at.toISOString(),
    actor: r.actor,
    action: r.action,
    subjectType: r.subjectType,
    subjectId: r.subjectId,
    detail: r.detail,
  }));
}
