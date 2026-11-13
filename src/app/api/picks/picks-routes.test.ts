import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { digest, pick } from "@/db/schema";
import { HttpError } from "@/lib/http";
import { createTestDb, type TestDb } from "../../../../tests/helpers/db";

const mocks = vi.hoisted(() => ({
  db: null as unknown as Db,
  organiser: true,
  setOrganiser: vi.fn(),
}));

vi.mock("@/db/client", () => ({ getDb: () => mocks.db }));
vi.mock("@/lib/session", () => ({
  requireOrganiser: async () => {
    if (!mocks.organiser) throw new HttpError(401, "unauthenticated", "Organiser sign-in required");
  },
  verifyOrganiserPasscode: (input: string) => input === "letmein",
  setOrganiserSession: () => mocks.setOrganiser(),
}));
vi.mock("@/features/card", async () => {
  const mock = await import("@/features/picks/card-mock");
  return { cardForOrganiser: async (_db: unknown, id: string) => mock.organiserCard(id) };
});

import { POST as login } from "../organiser/login/route";
import { GET as queue } from "./queue/route";
import { POST as decision } from "./decision/route";
import { POST as run } from "./run/route";
import { POST as publish } from "../digests/[id]/publish/route";
import { addCompany, addEligibility, addNeed, addTalent, resetDb } from "@/features/picks/test-helpers";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  mocks.db = t.db;
});
afterAll(() => t.close());
beforeEach(async () => {
  await resetDb(t.db);
  mocks.organiser = true;
  mocks.setOrganiser.mockReset();
});

const post = (url: string, body?: unknown) =>
  new Request(`http://x${url}`, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const publishCtx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

async function seed() {
  await addCompany(t.db, { id: "co_1" });
  await addNeed(t.db, { id: "nc_1", companyId: "co_1", requirements: [{ id: "req_1", text: "Python", escoSkillUris: ["e:py"] }] });
  for (const id of ["tal_a", "tal_b"]) {
    await addTalent(t.db, { id, signals: [{ id: "s1", phrase: "Python pipelines", escoUri: "e:py" }] });
    await addEligibility(t.db, { needCardId: "nc_1", talentId: id, touched: ["req_1"] });
  }
}

describe("organiser login", () => {
  it("sets the organiser session for the right passcode and refuses others", async () => {
    expect((await login(post("/api/organiser/login", { passcode: "nope" }), undefined as never)).status).toBe(401);
    expect(mocks.setOrganiser).not.toHaveBeenCalled();
    expect((await login(post("/api/organiser/login", { passcode: "letmein" }), undefined as never)).status).toBe(200);
    expect(mocks.setOrganiser).toHaveBeenCalledOnce();
    expect((await login(post("/api/organiser/login", {}), undefined as never)).status).toBe(400);
  });
});

describe("organiser session required", () => {
  it("every picks endpoint answers 401 without it", async () => {
    mocks.organiser = false;
    expect((await queue(new Request("http://x/api/picks/queue"), undefined as never)).status).toBe(401);
    expect((await decision(post("/api/picks/decision", { pickId: "p", decision: "approve" }), undefined as never)).status).toBe(401);
    expect((await run(post("/api/picks/run", {}), undefined as never)).status).toBe(401);
    expect((await publish(post("/api/digests/d/publish"), publishCtx("d"))).status).toBe(401);
  });
});

describe("the review flow end to end", () => {
  it("runs the picks, decides each one by itself, publishes, and refuses bulk and unreasoned requests", async () => {
    await seed();
    const ran = await run(post("/api/picks/run", { date: "2026-11-20" }), undefined as never);
    expect(await ran.json()).toEqual({ digests: 1, picks: 2 });
    // Running again changes nothing.
    expect(await (await run(post("/api/picks/run", { date: "2026-11-20" }), undefined as never)).json()).toEqual({ digests: 1, picks: 2 });

    const picks = await t.db.select().from(pick);
    const [d] = await t.db.select().from(digest);

    // P3: only pickId is accepted
    const bulk = await decision(post("/api/picks/decision", { pickIds: picks.map((p) => p.id), decision: "approve" }), undefined as never);
    expect(bulk.status).toBe(400);
    // P5: removal needs a reason code, and "other" needs a note
    expect((await decision(post("/api/picks/decision", { pickId: picks[0].id, decision: "remove" }), undefined as never)).status).toBe(400);
    expect((await decision(post("/api/picks/decision", { pickId: picks[0].id, decision: "remove", reasonCode: "other" }), undefined as never)).status).toBe(400);
    expect((await t.db.select().from(pick).where(eq(pick.status, "suggested"))).length).toBe(2);

    // P4: publishing with undecided picks
    const early = await publish(post(`/api/digests/${d.id}/publish`), publishCtx(d.id));
    expect(early.status).toBe(409);
    expect(((await early.json()) as { error: { message: string } }).error.message).toBe("Decide every pick first");

    expect((await decision(post("/api/picks/decision", { pickId: picks[0].id, decision: "approve" }), undefined as never)).status).toBe(200);
    expect((await decision(post("/api/picks/decision", { pickId: picks[1].id, decision: "remove", reasonCode: "evidence_thin" }), undefined as never)).status).toBe(200);

    const q = (await (await queue(new Request("http://x/api/picks/queue"), undefined as never)).json()) as {
      order: string;
      digests: Array<{ undecided: number; approved: number; removed: number }>;
    };
    expect(q.order).toBe("no_particular_order");
    expect(q.digests[0]).toMatchObject({ undecided: 0, approved: 1, removed: 1 });

    const done = await publish(post(`/api/digests/${d.id}/publish`), publishCtx(d.id));
    expect(done.status).toBe(200);
    expect(await done.json()).toMatchObject({ status: "published", companyPath: "/c/token-co_1" });
  });

  it("rejects a malformed date for the run", async () => {
    expect((await run(post("/api/picks/run", { date: "tomorrow" }), undefined as never)).status).toBe(400);
  });
});
