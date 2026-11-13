import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, intro, talentIdentity } from "@/db/schema";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";

const cardMock = vi.hoisted(() => ({ revealedCalls: 0 }));
vi.mock("@/features/card", async () => {
  const mock = await import("@/features/picks/card-mock");
  return {
    cardForCompany: async (_db: unknown, id: string) => mock.companyCard(id),
    cardForOrganiser: async (_db: unknown, id: string) => mock.organiserCard(id),
    cardForCompanyRevealed: async (db: { select: unknown }, id: string) => {
      cardMock.revealedCalls++;
      return mock.revealedCard(id, "Aino Testi");
    },
  };
});

import { addCompany, addIntro, addNeed, addPastPick, addTalent, resetDb } from "@/features/picks/test-helpers";
import { introsForTalent } from ".";
import { TalentAnswer, requestToMeet, respondToIntro } from "./service";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());
beforeEach(async () => {
  await resetDb(t.db);
  cardMock.revealedCalls = 0;
});

const NOW = new Date("2026-11-20T08:00:00Z");
const HOUR = 3_600_000;

async function world() {
  await addCompany(t.db, { id: "co_1", token: "tok-1" });
  await addCompany(t.db, { id: "co_2", token: "tok-2" });
  await addNeed(t.db, { id: "nc_1", companyId: "co_1", requirements: [{ id: "req_1", text: "Python" }] });
  await addNeed(t.db, { id: "nc_2", companyId: "co_2", requirements: [{ id: "req_1", text: "Python" }] });
  await addTalent(t.db, { id: "tal_1" });
  await addTalent(t.db, { id: "tal_2" });
  await addPastPick(t.db, { id: "pick_ok", digestDate: "2026-11-20", companyId: "co_1", needCardId: "nc_1", talentId: "tal_1", createdAt: NOW });
  await addPastPick(t.db, { id: "pick_other_company", digestDate: "2026-11-20", companyId: "co_2", needCardId: "nc_2", talentId: "tal_1", createdAt: NOW });
  await addPastPick(t.db, { id: "pick_suggested", digestDate: "2026-11-20", companyId: "co_1", needCardId: "nc_1", talentId: "tal_2", createdAt: NOW, status: "suggested" });
}
const audits = async (action: string) => t.db.select().from(auditLog).where(eq(auditLog.action, action as never));

describe("a company asks to meet", () => {
  it("creates an introduction awaiting the person, expiring in 72 hours, and audits it as the company", async () => {
    await world();
    const result = await requestToMeet(t.db, { token: "tok-1", pickId: "pick_ok", now: NOW });
    expect(result).toMatchObject({ status: "awaiting_talent", expiresAt: new Date(NOW.getTime() + 72 * HOUR).toISOString() });
    const [row] = await t.db.select().from(intro);
    expect(row).toMatchObject({ talentId: "tal_1", companyId: "co_1", needCardId: "nc_1", pickId: "pick_ok", initiatedBy: "company", status: "awaiting_talent" });
    expect(row.acceptedAt).toBeNull();
    expect(row.revealedAt).toBeNull();
    const [a] = await audits("intro.requested");
    expect(a).toMatchObject({ actor: "company:co_1", subjectType: "intro", subjectId: row.id });
  });

  it("refuses an unknown link, someone else's pick, an undecided pick and a pick in a draft digest (the company cannot ask for someone outside its approved picks)", async () => {
    await world();
    await expect(requestToMeet(t.db, { token: "nope", pickId: "pick_ok", now: NOW })).rejects.toMatchObject({ status: 404 });
    // pick_other_company belongs to co_2
    await expect(requestToMeet(t.db, { token: "tok-1", pickId: "pick_other_company", now: NOW })).rejects.toMatchObject({ status: 403 });
    await expect(requestToMeet(t.db, { token: "tok-1", pickId: "pick_suggested", now: NOW })).rejects.toMatchObject({ status: 403 });
    await expect(requestToMeet(t.db, { token: "tok-1", pickId: "pick_missing", now: NOW })).rejects.toMatchObject({ status: 403 });
    await addTalent(t.db, { id: "tal_3" });
    await addPastPick(t.db, { id: "pick_draft", digestDate: "2026-11-21", companyId: "co_1", needCardId: "nc_1", talentId: "tal_3", createdAt: NOW, digestStatus: "draft" });
    await expect(requestToMeet(t.db, { token: "tok-1", pickId: "pick_draft", now: NOW })).rejects.toMatchObject({ status: 403 });
    expect(await t.db.select().from(intro)).toHaveLength(0);
  });

  it("refuses a second request while one is open, after acceptance, and for a month after a decline, but allows one after a withdrawal", async () => {
    await world();
    await requestToMeet(t.db, { token: "tok-1", pickId: "pick_ok", now: NOW });
    await expect(requestToMeet(t.db, { token: "tok-1", pickId: "pick_ok", now: NOW })).rejects.toMatchObject({ status: 409 });
    await t.db.update(intro).set({ status: "declined", respondedAt: NOW });
    await expect(requestToMeet(t.db, { token: "tok-1", pickId: "pick_ok", now: new Date(NOW.getTime() + 10 * 24 * HOUR) })).rejects.toMatchObject({ status: 409 });
    await t.db.update(intro).set({ status: "withdrawn" });
    await expect(requestToMeet(t.db, { token: "tok-1", pickId: "pick_ok", now: NOW })).resolves.toMatchObject({ status: "awaiting_talent" });
  });

  it("expires before the event when the event is close", async () => {
    await world();
    const { matchEvent } = await import("@/db/schema");
    await t.db.insert(matchEvent).values({
      id: "ev_1", name: "Demo", date: "2026-11-22", format: "in_person",
      startsAt: new Date(NOW.getTime() + 48 * HOUR), endsAt: new Date(NOW.getTime() + 52 * HOUR),
    });
    const result = await requestToMeet(t.db, { token: "tok-1", pickId: "pick_ok", now: NOW });
    expect(result.expiresAt).toBe(new Date(NOW.getTime() + 24 * HOUR).toISOString());
  });
});

describe("the person answers", () => {
  async function asked() {
    await world();
    return (await requestToMeet(t.db, { token: "tok-1", pickId: "pick_ok", now: NOW })).id;
  }

  it("accepting stores name and contact, sets acceptedAt and revealedAt, and audits intro.accepted and identity.revealed without the name", async () => {
    const id = await asked();
    const later = new Date(NOW.getTime() + HOUR);
    const result = await respondToIntro(t.db, { introId: id, talentId: "tal_1", answer: { decision: "accept", name: "Aino Testi", contact: "aino@example.invalid" }, now: later });
    expect(result).toEqual({ id, status: "accepted" });
    const [row] = await t.db.select().from(intro);
    expect(row.acceptedAt).toEqual(later);
    expect(row.revealedAt).toEqual(later);
    const [ident] = await t.db.select().from(talentIdentity);
    expect(ident).toMatchObject({ talentId: "tal_1", displayName: "Aino Testi", contact: "aino@example.invalid" });
    const accepted = await audits("intro.accepted");
    const revealed = await audits("identity.revealed");
    expect(accepted).toHaveLength(1);
    expect(revealed).toHaveLength(1);
    expect(accepted[0]).toMatchObject({ actor: "talent:tal_1" });
    expect(revealed[0].detail).toEqual({ introId: id, talentId: "tal_1", companyId: "co_1" });
    expect(JSON.stringify([...accepted, ...revealed])).not.toMatch(/Aino|example\.invalid/);
  });

  it("declining reveals nothing: no identity row, no reveal time, no identity audit row", async () => {
    const id = await asked();
    const result = await respondToIntro(t.db, { introId: id, talentId: "tal_1", answer: { decision: "decline" }, now: NOW });
    expect(result.status).toBe("declined");
    const [row] = await t.db.select().from(intro);
    expect(row).toMatchObject({ status: "declined", acceptedAt: null, revealedAt: null });
    expect(await t.db.select().from(talentIdentity)).toHaveLength(0);
    expect(await audits("identity.revealed")).toHaveLength(0);
    expect(await audits("intro.declined")).toHaveLength(1);
  });

  it("answers 403 to another person, 404 to an unknown request, 409 to a second answer", async () => {
    const id = await asked();
    await expect(respondToIntro(t.db, { introId: id, talentId: "tal_2", answer: { decision: "decline" } })).rejects.toMatchObject({ status: 403 });
    await expect(respondToIntro(t.db, { introId: "nope", talentId: "tal_1", answer: { decision: "decline" } })).rejects.toMatchObject({ status: 404 });
    await respondToIntro(t.db, { introId: id, talentId: "tal_1", answer: { decision: "decline" } });
    await expect(respondToIntro(t.db, { introId: id, talentId: "tal_1", answer: { decision: "accept", name: "A B", contact: "a@b.invalid" } })).rejects.toMatchObject({ status: 409 });
    expect(await t.db.select().from(talentIdentity)).toHaveLength(0);
  });

  it("needs a name and a contact to accept", () => {
    expect(TalentAnswer.safeParse({ decision: "accept" }).success).toBe(false);
    expect(TalentAnswer.safeParse({ decision: "accept", name: "A" }).success).toBe(false);
    expect(TalentAnswer.safeParse({ decision: "accept", name: " ", contact: "a@b.invalid" }).success).toBe(false);
    expect(TalentAnswer.safeParse({ decision: "accept", name: "Aino", contact: "aino@example.invalid" }).success).toBe(true);
    expect(TalentAnswer.safeParse({ decision: "decline" }).success).toBe(true);
    expect(TalentAnswer.safeParse({ decision: "decline", name: "Aino" }).success).toBe(false);
  });
});

describe("introsForTalent", () => {
  it("lists only that person's introductions, newest first, without the organiser's note", async () => {
    await world();
    await addIntro(t.db, { id: "intro_a", talentId: "tal_1", companyId: "co_1", status: "pending_review", initiatedBy: "talent" });
    await t.db.update(intro).set({
      requestedAt: new Date("2026-11-01T00:00:00Z"),
      organiserDecision: { by: "organiser", at: "2026-11-02T00:00:00Z", reasonCode: "need_unrelated", note: "private words" },
    });
    await addIntro(t.db, { id: "intro_b", talentId: "tal_1", companyId: "co_2", status: "awaiting_talent" });
    await addIntro(t.db, { id: "intro_c", talentId: "tal_2", companyId: "co_1", status: "awaiting_talent" });
    const list = await introsForTalent(t.db, "tal_1");
    expect(list.map((i) => i.id)).toEqual(["intro_b", "intro_a"]);
    expect(JSON.stringify(list)).not.toContain("private words");
    expect(list[1].organiserDecision).toMatchObject({ reasonCode: "need_unrelated", note: null });
  });
});
