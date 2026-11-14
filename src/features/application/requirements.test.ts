import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { APPLICATION_MAX_REQUIREMENTS, type NeedCard } from "@/contracts";
import { needCard } from "@/db/schema";
import { overwriteCard } from "../needs/test-helpers";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { coveredRequirements, currentRequirementKinds, getApplyJob, listApplyJobs } from "./requirements";
import { addTalent, EMPLOYER, seedJob } from "./test-support";

vi.mock("./rank", () => ({}));

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
}, 120_000);
afterAll(() => t.close());

const req = (over: Partial<NeedCard["requirements"][number]> & { id: string }): NeedCard["requirements"][number] => ({
  kind: "must",
  category: "skill",
  escoSkillUris: [],
  postingSentence: 0,
  source: "agent",
  languageCode: null,
  statutory: "none",
  question: null,
  pool: null,
  text: `Requirement ${over.id}`,
  ...over,
});

describe("coveredRequirements", () => {
  it("leaves out statutory and authorisation requirements, puts must-haves first and keeps stored order", () => {
    const covered = coveredRequirements({
      requirements: [
        req({ id: "n1", kind: "nice" }),
        req({ id: "m1" }),
        req({ id: "a1", category: "authorisation" }),
        req({ id: "s1", statutory: "other_law" }),
        req({ id: "n2", kind: "nice", category: "language" }),
        req({ id: "m2" }),
      ],
    });
    expect(covered.map((r) => r.id)).toEqual(["m1", "m2", "n1", "n2"]);
  });

  it("keeps at most six, and none when nothing is askable", () => {
    const many = Array.from({ length: 10 }, (_, i) => req({ id: `r${i}`, kind: i < 3 ? "nice" : "must" }));
    const covered = coveredRequirements({ requirements: many });
    expect(covered).toHaveLength(APPLICATION_MAX_REQUIREMENTS);
    expect(covered.map((r) => r.id)).toEqual(["r3", "r4", "r5", "r6", "r7", "r8"]);
    expect(coveredRequirements({ requirements: [req({ id: "x", statutory: "other_law" })] })).toEqual([]);
  });
});

describe("apply jobs", () => {
  it("lists a participating job with masked text, no real employer and no source ids", async () => {
    const me = await addTalent(t.db);
    const { jobId, companyId } = await seedJob(t.db, {
      sentences: [`${EMPLOYER} is looking for a warehouse specialist.`, "You book goods in SAP."],
      requirements: [{ text: `Work for ${EMPLOYER} in SAP`, kind: "must", postingSentence: 1 }],
      title: "Warehouse specialist",
    });
    await overwriteCard(t.db, {
      ...(await t.db.select().from(needCard).where(eq(needCard.jobId, jobId)).then((r) => r[0]!.body as NeedCard)),
      title: `${EMPLOYER} warehouse`,
      summary: `${EMPLOYER} needs someone.`,
    });
    const jobs = await listApplyJobs(t.db, me);
    const mine = jobs.find((j) => j.jobId === jobId)!;
    expect(mine).toMatchObject({ companyName: "Demo company 03", masked: true, application: null });
    expect(JSON.stringify(mine)).not.toContain("Academic");
    expect(JSON.stringify(mine)).not.toContain(companyId);
    expect(mine.requirements).toHaveLength(1);
    expect(await getApplyJob(t.db, me, jobId)).toEqual(mine);
  });

  it("leaves out stale cards, companies outside the event and jobs with nothing to cover", async () => {
    const me = await addTalent(t.db);
    const stale = await seedJob(t.db, { cardStatus: "stale" });
    const outside = await seedJob(t.db, { inEvent: false });
    const nothing = await seedJob(t.db, { requirements: [{ text: "Permit", statutory: "other_law" }] });
    for (const j of [stale, outside, nothing]) {
      expect(await getApplyJob(t.db, me, j.jobId)).toBeNull();
      expect((await listApplyJobs(t.db, me)).some((x) => x.jobId === j.jobId)).toBe(false);
    }
  });

  it("reports the current kinds of a card's requirements", async () => {
    const { jobId, card } = await seedJob(t.db);
    const kinds = await currentRequirementKinds(t.db, jobId);
    expect(kinds.get(card.requirements[0]!.id)).toBe("must");
    expect(kinds.get("req_gone")).toBeUndefined();
  });
});
