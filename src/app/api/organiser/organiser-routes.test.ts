import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { audit } from "@/lib/audit";
import { HttpError } from "@/lib/http";
import { createTestDb, type TestDb } from "../../../../tests/helpers/db";

const mocks = vi.hoisted(() => ({
  db: null as unknown as Db,
  organiser: true,
  reset: vi.fn(),
}));

vi.mock("@/db/client", () => ({ getDb: () => mocks.db }));
vi.mock("@/lib/session", () => ({
  requireOrganiser: async () => {
    if (!mocks.organiser) throw new HttpError(401, "unauthenticated", "Organiser sign-in required");
  },
}));
vi.mock("@/features/synth", () => ({ resetDemoFromSnapshot: (db: Db) => mocks.reset(db) }));

import { GET as auditRoute } from "./audit/route";
import { GET as exposureRoute } from "./exposure/route";
import { POST as resetRoute } from "./reset-demo/route";
import { addTalent, resetDb } from "@/features/picks/test-helpers";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  mocks.db = t.db;
});
afterAll(() => t.close());
beforeEach(async () => {
  await resetDb(t.db);
  mocks.organiser = true;
  mocks.reset.mockReset();
});

const get = (url: string) => new Request(`http://x${url}`);

describe("audit route", () => {
  it("needs the organiser session", async () => {
    mocks.organiser = false;
    expect((await auditRoute(get("/api/organiser/audit"), undefined as never)).status).toBe(401);
  });

  it("lists rows, filters by action and refuses unknown actions", async () => {
    await audit(t.db, { actor: "system", action: "pick.drafted", subjectType: "pick", subjectId: "p1", detail: { seeded: true } });
    await audit(t.db, { actor: "organiser", action: "pick.approved", subjectType: "pick", subjectId: "p1" });
    const all = (await (await auditRoute(get("/api/organiser/audit"), undefined as never)).json()) as { rows: Array<{ action: string; seeded: boolean }> };
    expect(all.rows.map((r) => r.action)).toEqual(["pick.approved", "pick.drafted"]);
    expect(all.rows[1].seeded).toBe(true);
    const some = (await (await auditRoute(get("/api/organiser/audit?action=pick.approved"), undefined as never)).json()) as { rows: unknown[] };
    expect(some.rows).toHaveLength(1);
    expect((await auditRoute(get("/api/organiser/audit?action=nope"), undefined as never)).status).toBe(400);
    expect((await auditRoute(get("/api/organiser/audit?before=abc"), undefined as never)).status).toBe(400);
  });
});

describe("exposure route", () => {
  it("needs the organiser session and answers with bands", async () => {
    mocks.organiser = false;
    expect((await exposureRoute(get("/api/organiser/exposure"), undefined as never)).status).toBe(401);
    mocks.organiser = true;
    await addTalent(t.db, { id: "t1", handle: "Birch-1" });
    const body = (await (await exposureRoute(get("/api/organiser/exposure"), undefined as never)).json()) as { bands: Array<{ band: string; handles: string[] }> };
    expect(body.bands[0]).toEqual({ band: "never", handles: ["Birch-1"] });
  });
});

describe("reset-demo route", () => {
  const post = () => new Request("http://x/api/organiser/reset-demo", { method: "POST" });

  it("refuses without the organiser session and does not reset", async () => {
    mocks.organiser = false;
    expect((await resetRoute(post(), undefined as never)).status).toBe(401);
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it("answers with the result of the restore, including when there is no snapshot", async () => {
    mocks.reset.mockResolvedValueOnce({ restored: true, people: 20, companies: 5 });
    expect(await (await resetRoute(post(), undefined as never)).json()).toEqual({ restored: true, people: 20, companies: 5 });
    mocks.reset.mockResolvedValueOnce({ restored: false, people: 0, companies: 0 });
    expect(await (await resetRoute(post(), undefined as never)).json()).toEqual({ restored: false, people: 0, companies: 0 });
    expect(mocks.reset).toHaveBeenCalledWith(t.db);
  });

  it("records a restore in the audit log with counts only, and nothing when there was no snapshot", async () => {
    const { listAudit } = await import("@/lib/audit");
    const before = (await listAudit(t.db, { action: "demo.reset" })).length;
    mocks.reset.mockResolvedValueOnce({ restored: false, people: 0, companies: 0 });
    await resetRoute(post(), undefined as never);
    expect((await listAudit(t.db, { action: "demo.reset" })).length).toBe(before);
    mocks.reset.mockResolvedValueOnce({ restored: true, people: 15, companies: 8 });
    await resetRoute(post(), undefined as never);
    const rows = await listAudit(t.db, { action: "demo.reset" });
    expect(rows.length).toBe(before + 1);
    expect(rows[0]).toMatchObject({ actor: "organiser", subjectType: "system", detail: { people: 15, companies: 8 } });
  });
});
