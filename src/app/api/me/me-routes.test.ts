import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { talent } from "@/db/schema";
import { HttpError } from "@/lib/http";
import { seedInterview } from "@/features/card/test-helpers";
import { createTestDb, type TestDb } from "../../../../tests/helpers/db";

let t: TestDb;
let signedIn = true;
let cleared = 0;
vi.mock("@/db/client", () => ({ getDb: () => t.db }));
vi.mock("@/lib/session", () => ({
  requireTalent: async () => {
    if (!signedIn) throw new HttpError(401, "unauthenticated");
    return "tal_test00000001";
  },
  clearSession: async () => {
    cleared++;
  },
}));

beforeAll(async () => {
  t = await createTestDb();
  await seedInterview(t.db);
}, 120_000);
afterAll(() => t.close());

describe("/api/me", () => {
  it("needs a session", async () => {
    const me = await import("./route");
    const exp = await import("./export/route");
    signedIn = false;
    expect((await exp.GET(new Request("http://x/api/me/export"), undefined)).status).toBe(401);
    expect((await me.DELETE(new Request("http://x/api/me", { method: "DELETE" }), undefined)).status).toBe(401);
    signedIn = true;
  });

  it("exports as a JSON download, then deletes and clears the session", async () => {
    const me = await import("./route");
    const exp = await import("./export/route");
    const res = await exp.GET(new Request("http://x/api/me/export"), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect((await res.json()).person.handle).toBe("Birch-27");

    const del = await me.DELETE(new Request("http://x/api/me", { method: "DELETE" }), undefined);
    expect(await del.json()).toEqual({ deleted: true });
    expect(cleared).toBe(1);
    expect(await t.db.select().from(talent)).toHaveLength(0);
  });
});
