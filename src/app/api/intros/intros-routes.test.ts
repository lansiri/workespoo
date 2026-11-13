import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { intro, talentIdentity } from "@/db/schema";
import { HttpError } from "@/lib/http";
import { createTestDb, type TestDb } from "../../../../tests/helpers/db";

const mocks = vi.hoisted(() => ({ db: null as unknown as Db, talentId: null as string | null }));
vi.mock("@/db/client", () => ({ getDb: () => mocks.db }));
vi.mock("@/lib/session", async () => {
  const real = await vi.importActual<typeof import("@/lib/session")>("@/lib/session");
  return {
    ...real,
    requireTalent: async () => {
      if (!mocks.talentId) throw new HttpError(401, "unauthenticated", "Sign in to continue");
      return mocks.talentId;
    },
  };
});

import { POST as ask } from "./route";
import { POST as respond } from "./[id]/respond/route";
import { addCompany, addNeed, addPastPick, addTalent, resetDb } from "@/features/picks/test-helpers";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  mocks.db = t.db;
});
afterAll(() => t.close());
beforeEach(async () => {
  await resetDb(t.db);
  mocks.talentId = null;
  await addCompany(t.db, { id: "co_1", token: "tok-1" });
  await addNeed(t.db, { id: "nc_1", companyId: "co_1", requirements: [{ id: "req_1", text: "Python" }] });
  await addTalent(t.db, { id: "tal_1" });
  await addTalent(t.db, { id: "tal_2" });
  await addPastPick(t.db, { id: "pick_1", digestDate: new Date().toISOString().slice(0, 10), companyId: "co_1", needCardId: "nc_1", talentId: "tal_1", createdAt: new Date() });
});

const post = (url: string, body: unknown) => new Request(`http://x${url}`, { method: "POST", body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

describe("POST /api/intros", () => {
  it("lets a company ask by its link, for one pick, and refuses bulk or foreign requests", async () => {
    expect((await ask(post("/api/intros", { token: "tok-1", pickIds: ["pick_1"] }), undefined as never)).status).toBe(400);
    expect((await ask(post("/api/intros", { token: "nope", pickId: "pick_1" }), undefined as never)).status).toBe(404);
    const ok = await ask(post("/api/intros", { token: "tok-1", pickId: "pick_1" }), undefined as never);
    expect(ok.status).toBe(201);
    expect(await ok.json()).toMatchObject({ status: "awaiting_talent" });
    expect((await ask(post("/api/intros", { token: "tok-1", pickId: "pick_1" }), undefined as never)).status).toBe(409);
  });
});

describe("POST /api/intros/[id]/respond", () => {
  async function asked() {
    const res = await ask(post("/api/intros", { token: "tok-1", pickId: "pick_1" }), undefined as never);
    return ((await res.json()) as { id: string }).id;
  }

  it("needs a signed-in person, and only the person asked", async () => {
    const id = await asked();
    expect((await respond(post(`/api/intros/${id}/respond`, { decision: "decline" }), ctx(id))).status).toBe(401);
    mocks.talentId = "tal_2";
    expect((await respond(post(`/api/intros/${id}/respond`, { decision: "decline" }), ctx(id))).status).toBe(403);
    expect((await t.db.select().from(intro))[0].status).toBe("awaiting_talent");
  });

  it("refuses an acceptance without a name and contact", async () => {
    const id = await asked();
    mocks.talentId = "tal_1";
    expect((await respond(post(`/api/intros/${id}/respond`, { decision: "accept" }), ctx(id))).status).toBe(400);
    expect((await respond(post(`/api/intros/${id}/respond`, { decision: "accept", displayName: "Aino Testi" }), ctx(id))).status).toBe(400);
    expect(await t.db.select().from(talentIdentity)).toHaveLength(0);
  });

  it("accepts with a name and contact, and the response carries neither", async () => {
    const id = await asked();
    mocks.talentId = "tal_1";
    const res = await respond(post(`/api/intros/${id}/respond`, { decision: "accept", displayName: "Aino Testi", contact: "aino@example.invalid" }), ctx(id));
    expect(res.status).toBe(200);
    const body = JSON.stringify(await res.json());
    expect(body).toContain("accepted");
    expect(body).not.toMatch(/Aino|example\.invalid/);
    expect(await t.db.select().from(talentIdentity)).toHaveLength(1);
    // Answering again is an illegal transition.
    expect((await respond(post(`/api/intros/${id}/respond`, { decision: "decline" }), ctx(id))).status).toBe(409);
  });

  it("declines without storing anything about the person", async () => {
    const id = await asked();
    mocks.talentId = "tal_1";
    expect((await respond(post(`/api/intros/${id}/respond`, { decision: "decline" }), ctx(id))).status).toBe(200);
    expect(await t.db.select().from(talentIdentity)).toHaveLength(0);
  });
});
