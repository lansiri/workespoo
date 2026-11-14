import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { PinnedPosition, RequirementKind } from "@/contracts";
import type { Db } from "@/db/client";
import { applicantRanking, application, auditLog, needCard, talentIdentity } from "@/db/schema";
import { transitionIntro } from "@/features/intros/service";
import { addCompany, addIntro, addNeed, addTalent, resetDb } from "@/features/picks/test-helpers";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";

// `requirements.ts` is built elsewhere: the kinds are read from the Need Card here.
vi.mock("./requirements", () => ({
  currentRequirementKinds: async (db: Db, jobId: string) => {
    const [row] = await db.select({ body: needCard.body }).from(needCard).where(eq(needCard.jobId, jobId));
    return new Map<string, RequirementKind>((row?.body.requirements ?? []).map((r) => [r.id, r.kind]));
  },
}));

import {
  applicantsForCompany,
  applicationPoints,
  approveRanking,
  askToMeetApplicant,
  evidenceForOrganiser,
  listJobsWithApplicants,
  moveApplicant,
  orderApplicants,
  ownPosition,
  rankedListForJob,
  unpinApplicant,
} from "./rank";
import { REQS, addApplication } from "./rank-fixtures";

const kinds = new Map<string, RequirementKind>([
  ["r1", "must"],
  ["r2", "must"],
  ["r3", "nice"],
]);
const pin = (applicationId: string, position: number, at = "2026-11-14T12:00:00.000Z"): PinnedPosition => ({ applicationId, position, reason: "Because.", at });

describe("applicationPoints", () => {
  it("weighs must 2 and nice 1, and counts nothing for a requirement no longer on the card", () => {
    const ratings = [
      { requirementId: "r1", level: 3 },
      { requirementId: "r2", level: 1 },
      { requirementId: "r3", level: 2 },
      { requirementId: "gone", level: 3 },
    ];
    expect(applicationPoints(ratings, kinds)).toEqual({ points: 2 * 3 + 2 * 1 + 1 * 2, maxPoints: 6 + 6 + 3, mustAtExample: 1 });
  });

  it("follows the kind it is given", () => {
    const ratings = [{ requirementId: "r1", level: 3 }];
    expect(applicationPoints(ratings, new Map([["r1", "nice"]]))).toEqual({ points: 3, maxPoints: 3, mustAtExample: 0 });
  });

  it("is zero for no ratings", () => {
    expect(applicationPoints([], kinds)).toEqual({ points: 0, maxPoints: 0, mustAtExample: 0 });
  });
});

describe("orderApplicants", () => {
  const a = (applicationId: string, points: number, mustAtExample: number, submittedAt: string) => ({ applicationId, points, mustAtExample, submittedAt });

  it("orders by points, then must-haves at example, then the earlier submission", () => {
    const order = orderApplicants(
      [
        a("late", 8, 1, "2026-11-14T11:00:00Z"),
        a("early", 8, 1, "2026-11-14T09:00:00Z"),
        a("musts", 8, 2, "2026-11-14T12:00:00Z"),
        a("top", 9, 0, "2026-11-14T13:00:00Z"),
        a("low", 1, 0, "2026-11-14T08:00:00Z"),
      ],
      [],
    );
    expect(order).toEqual(["top", "musts", "early", "late", "low"]);
  });

  const base = [a("a", 9, 1, "2026-11-14T08:00:00Z"), a("b", 8, 1, "2026-11-14T08:00:00Z"), a("c", 7, 1, "2026-11-14T08:00:00Z"), a("d", 6, 1, "2026-11-14T08:00:00Z")];

  it("puts several pinned applicants at their positions, lowest first", () => {
    expect(orderApplicants(base, [pin("d", 1), pin("a", 3)])).toEqual(["d", "b", "a", "c"]);
  });

  it("puts a pin past the end last, and two such pins in the order of their positions", () => {
    expect(orderApplicants(base, [pin("a", 99), pin("b", 50)])).toEqual(["c", "d", "b", "a"]);
  });

  it("ignores a pin for an unknown application and keeps only the later pin of one person", () => {
    expect(orderApplicants(base, [pin("ghost", 1)])).toEqual(["a", "b", "c", "d"]);
    expect(orderApplicants(base, [pin("d", 1, "2026-11-14T10:00:00Z"), pin("d", 3, "2026-11-14T11:00:00Z")])).toEqual(["a", "b", "d", "c"]);
  });

  it("gives a shared position to the later pin", () => {
    expect(orderApplicants(base, [pin("c", 1, "2026-11-14T10:00:00Z"), pin("d", 1, "2026-11-14T11:00:00Z")])).toEqual(["d", "c", "a", "b"]);
  });

  it("is empty for no applicants", () => {
    expect(orderApplicants([], [pin("x", 1)])).toEqual([]);
  });
});

describe("the ranked list", () => {
  let t: TestDb;
  let db: Db;
  beforeAll(async () => {
    t = await createTestDb();
    db = t.db;
  });
  afterAll(() => t.close());

  const JOB = "job_n1";
  const TOKEN = "token-c1";
  const levels = {
    p1: { r1: 3, r2: 3, r3: 3 }, // 15
    p2: { r1: 2, r2: 2, r3: 3 }, // 11
    p3: { r1: 0, r2: 1, r3: 3 }, // 5
    p4: { r1: 0, r2: 0, r3: 0 }, // 0
  };

  beforeEach(async () => {
    await resetDb(db);
    await addCompany(db, { id: "c1" });
    await addNeed(db, { id: "n1", companyId: "c1", status: "confirmed", requirements: REQS.map((r) => ({ id: r.id, text: r.text, kind: r.kind })) });
    let i = 0;
    for (const [id, lv] of Object.entries(levels)) {
      await addTalent(db, { id: `t_${id}`, handle: `Birch-${id}` });
      await addApplication(db, { id, talentId: `t_${id}`, jobId: JOB, companyId: "c1", needCardId: "n1", levels: lv, submittedAt: `2026-11-14T0${i++}:00:00.000Z` });
    }
  });

  const order = async () => (await rankedListForJob(db, JOB))!.applicants.map((a) => a.applicationId);
  const actions = async () => (await db.select().from(auditLog)).map((r) => r.action);

  it("is null for a job that is not one of the event's", async () => {
    expect(await rankedListForJob(db, "nope")).toBeNull();
    await db.update((await import("@/db/schema")).company).set({ participating: false });
    expect(await rankedListForJob(db, JOB)).toBeNull();
  });

  it("lists every assessed application in points order, with positions and the overview", async () => {
    const list = (await rankedListForJob(db, JOB))!;
    expect(list.applicants.map((a) => [a.applicationId, a.position, a.points, a.maxPoints, a.pin])).toEqual([
      ["p1", 1, 15, 15, null],
      ["p2", 2, 11, 15, null],
      ["p3", 3, 5, 15, null],
      ["p4", 4, 0, 15, null],
    ]);
    expect(list.companyName).toBe("Demo company c1");
    expect(list.requirements.map((r) => r.requirementId)).toEqual(["r1", "r2", "r3"]);
    expect(list.published).toBeNull();
    expect(list.changedSincePublished).toBe(true);
    expect(await listJobsWithApplicants(db)).toEqual([
      { jobId: JOB, companyName: "Demo company c1", title: "Data engineer", applicants: 4, pendingAssessment: 0, approvedAt: null, changedSincePublished: true },
    ]);
  });

  it("keeps a submitted application off the list and counts it as pending", async () => {
    await addTalent(db, { id: "t_p5" });
    await addApplication(db, { id: "p5", talentId: "t_p5", jobId: JOB, companyId: "c1", needCardId: "n1" });
    const list = (await rankedListForJob(db, JOB))!;
    expect(list.applicants).toHaveLength(4);
    expect(list.pendingAssessment).toBe(1);
  });

  it("pins several applicants, past the end, replaces a pin, and unpins", async () => {
    await moveApplicant(db, JOB, { applicationId: "p4", position: 1, reason: "Strong in person" });
    expect(await order()).toEqual(["p4", "p1", "p2", "p3"]);
    await moveApplicant(db, JOB, { applicationId: "p1", position: 99, reason: "Moved to the end" });
    expect(await order()).toEqual(["p4", "p2", "p3", "p1"]);
    const list = (await rankedListForJob(db, JOB))!;
    expect(list.applicants.find((a) => a.applicationId === "p1")).toMatchObject({ position: 4, computedPosition: 1, pin: { position: 99 } });
    await moveApplicant(db, JOB, { applicationId: "p1", position: 2, reason: "Changed my mind" });
    expect(await order()).toEqual(["p4", "p1", "p2", "p3"]);
    await unpinApplicant(db, JOB, "p4");
    expect(await order()).toEqual(["p2", "p1", "p3", "p4"]);
    const rows = await db.select().from(auditLog);
    const moved = rows.filter((r) => r.action === "ranking.moved");
    expect(moved).toHaveLength(3);
    expect(moved[0]).toMatchObject({ actor: "organiser", subjectType: "job", subjectId: JOB });
    expect(moved[0].detail).toEqual({ applicationId: "p4", talentId: "t_p4", from: 4, to: 1, reason: "Strong in person" });
    expect(rows.filter((r) => r.action === "ranking.unpinned")).toHaveLength(1);
  });

  it("refuses to move someone who is not an assessed applicant of the job", async () => {
    await expect(moveApplicant(db, JOB, { applicationId: "ghost", position: 1, reason: "Because" })).rejects.toMatchObject({ status: 404 });
    await addTalent(db, { id: "t_p5" });
    await addApplication(db, { id: "p5", talentId: "t_p5", jobId: JOB, companyId: "c1", needCardId: "n1" });
    await expect(moveApplicant(db, JOB, { applicationId: "p5", position: 1, reason: "Because" })).rejects.toMatchObject({ status: 404 });
    await expect(moveApplicant(db, "nope", { applicationId: "p1", position: 1, reason: "Because" })).rejects.toMatchObject({ status: 404 });
  });

  it("ignores a pin for a deleted application, and unpinning someone who is gone is quiet", async () => {
    await moveApplicant(db, JOB, { applicationId: "p3", position: 1, reason: "Because" });
    await db.delete(application).where(eq(application.id, "p3"));
    expect(await order()).toEqual(["p1", "p2", "p4"]);
    await unpinApplicant(db, JOB, "p3");
    await unpinApplicant(db, JOB, "never-pinned");
    expect((await actions()).filter((a) => a === "ranking.unpinned")).toHaveLength(1);
  });

  it("creates the ranking row on first use", async () => {
    expect(await db.select().from(applicantRanking)).toHaveLength(0);
    await moveApplicant(db, JOB, { applicationId: "p2", position: 1, reason: "Because" });
    expect(await db.select().from(applicantRanking)).toHaveLength(1);
  });

  it("approves the list exactly as shown, audits the count, and tracks changes since", async () => {
    await moveApplicant(db, JOB, { applicationId: "p4", position: 1, reason: "Because" });
    const published = await approveRanking(db, JOB, { now: () => new Date("2026-11-14T15:00:00.000Z") });
    expect(published.applicants.map((a) => [a.applicationId, a.position, a.moved])).toEqual([
      ["p4", 1, true],
      ["p1", 2, false],
      ["p2", 3, false],
      ["p3", 4, false],
    ]);
    expect(published.publishedAt).toBe("2026-11-14T15:00:00.000Z");
    expect(await actions()).toContain("ranking.approved");
    const approved = (await db.select().from(auditLog)).find((r) => r.action === "ranking.approved")!;
    expect(approved.detail).toEqual({ count: 4 });
    let list = (await rankedListForJob(db, JOB))!;
    expect(list.changedSincePublished).toBe(false);
    expect(list.published?.applicants).toHaveLength(4);
    expect((await listJobsWithApplicants(db))[0].approvedAt).toBe("2026-11-14T15:00:00.000Z");

    await unpinApplicant(db, JOB, "p4");
    list = (await rankedListForJob(db, JOB))!;
    expect(list.changedSincePublished).toBe(true);
    await moveApplicant(db, JOB, { applicationId: "p4", position: 1, reason: "Because again" });
    expect((await rankedListForJob(db, JOB))!.changedSincePublished).toBe(false);
  });

  it("refuses to approve when nobody is rated", async () => {
    await db.delete(application);
    await expect(approveRanking(db, JOB)).rejects.toMatchObject({ status: 409, code: "nothing_to_approve" });
  });

  it("changes the draft at once when a must-have becomes nice-to-have, and the approved list only on approval", async () => {
    // p5 is strong only in r1; p2 is strong in r2 and r3. With r1 a must-have p5 beats p3 and trails p2.
    await addTalent(db, { id: "t_p5" });
    await addApplication(db, { id: "p5", talentId: "t_p5", jobId: JOB, companyId: "c1", needCardId: "n1", levels: { r1: 3, r2: 0, r3: 0 }, submittedAt: "2026-11-14T07:00:00.000Z" });
    expect(await order()).toEqual(["p1", "p2", "p5", "p3", "p4"]);
    await approveRanking(db, JOB);
    // r1 becomes a nice-to-have: p5 drops from 6 to 3 points, p3 (5) overtakes.
    const [card] = await db.select().from(needCard).where(eq(needCard.jobId, JOB));
    const body = { ...card.body, requirements: card.body.requirements.map((r) => (r.id === "r1" ? { ...r, kind: "nice" as const } : r)) };
    await db.update(needCard).set({ body }).where(eq(needCard.id, card.id));
    expect(await order()).toEqual(["p1", "p2", "p3", "p5", "p4"]);
    const list = (await rankedListForJob(db, JOB))!;
    expect(list.changedSincePublished).toBe(true);
    expect(list.published?.applicants.map((a) => a.applicationId)).toEqual(["p1", "p2", "p5", "p3", "p4"]);
    expect((await applicantsForCompany(db, TOKEN))!.jobs[0].applicants.map((a) => a.applicationId)).toEqual(["p1", "p2", "p5", "p3", "p4"]);
    await approveRanking(db, JOB);
    expect((await applicantsForCompany(db, TOKEN))!.jobs[0].applicants.map((a) => a.applicationId)).toEqual(["p1", "p2", "p3", "p5", "p4"]);
  });

  it("drops a requirement the company removed from the points", async () => {
    const [card] = await db.select().from(needCard).where(eq(needCard.jobId, JOB));
    const body = { ...card.body, requirements: card.body.requirements.filter((r) => r.id !== "r3") };
    await db.update(needCard).set({ body }).where(eq(needCard.id, card.id));
    const list = (await rankedListForJob(db, JOB))!;
    expect(list.applicants[0]).toMatchObject({ points: 12, maxPoints: 12 });
    expect(list.applicants[0].ratings.map((r) => r.requirementId)).toEqual(["r1", "r2"]);
  });

  it("removes a withdrawn person from the organiser's list and from the company's approved list", async () => {
    await approveRanking(db, JOB);
    expect((await applicantsForCompany(db, TOKEN))!.jobs[0].applicants).toHaveLength(4);
    await db.delete(application).where(eq(application.id, "p2"));
    expect(await order()).toEqual(["p1", "p3", "p4"]);
    const seen = (await applicantsForCompany(db, TOKEN))!.jobs[0].applicants;
    expect(seen.map((a) => [a.applicationId, a.position])).toEqual([["p1", 1], ["p3", 2], ["p4", 3]]);
    expect(await ownPosition(db, "p3")).toEqual({ position: 2, of: 3, approvedAt: expect.any(String) });
    expect(await ownPosition(db, "p2")).toBeNull();
  });

  describe("what the company sees", () => {
    it("is nothing before the first approval, for an unknown link null", async () => {
      expect(await applicantsForCompany(db, "wrong")).toBeNull();
      expect(await applicantsForCompany(db, TOKEN)).toEqual({ companyName: "Demo company c1", masked: true, jobs: [] });
      await moveApplicant(db, JOB, { applicationId: "p4", position: 1, reason: "Because" });
      expect((await applicantsForCompany(db, TOKEN))!.jobs).toEqual([]);
      expect(await ownPosition(db, "p1")).toBeNull();
    });

    it("shows the approved list with ratings and no own words, name, contact, reason of a move or language", async () => {
      await moveApplicant(db, JOB, { applicationId: "p4", position: 1, reason: "Private organiser reason" });
      await approveRanking(db, JOB);
      const page = (await applicantsForCompany(db, TOKEN))!;
      const [j] = page.jobs;
      expect(j.title).toBe("Data engineer");
      expect(j.applicants.map((a) => [a.handle, a.position, a.moved, a.canAsk, a.intro, a.revealed])).toEqual([
        ["Birch-p4", 1, true, true, null, null],
        ["Birch-p1", 2, false, true, null, null],
        ["Birch-p2", 3, false, true, null, null],
        ["Birch-p3", 4, false, true, null, null],
      ]);
      const text = JSON.stringify(page);
      expect(text).not.toContain("Private organiser reason");
      expect(text).not.toContain("I used Python");
      expect(text).not.toMatch(/inputMode|"lang"|interviewLang|displayName|contact"/);
      expect(Object.keys(j.applicants[0]).sort()).toEqual(
        ["applicationId", "canAsk", "handle", "intro", "maxPoints", "moved", "points", "position", "ratings", "revealed", "summary", "talentId"].sort(),
      );
      // Still the approved list after a later change.
      await moveApplicant(db, JOB, { applicationId: "p4", position: 4, reason: "Another" });
      expect((await applicantsForCompany(db, TOKEN))!.jobs[0].applicants[0].handle).toBe("Birch-p4");
      expect(await ownPosition(db, "p4")).toMatchObject({ position: 1, of: 4 });
    });

    it("asks to meet only someone on the approved list, once", async () => {
      await expect(askToMeetApplicant(db, { token: TOKEN, applicationId: "p1" })).rejects.toMatchObject({ status: 403, code: "not_available" });
      await approveRanking(db, JOB);
      await expect(askToMeetApplicant(db, { token: "wrong", applicationId: "p1" })).rejects.toMatchObject({ status: 404 });
      const made = await askToMeetApplicant(db, { token: TOKEN, applicationId: "p1" });
      expect(made.status).toBe("awaiting_talent");
      await expect(askToMeetApplicant(db, { token: TOKEN, applicationId: "p1" })).rejects.toMatchObject({ status: 409, code: "already_requested" });
      const seen = (await applicantsForCompany(db, TOKEN))!.jobs[0].applicants.find((a) => a.applicationId === "p1")!;
      expect(seen).toMatchObject({ intro: { id: made.id, status: "awaiting_talent" }, canAsk: false, revealed: null });
      // A person not on the list, even one with an application, cannot be asked.
      await addTalent(db, { id: "t_p5" });
      await addApplication(db, { id: "p5", talentId: "t_p5", jobId: JOB, companyId: "c1", needCardId: "n1", levels: { r1: 1 } });
      await expect(askToMeetApplicant(db, { token: TOKEN, applicationId: "p5" })).rejects.toMatchObject({ status: 403 });
      await addCompany(db, { id: "c2" });
      await expect(askToMeetApplicant(db, { token: "token-c2", applicationId: "p1" })).rejects.toMatchObject({ status: 403 });
    });

    it("reveals name, contact and the own words only after both agreed", async () => {
      await approveRanking(db, JOB);
      const { id } = await askToMeetApplicant(db, { token: TOKEN, applicationId: "p1" });
      let seen = (await applicantsForCompany(db, TOKEN))!.jobs[0].applicants[0];
      expect(seen.revealed).toBeNull();
      await transitionIntro(db, { introId: id, to: "accepted", by: { party: "talent", id: "t_p1" }, identity: { name: "Aino Virtanen", contact: "aino@example.com" } });
      seen = (await applicantsForCompany(db, TOKEN))!.jobs[0].applicants[0];
      expect(seen.revealed?.displayName).toBe("Aino Virtanen");
      expect(seen.revealed?.contact).toBe("aino@example.com");
      expect(seen.revealed?.evidence[0]).toMatchObject({ requirementId: "r1", answers: [{ index: 1, sentences: ["I used Python data pipelines at work.", "I built it myself."] }] });
      expect(JSON.stringify(seen.revealed)).not.toMatch(/inputMode|voice|"lang"/);
      // Someone else on the list stays closed.
      const other = (await applicantsForCompany(db, TOKEN))!.jobs[0].applicants[1];
      expect(other.revealed).toBeNull();
      expect(await db.select().from(talentIdentity)).toHaveLength(1);
    });

    it("keeps a declined person closed, and lets the company ask again only when allowed", async () => {
      await approveRanking(db, JOB);
      await addIntro(db, { id: "i1", talentId: "t_p2", companyId: "c1", status: "declined", respondedAt: new Date() });
      const seen = (await applicantsForCompany(db, TOKEN))!.jobs[0].applicants.find((a) => a.applicationId === "p2")!;
      expect(seen).toMatchObject({ canAsk: false, revealed: null });
      await addIntro(db, { id: "i2", talentId: "t_p3", companyId: "c1", status: "expired" });
      expect((await applicantsForCompany(db, TOKEN))!.jobs[0].applicants.find((a) => a.applicationId === "p3")!.canAsk).toBe(true);
    });
  });

  describe("evidence for the organiser", () => {
    it("returns questions, answers and cited sentences, without input mode or language, with protected sentences left out", async () => {
      await addTalent(db, { id: "t_p6" });
      await addApplication(db, {
        id: "p6",
        talentId: "t_p6",
        jobId: JOB,
        companyId: "c1",
        needCardId: "n1",
        levels: { r1: 3, r2: 1, r3: 0 },
        answers: { r1: ["I rebuilt the nightly import.", "I am a mother of two and 45 years old."], r2: ["I write SQL."], r3: ["No."] },
      });
      const ev = await evidenceForOrganiser(db, "p6");
      expect(ev.applicationId).toBe("p6");
      expect(ev.requirements.map((r) => r.requirementId)).toEqual(["r1", "r2", "r3"]);
      expect(ev.requirements[0].questions).toEqual(["Tell me about a time you used Python data pipelines in your own work."]);
      expect(ev.requirements[0].answers).toEqual([{ index: 1, sentences: ["I rebuilt the nightly import.", "[left out]"] }]);
      expect(ev.requirements[0].cited).toEqual([{ turnIndex: 1, sentence: 1 }]);
      expect(ev.requirements[2].cited).toEqual([]);
      expect(JSON.stringify(ev)).not.toMatch(/inputMode|voice|"lang"|mother/);
    });

    it("is 404 for an application that is not assessed or does not exist", async () => {
      await addTalent(db, { id: "t_p5" });
      await addApplication(db, { id: "p5", talentId: "t_p5", jobId: JOB, companyId: "c1", needCardId: "n1" });
      await expect(evidenceForOrganiser(db, "p5")).rejects.toMatchObject({ status: 404 });
      await expect(evidenceForOrganiser(db, "ghost")).rejects.toMatchObject({ status: 404 });
    });
  });
});
