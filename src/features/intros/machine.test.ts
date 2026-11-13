import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IntroStatus } from "@/contracts";
import { auditLog, intro, talentIdentity } from "@/db/schema";
import { addCompany, addIntro, addTalent, resetDb } from "@/features/picks/test-helpers";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { TRANSITIONS, ruleFor, type Party } from "./machine";
import { transitionIntro, type Mover } from "./service";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());
beforeEach(async () => {
  await resetDb(t.db);
  await addCompany(t.db, { id: "co_1" });
  await addTalent(t.db, { id: "tal_1" });
});

const ALL = IntroStatus.options;
const NOW = new Date("2026-11-20T08:00:00Z");

function mover(party: Party): Mover {
  if (party === "talent") return { party, id: "tal_1" };
  if (party === "company") return { party, id: "co_1" };
  return { party };
}

/** The party the table allows for a rule, given who asked for the introduction. */
function allowedParty(who: string, initiatedBy: "company" | "talent"): Party {
  if (who === "initiator") return initiatedBy;
  if (who === "either_side_or_organiser") return "organiser";
  return who as Party;
}

describe("introduction state machine, every pair of states", () => {
  const pairs = ALL.flatMap((from) => ALL.map((to) => [from, to] as const));

  it("lists exactly the transitions of the spec", () => {
    expect(TRANSITIONS.map((r) => `${r.from}>${r.to}`).sort()).toEqual(
      [
        "pending_review>awaiting_company",
        "pending_review>not_approved",
        "awaiting_talent>accepted",
        "awaiting_talent>declined",
        "awaiting_company>accepted",
        "awaiting_company>declined",
        "awaiting_talent>withdrawn",
        "awaiting_company>withdrawn",
        "awaiting_talent>expired",
        "awaiting_company>expired",
        "accepted>cancelled",
      ].sort(),
    );
  });

  it.each(pairs)("%s -> %s", async (from, to) => {
    const initiatedBy = from === "awaiting_company" || from === "pending_review" ? "talent" : "company";
    await addIntro(t.db, { id: "intro_1", talentId: "tal_1", companyId: "co_1", status: from, initiatedBy });
    await t.db.insert(talentIdentity).values({ talentId: "tal_1", displayName: "Test Person", contact: "x@example.invalid" });
    const rule = ruleFor(from, to);

    if (!rule) {
      for (const party of ["talent", "company", "organiser", "system"] as const) {
        await expect(transitionIntro(t.db, { introId: "intro_1", to, by: mover(party), now: NOW })).rejects.toMatchObject({
          status: 409,
        });
      }
      const [row] = await t.db.select().from(intro).where(eq(intro.id, "intro_1"));
      expect(row.status).toBe(from);
      return;
    }

    // The wrong party is refused with 403 and nothing changes.
    const allowed = allowedParty(rule.who, initiatedBy);
    const wrong = (["talent", "company", "organiser", "system"] as const).filter((p) => {
      if (rule.who === "either_side_or_organiser") return p === "system";
      if (rule.who === "initiator") return p !== initiatedBy;
      return p !== allowed;
    });
    for (const party of wrong) {
      await expect(transitionIntro(t.db, { introId: "intro_1", to, by: mover(party), now: NOW })).rejects.toMatchObject({
        status: 403,
      });
    }
    expect((await t.db.select().from(intro).where(eq(intro.id, "intro_1")))[0].status).toBe(from);

    // The right party moves it, and it is audited.
    const moved = await transitionIntro(t.db, { introId: "intro_1", to, by: mover(allowed), now: NOW });
    expect(moved.status).toBe(to);
    expect(moved.respondedAt).toEqual(NOW);
    if (to === "accepted") {
      expect(moved.acceptedAt).toEqual(NOW);
      expect(moved.revealedAt).toEqual(NOW);
    } else {
      expect(moved.revealedAt).toBeNull();
    }
    const rows = await t.db.select().from(auditLog).where(eq(auditLog.subjectId, "intro_1"));
    const actions = rows.map((r) => r.action).sort();
    if (to === "cancelled") expect(actions).toEqual([]);
    else if (to === "accepted") expect(actions).toEqual(["identity.revealed", "intro.accepted"]);
    else expect(actions).toHaveLength(1);
    for (const r of rows) {
      expect(r.detail).toMatchObject({ introId: "intro_1" });
      expect(JSON.stringify(r.detail)).not.toMatch(/Test Person|example\.invalid/);
    }
  });

  it("refuses a move by a company or person that is not a party to this introduction", async () => {
    await addIntro(t.db, { id: "intro_1", talentId: "tal_1", companyId: "co_1", status: "awaiting_talent" });
    await expect(
      transitionIntro(t.db, { introId: "intro_1", to: "declined", by: { party: "talent", id: "tal_other" }, now: NOW }),
    ).rejects.toMatchObject({ status: 403 });
    await addCompany(t.db, { id: "co_2" });
    await expect(
      transitionIntro(t.db, { introId: "intro_1", to: "withdrawn", by: { party: "company", id: "co_2" }, now: NOW }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("will not accept for a person who has not given a name and contact", async () => {
    await addIntro(t.db, { id: "intro_1", talentId: "tal_1", companyId: "co_1", status: "awaiting_company", initiatedBy: "talent" });
    await expect(
      transitionIntro(t.db, { introId: "intro_1", to: "accepted", by: { party: "company", id: "co_1" }, now: NOW }),
    ).rejects.toMatchObject({ status: 409, code: "identity_needed" });
    expect((await t.db.select().from(intro))[0].status).toBe("awaiting_company");
  });

  it("404s for an unknown introduction", async () => {
    await expect(transitionIntro(t.db, { introId: "nope", to: "declined", by: { party: "system" } })).rejects.toMatchObject({ status: 404 });
  });
});
