import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { needCard } from "@/db/schema";
import { HttpError } from "@/lib/http";
import { REQS, addApplication } from "@/features/application/rank-fixtures";
import { addCompany, addNeed, addTalent, resetDb } from "@/features/picks/test-helpers";
import { createTestDb, type TestDb } from "../../../../../tests/helpers/db";

const mocks = vi.hoisted(() => ({ db: null as unknown as Db, organiser: true }));

vi.mock("@/db/client", () => ({ getDb: () => mocks.db }));
vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()),
  requireOrganiser: async () => {
    if (!mocks.organiser) throw new HttpError(401, "unauthenticated", "Organiser sign-in required");
  },
}));
vi.mock("@/features/application/requirements", () => ({
  currentRequirementKinds: async (db: Db, jobId: string) => {
    const [row] = await db.select({ body: needCard.body }).from(needCard).where(eq(needCard.jobId, jobId));
    return new Map((row?.body.requirements ?? []).map((r) => [r.id, r.kind] as const));
  },
}));

import { GET as overview } from "./route";
import { GET as list } from "./[jobId]/route";
import { POST as move } from "./[jobId]/move/route";
import { POST as unpin } from "./[jobId]/unpin/route";
import { POST as approve } from "./[jobId]/approve/route";
import { GET as evidence } from "./[jobId]/evidence/route";
import { POST as meet } from "../../applicants/meet/route";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  mocks.db = t.db;
});
afterAll(() => t.close());
beforeEach(async () => {
  mocks.organiser = true;
  await resetDb(t.db);
  await addCompany(t.db, { id: "c1" });
  await addNeed(t.db, { id: "n1", companyId: "c1", requirements: REQS.map((r) => ({ id: r.id, text: r.text, kind: r.kind })) });
  await addTalent(t.db, { id: "t1" });
  await addApplication(t.db, { id: "p1", talentId: "t1", jobId: "job_n1", companyId: "c1", needCardId: "n1", levels: { r1: 2, r2: 2, r3: 2 } });
});

const ctx = { params: Promise.resolve({ jobId: "job_n1" }) } as never;
const none = undefined as never;
const post = (url: string, body?: unknown) => new Request(`http://x${url}`, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const U = "/api/organiser/applicants/job_n1";

describe("organiser applicant routes", () => {
  it("refuse every call without the organiser session", async () => {
    mocks.organiser = false;
    const get = (url: string) => new Request(`http://x${url}`);
    const results = await Promise.all([
      overview(get("/api/organiser/applicants"), none),
      list(get(U), ctx),
      move(post(`${U}/move`, { applicationId: "p1", position: 1, reason: "Because" }), ctx),
      unpin(post(`${U}/unpin`, { applicationId: "p1" }), ctx),
      approve(post(`${U}/approve`), ctx),
      evidence(get(`${U}/evidence?application=p1`), ctx),
    ]);
    expect(results.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 401]);
    mocks.organiser = true;
    expect((await (await list(get(U), ctx)).json()).published).toBeNull();
  });

  it("lists, moves, unpins, approves and shows evidence", async () => {
    const get = (url: string) => new Request(`http://x${url}`);
    const jobs = (await (await overview(get("/api/organiser/applicants"), none)).json()) as { jobs: Array<{ jobId: string; applicants: number }> };
    expect(jobs.jobs).toMatchObject([{ jobId: "job_n1", applicants: 1 }]);
    expect((await list(get("/api/organiser/applicants/nope"), { params: Promise.resolve({ jobId: "nope" }) } as never)).status).toBe(404);
    expect((await move(post(`${U}/move`, { applicationId: "p1", position: 0, reason: "x" }), ctx)).status).toBe(400);
    expect((await move(post(`${U}/move`, { applicationId: "p1", position: 1, reason: "Because" }), ctx)).status).toBe(200);
    expect((await move(post(`${U}/move`, { applicationId: "ghost", position: 1, reason: "Because" }), ctx)).status).toBe(404);
    expect((await unpin(post(`${U}/unpin`, { applicationId: "p1" }), ctx)).status).toBe(200);
    const approved = await approve(post(`${U}/approve`), ctx);
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({ count: 1 });
    const ev = await evidence(get(`${U}/evidence?application=p1`), ctx);
    expect(ev.status).toBe(200);
    expect((await ev.json()).requirements).toHaveLength(3);
    expect((await evidence(get(`${U}/evidence`), ctx)).status).toBe(400);
    expect((await evidence(get(`${U}/evidence?application=ghost`), ctx)).status).toBe(404);
  });
});

describe("POST /api/applicants/meet", () => {
  it("works for a company by its link, only for the approved list", async () => {
    const body = { token: "token-c1", applicationId: "p1" };
    expect((await meet(post("/api/applicants/meet", body), none)).status).toBe(403);
    await approve(post(`${U}/approve`), ctx);
    expect((await meet(post("/api/applicants/meet", { ...body, token: "bad" }), none)).status).toBe(404);
    expect((await meet(post("/api/applicants/meet", {}), none)).status).toBe(400);
    const ok = await meet(post("/api/applicants/meet", body), none);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ status: "awaiting_talent" });
  });
});
