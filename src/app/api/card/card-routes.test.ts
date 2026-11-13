import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http";
import { resetLlmState, setLlmFake } from "@/lib/llm/testing";
import { synthesiseCard } from "@/features/card";
import { seedInterview } from "@/features/card/test-helpers";
import { createTestDb, type TestDb } from "../../../../tests/helpers/db";

let t: TestDb;
let signedIn = true;
vi.mock("@/db/client", () => ({ getDb: () => t.db }));
vi.mock("@/lib/session", () => ({
  requireTalent: async () => {
    if (!signedIn) throw new HttpError(401, "unauthenticated");
    return "tal_test00000001";
  },
}));

beforeAll(async () => {
  t = await createTestDb();
  await seedInterview(t.db);
}, 120_000);
afterAll(() => {
  resetLlmState();
  return t.close();
});

const req = (method: string, body?: unknown) =>
  new Request("http://x/api/card", { method, body: body === undefined ? undefined : JSON.stringify(body) });

describe("card routes", () => {
  it("walks pending, review, approval and pool opt-in", async () => {
    const card = await import("./route");
    const approve = await import("./approve/route");
    const pool = await import("./pool/route");

    signedIn = false;
    expect((await card.GET(req("GET"), undefined)).status).toBe(401);
    signedIn = true;

    const pending = await card.GET(req("GET"), undefined);
    expect(pending.status).toBe(404);
    expect((await pending.json()).error.code).toBe("card_pending");

    setLlmFake(() => ({
      headline: "Goods receiving and SAP",
      summary: "They received goods and used SAP at a logistics centre.",
      signals: [
        { phrase: "Receiving goods", kind: "skill", evidence: ["T1.S1"], from: [], rendering: "They received incoming goods at a logistics centre." },
        { phrase: "SAP", kind: "tool", evidence: ["T1.S2"], from: [], rendering: "They used SAP for goods receiving." },
      ],
      roles: [],
      rolesEvidence: [],
    }));
    await synthesiseCard(t.db, "int_test00000001");

    const got = await (await card.GET(req("GET"), undefined)).json();
    expect(got.status).toBe("draft");
    expect(got.signals).toHaveLength(2);
    expect(got.signals[0].quotes[0]).toContain("logistics centre");
    expect(JSON.stringify(got)).not.toContain("hasExample");

    // pool is refused before approval
    expect((await pool.POST(req("POST", { inPool: true }), undefined)).status).toBe(409);

    const patched = await (await card.PATCH(req("PATCH", { op: "remove", signalId: got.signals[1].id }), undefined)).json();
    expect(patched.card.signals.map((s: { status: string }) => s.status)).toEqual(["proposed", "removed"]);
    expect((await card.PATCH(req("PATCH", { op: "nope" }), undefined)).status).toBe(400);

    const approved = await approve.POST(req("POST", {}), undefined);
    expect(approved.status).toBe(200);
    expect(await approved.json()).toEqual({ version: 1 });

    expect((await pool.POST(req("POST", { inPool: true }), undefined)).status).toBe(200);
    const after = await (await card.GET(req("GET"), undefined)).json();
    expect(after).toMatchObject({ status: "approved", inPool: true });
  });
});
