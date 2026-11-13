import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PickReason } from "@/contracts";
import { digest, needCard } from "@/db/schema";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";

const cardMock = vi.hoisted(() => ({ revealedFor: [] as string[], removedSignal: false }));
vi.mock("@/features/card", async () => {
  const mock = await import("./card-mock");
  return {
    cardForCompany: async (_db: unknown, id: string) => {
      const card = mock.companyCard(id);
      return cardMock.removedSignal ? { ...card, signals: card.signals.filter((s) => s.id !== "s2") } : card;
    },
    cardForOrganiser: async (_db: unknown, id: string) => mock.organiserCard(id),
    cardForCompanyRevealed: async (_db: unknown, id: string) => {
      cardMock.revealedFor.push(id);
      return mock.revealedCard(id, "Aino Testi");
    },
  };
});

import { requestToMeet, respondToIntro } from "@/features/intros/service";
import { buildCompanyPage } from "./company-view";
import { addCompany, addIntro, addNeed, addPastPick, addTalent, resetDb } from "./test-helpers";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());
beforeEach(async () => {
  await resetDb(t.db);
  cardMock.revealedFor = [];
  cardMock.removedSignal = false;
});

const NOW = new Date("2026-11-20T08:00:00Z");
const reasons = (...ids: Array<[string, string]>): PickReason[] =>
  ids.map(([requirementId, signalId]) => ({
    text: `The card describes ${signalId}, which relates to ${requirementId}.`,
    requirementId,
    signalId,
    evidence: { turnIndex: 1, sentenceFrom: 1, sentenceTo: 1 },
    postingSentence: null,
  }));

async function world(people = ["tal_1"]) {
  await addCompany(t.db, { id: "co_1", displayName: "Demo company 07", token: "tok-1" });
  await addCompany(t.db, { id: "co_2", displayName: "Demo company 08", token: "tok-2" });
  await addNeed(t.db, {
    id: "nc_1",
    companyId: "co_1",
    title: "Data engineer at Acme Robotics Oy",
    employerName: "Acme Robotics Oy",
    sentences: ["Acme Robotics builds data pipelines.", "You write Python every day."],
    requirements: [
      { id: "req_1", text: "Python programming", postingSentence: 1 },
      { id: "req_2", text: "SQL queries", postingSentence: 0 },
      { id: "req_3", text: "Fluent Finnish", category: "language", statutory: "language_act" },
    ],
  });
  await addNeed(t.db, { id: "nc_2", companyId: "co_2", requirements: [{ id: "req_1", text: "Python" }] });
  for (const id of people) {
    await addTalent(t.db, { id, handle: `Maple-${id.slice(-3)}` });
    await addPastPick(t.db, {
      id: `pick_${id}`, digestDate: "2026-11-20", companyId: "co_1", needCardId: "nc_1", talentId: id, createdAt: NOW,
      body: { reasons: reasons(["req_1", "s1"], ["req_2", "s2"]), notMentioned: ["req_3"] },
    });
  }
}

describe("the company page payload", () => {
  it("answers null for an unknown or tampered link", async () => {
    await world();
    expect(await buildCompanyPage(t.db, "nope")).toBeNull();
    expect(await buildCompanyPage(t.db, "tok-1x")).toBeNull();
  });

  it("is marked demo, shows the masked company name and never the real employer (CV1, CV2)", async () => {
    await world();
    const page = (await buildCompanyPage(t.db, "tok-1"))!;
    expect(page.demo).toBe(true);
    expect(page.company.displayName).toBe("Demo company 07");
    const json = JSON.stringify(page);
    expect(json).not.toMatch(/acme|robotics/i);
    expect(json).not.toContain("example.invalid");
    expect(page.needs).toEqual([{ id: "nc_1", title: "Data engineer at the company", summary: "Builds and runs data pipelines.", status: "draft" }]);
    expect(page.digest!.groups[0].picks[0].reasons.find((r) => r.requirementText === "Python programming")?.postingSentence).toBe("You write Python every day.");
    expect(page.digest!.groups[0].picks[0].reasons.find((r) => r.requirementText === "SQL queries")?.postingSentence).toBe("the company builds data pipelines.");
  });

  it("shows no digest until one is published, and then only the latest", async () => {
    await world();
    await t.db.update(digest).set({ status: "draft", publishedAt: null, publishedBy: null });
    expect((await buildCompanyPage(t.db, "tok-1"))!.digest).toBeNull();
    await t.db.update(digest).set({ status: "published", publishedAt: NOW, publishedBy: "organiser" });
    await addTalent(t.db, { id: "tal_9", handle: "Fir-9" });
    await addPastPick(t.db, {
      id: "pick_old", digestDate: "2026-11-10", companyId: "co_1", needCardId: "nc_1", talentId: "tal_9", createdAt: new Date("2026-11-10T08:00:00Z"),
    });
    const page = (await buildCompanyPage(t.db, "tok-1"))!;
    expect(page.digest!.date).toBe("2026-11-20");
    expect(page.digest!.groups.flatMap((g) => g.picks.map((p) => p.id))).toEqual(["pick_tal_1"]);
  });

  it("lists only approved picks, with reasons, requirement chips and not-mentioned items (statutory flagged)", async () => {
    await world(["tal_1", "tal_2"]);
    await addTalent(t.db, { id: "tal_3", handle: "Fir-3" });
    await addPastPick(t.db, { id: "pick_removed", digestDate: "2026-11-20", companyId: "co_1", needCardId: "nc_1", talentId: "tal_3", createdAt: NOW, status: "removed" });
    const page = (await buildCompanyPage(t.db, "tok-1"))!;
    const picks = page.digest!.groups[0].picks;
    expect(picks.map((p) => p.id).sort()).toEqual(["pick_tal_1", "pick_tal_2"]);
    const p = picks[0];
    expect(p.requirements).toEqual([
      { id: "req_1", text: "Python programming", mentioned: true },
      { id: "req_2", text: "SQL queries", mentioned: true },
      { id: "req_3", text: "Fluent Finnish", mentioned: false },
    ]);
    expect(p.notMentioned).toEqual([{ text: "Fluent Finnish", statutory: true }]);
    expect(p.reasons).toHaveLength(2);
    expect(p.reasons[0].rendering).toContain("English rendering");
    expect(p.card.handle).toMatch(/^Maple-/);
  });

  it("has no number, no score and no order that means anything: the order is seeded and differs between digests (CV5)", async () => {
    const people = ["tal_a", "tal_b", "tal_c", "tal_d", "tal_e", "tal_f"];
    await world(people);
    const order = async () => (await buildCompanyPage(t.db, "tok-1"))!.digest!.groups[0].picks.map((x) => x.id).join();
    const first = await order();
    expect(await order()).toBe(first);
    const seen = new Set([first]);
    for (let i = 0; i < 10; i++) {
      await t.db.update(digest).set({ seed: `other-${i}` }).where(eq(digest.companyId, "co_1"));
      seen.add(await order());
    }
    expect(seen.size).toBeGreaterThan(1);
    const walk = (value: unknown, path: string): void => {
      if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`));
      else if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) {
          expect(/^(score|rank|ranking|similarity|overlap|weight|percent|level|count|number|position)$/i.test(k), `${path}.${k}`).toBe(false);
          walk(v, `${path}.${k}`);
        }
      } else expect(typeof value, path).not.toBe("number");
    };
    walk(await buildCompanyPage(t.db, "tok-1"), "page");
  });

  it("drops a reason about a signal the person has since removed from the card", async () => {
    await world();
    cardMock.removedSignal = true;
    const [p] = (await buildCompanyPage(t.db, "tok-1"))!.digest!.groups[0].picks;
    expect(p.reasons.map((r) => r.signalId)).toEqual(["s1"]);
  });

  it("shows empty and nobody-relates states", async () => {
    await addCompany(t.db, { id: "co_1", token: "tok-1" });
    await addNeed(t.db, { id: "nc_1", companyId: "co_1", requirements: [{ id: "req_1", text: "Python" }] });
    await addPastPick(t.db, { digestDate: "2026-11-20", companyId: "co_1", needCardId: "nc_1", talentId: await (async () => { await addTalent(t.db, { id: "tal_x" }); return "tal_x"; })(), createdAt: NOW, status: "removed" });
    await t.db.update(digest).set({ emptyNeeds: ["nc_1"] });
    const page = (await buildCompanyPage(t.db, "tok-1"))!;
    expect(page.digest!.groups).toMatchObject([{ needCardId: "nc_1", nobodyRelates: true, picks: [] }]);
  });
});

describe("before and after both sides agree", () => {
  const CANARY = /Aino|aino@|QUOTE-|nightly load myself|"fi"|voice|interviewLang|inputMode/;

  it("before acceptance the payload carries no identity, quote, language or input mode, and the card feature is not asked for them", async () => {
    await world();
    const asked = await requestToMeet(t.db, { token: "tok-1", pickId: "pick_tal_1", now: NOW });
    const page = (await buildCompanyPage(t.db, "tok-1"))!;
    const p = page.digest!.groups[0].picks[0];
    expect(p.intro).toMatchObject({ id: asked.id, status: "awaiting_talent" });
    expect(p.canAsk).toBe(false);
    expect(p.revealed).toBeNull();
    expect(JSON.stringify(page)).not.toMatch(CANARY);
    expect(cardMock.revealedFor).toEqual([]);
  });

  it("a declined request reveals nothing", async () => {
    await world();
    const { id } = await requestToMeet(t.db, { token: "tok-1", pickId: "pick_tal_1", now: NOW });
    await respondToIntro(t.db, { introId: id, talentId: "tal_1", answer: { decision: "decline" }, now: NOW });
    const page = (await buildCompanyPage(t.db, "tok-1"))!;
    expect(page.digest!.groups[0].picks[0]).toMatchObject({ intro: { status: "declined" }, revealed: null, canAsk: false });
    expect(JSON.stringify(page)).not.toMatch(CANARY);
    expect(cardMock.revealedFor).toEqual([]);
  });

  it("after acceptance the name, contact and their own words appear, for that pair only, and still no language or input mode", async () => {
    await world(["tal_1", "tal_2"]);
    const { id } = await requestToMeet(t.db, { token: "tok-1", pickId: "pick_tal_1", now: NOW });
    await respondToIntro(t.db, { introId: id, talentId: "tal_1", answer: { decision: "accept", name: "Aino Testi", contact: "aino@example.invalid" }, now: NOW });
    const page = (await buildCompanyPage(t.db, "tok-1"))!;
    const [first, second] = page.digest!.groups[0].picks.sort((a, b) => a.id.localeCompare(b.id));
    expect(first.revealed).toMatchObject({ name: "Aino Testi", contact: "aino@example.invalid" });
    expect(first.revealed!.signals[0].quotes[0]).toContain("QUOTE-");
    expect(first.intro).toMatchObject({ status: "accepted" });
    // The other person on the same page stays hidden.
    expect(second.revealed).toBeNull();
    expect(cardMock.revealedFor).toEqual(["tal_1"]);
    const json = JSON.stringify(page);
    expect(json).not.toMatch(/interviewLang|inputMode|"fi"|"voice"/);

    // Another company that also picked tal_1 sees nothing of this.
    await addPastPick(t.db, { id: "pick_co2", digestDate: "2026-11-20", companyId: "co_2", needCardId: "nc_2", talentId: "tal_1", createdAt: NOW, body: { reasons: [], notMentioned: [] } });
    const other = (await buildCompanyPage(t.db, "tok-2"))!;
    expect(JSON.stringify(other)).not.toMatch(CANARY);
    expect(other.digest!.groups.flatMap((g) => g.picks)[0].revealed).toBeNull();
    expect(cardMock.revealedFor).toEqual(["tal_1"]);
  });

  it("an accepted introduction that was later cancelled shows nothing again", async () => {
    await world();
    await addIntro(t.db, { id: "intro_1", talentId: "tal_1", companyId: "co_1", status: "cancelled" });
    const [p] = (await buildCompanyPage(t.db, "tok-1"))!.digest!.groups[0].picks;
    expect(p.revealed).toBeNull();
    expect(p.canAsk).toBe(false);
  });

  it("lets the company ask again after a withdrawal or expiry", async () => {
    await world();
    await addIntro(t.db, { id: "intro_1", talentId: "tal_1", companyId: "co_1", status: "expired" });
    expect((await buildCompanyPage(t.db, "tok-1"))!.digest!.groups[0].picks[0].canAsk).toBe(true);
  });

  it("masks the employer inside stored reason text", async () => {
    await world();
    await t.db.update(needCard).set({
      body: sql`jsonb_set(body, '{requirements,0,text}', '"Python at Acme Robotics data platform"')`,
    }).where(eq(needCard.id, "nc_1"));
    await t.db.execute(sql`update pick set body = jsonb_set(body, '{reasons,0,text}', '"The card describes Python, which relates to Python at Acme Robotics data platform."')`);
    const page = (await buildCompanyPage(t.db, "tok-1"))!;
    expect(JSON.stringify(page)).not.toMatch(/acme|robotics/i);
  });

  it("keeps reasons and chips after the company saves the need (version bump)", async () => {
    await world();
    await t.db.update(needCard).set({ version: 2, status: "confirmed" }).where(eq(needCard.id, "nc_1"));
    const [p] = (await buildCompanyPage(t.db, "tok-1"))!.digest!.groups[0].picks;
    expect(p.reasons).toHaveLength(2);
    expect(p.requirements).toHaveLength(3);
    expect(p.notMentioned).toEqual([{ text: "Fluent Finnish", statutory: true }]);
  });

  it("lists not-mentioned requirements must-first", async () => {
    await world();
    await t.db.execute(sql`update pick set body = jsonb_set(body, '{notMentioned}', '["req_4","req_3"]')`);
    const [row] = await t.db.select().from(needCard).where(eq(needCard.id, "nc_1"));
    const body = row.body as { requirements: Array<{ id: string; text: string; kind: string }> };
    const req = (id: string) => body.requirements.find((r) => r.id === id)!;
    req("req_3").kind = "must";
    req("req_1").kind = "nice";
    body.requirements = [req("req_1"), req("req_2"), req("req_3")].map((r) => ({ ...r }));
    body.requirements[0].id = "req_4";
    body.requirements[0].text = "Airflow";
    await t.db.update(needCard).set({ body: body as never }).where(eq(needCard.id, "nc_1"));
    const [p] = (await buildCompanyPage(t.db, "tok-1"))!.digest!.groups[0].picks;
    expect(p.notMentioned.map((n) => n.text)).toEqual(["Fluent Finnish", "Airflow"]);
  });
});
