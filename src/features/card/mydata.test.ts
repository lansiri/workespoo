import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { auditLog, company, consent, intro, jobQueue, notification, talent, talentIdentity, turn } from "@/db/schema";
import { audit, listAudit } from "@/lib/audit";
import { recordConsent } from "@/lib/consent";
import { enqueue } from "@/lib/queue";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { approveCard } from "./approval";
import { deletePerson, exportPersonData } from "./mydata";
import { seedCard, seedInterview, signal } from "./test-helpers";

let t: TestDb;
const ME = "tal_test00000001";
const OTHER = "tal_other0000001";
beforeAll(async () => {
  t = await createTestDb();
}, 120_000);
afterAll(() => t.close());

beforeEach(async () => {
  await t.db.delete(talent);
  await t.db.delete(auditLog);
  await t.db.delete(jobQueue);
  await t.db.delete(consent);
  await t.db.delete(notification);
  await t.db.delete(company);
  for (const [talentId, interviewId, handle] of [[ME, "int_test00000001", "Birch-27"], [OTHER, "int_other0000001", "Fern-31"]]) {
    await seedInterview(t.db, { talentId, interviewId, handle });
    await seedCard(t.db, talentId, { status: "draft", signals: [signal({ id: "s1", phrase: "Receiving goods" })] });
    await approveCard(t.db, talentId);
    await seedCard(t.db, talentId, { status: "draft", version: 2, signals: [signal({ id: "s1", phrase: "Receiving goods" })] });
    await recordConsent(t.db, { subjectType: "talent", subjectId: talentId, kind: "interview" });
    await t.db.insert(notification).values({ id: `ntf_${talentId}`, recipientType: "talent", recipientId: talentId, kind: "x", payload: {} });
  }
  await t.db.insert(company).values({ id: "cmp_000000001", displayName: "A logistics company", source: "synthetic", digestToken: "tok1" });
  await t.db.insert(intro).values({ id: "int2_00000001", talentId: ME, companyId: "cmp_000000001", initiatedBy: "company", status: "pending_talent" as never });
  await t.db.insert(intro).values({ id: "int2_00000002", talentId: OTHER, companyId: "cmp_000000001", initiatedBy: "company", status: "pending_talent" as never });
  await t.db.insert(talentIdentity).values({ talentId: ME, displayName: "Aino Virtanen", contact: "aino@example.org" });
  // a redacted turn
  await t.db.update(turn).set({ redactedAt: new Date(), text: "", sentences: [] }).where(eq(turn.id, "trn_int_test00000001_3"));
  await enqueue(t.db, "card.render", { talentId: ME, signalId: "s1", cardVersion: 2 });
  await enqueue(t.db, "card.render", { talentId: OTHER, signalId: "s1", cardVersion: 2 });
  await audit(t.db, { actor: "company:cmp_000000001", action: "identity.revealed", subjectType: "intro", subjectId: "int2_00000001", detail: { introId: "int2_00000001", talentId: ME } });
  await audit(t.db, { actor: "system", action: "eligibility.computed", subjectType: "talent", subjectId: ME, detail: { n: 1 } });
  await audit(t.db, { actor: "system", action: "eligibility.computed", subjectType: "talent", subjectId: OTHER, detail: { n: 1 } });
});

describe("exportPersonData", () => {
  it("holds the person's own data only and keeps redacted turns redacted", async () => {
    const data = await exportPersonData(t.db, ME);
    expect(data.cards.map((c) => c.status).sort()).toEqual(["approved", "draft"]);
    expect(data.signals.map((s) => s.id)).toEqual(["s1"]);
    expect(data.transcript).toHaveLength(1);
    const turns = data.transcript[0].turns;
    expect(turns.find((x) => x.index === 3)).toMatchObject({ redacted: true, text: null, sentences: [] });
    expect(turns.find((x) => x.index === 1)?.text).toContain("logistics centre");
    expect(data.consents.map((c) => c.kind)).toEqual(["interview"]);
    expect(data.introductions).toEqual([expect.objectContaining({ id: "int2_00000001", status: "pending_talent", company: "A logistics company" })]);
    expect(data.audit.some((a) => a.action === "card.approved")).toBe(true);
    const text = JSON.stringify(data);
    expect(text).not.toContain(OTHER);
    expect(text).not.toContain("Fern-31");
    expect(text).not.toContain("int2_00000002");
    expect(data.identity).toMatchObject({ displayName: "Aino Virtanen", contact: "aino@example.org" });
    expect(data.person).toMatchObject({ synthetic: false, liveDemo: false, purgeAfter: null });
    expect(data.audit.some((a) => a.action === "identity.revealed")).toBe(true); // written by the company, about this person
    expect(await listAudit(t.db, { action: "data.exported" })).toHaveLength(1);
  });
});

describe("deletePerson", () => {
  it("leaves no row with the person's id outside the audit log, keeps others, and audits counts only", async () => {
    expect(await deletePerson(t.db, ME)).toEqual({ deleted: true });
    const tables = (await t.db.execute(sql`select tablename from pg_tables where schemaname = 'public'`)) as unknown as { rows?: Array<{ tablename: string }> } | Array<{ tablename: string }>;
    const names = (Array.isArray(tables) ? tables : tables.rows ?? []).map((r) => r.tablename).filter((n) => n !== "audit_log");
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) {
      const res = (await t.db.execute(sql.raw(`select count(*)::int as n from "${name}" x where x::text like '%${ME}%'`))) as unknown as { rows?: Array<{ n: number }> } | Array<{ n: number }>;
      const n = (Array.isArray(res) ? res : res.rows ?? [])[0].n;
      expect({ name, n }).toEqual({ name, n: 0 });
    }
    // the other person is untouched
    expect((await t.db.select().from(talent)).map((r) => r.id)).toEqual([OTHER]);
    expect(await t.db.select().from(intro)).toHaveLength(1);
    expect(await t.db.select().from(consent)).toHaveLength(1);
    expect((await t.db.select().from(jobQueue)).every((j) => (j.payload as { talentId: string }).talentId === OTHER)).toBe(true);

    const rows = await t.db.select().from(auditLog).where(eq(auditLog.subjectId, ME));
    const deleted = rows.filter((r) => r.action === "talent.deleted");
    expect(deleted).toHaveLength(1);
    expect(deleted[0].detail).toEqual({ interviews: 1, signals: 1, cards: 2, introductions: 1 });
    for (const r of rows) {
      for (const v of Object.values(r.detail)) expect(typeof v === "number" || typeof v === "string" && v.length < 20).toBe(true);
      expect(JSON.stringify(r.detail)).not.toMatch(/logistics|Aino|aino@/);
    }
  });

  it("is harmless for an unknown person", async () => {
    expect(await deletePerson(t.db, "tal_nobody000001")).toEqual({ deleted: false });
  });
});
