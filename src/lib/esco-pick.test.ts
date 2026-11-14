import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { escoConcept } from "@/db/schema";
import type { LlmOptions } from "@/lib/llm";
import { resetLlmState, setLlmFake } from "@/lib/llm/testing";
import { createTestDb, type TestDb } from "../../tests/helpers/db";
import { pickEscoLabels } from "./esco-pick";

let t: TestDb;
const uri = (n: string) => `http://data.europa.eu/esco/skill/pick-${n}`;
beforeAll(async () => {
  t = await createTestDb();
  await t.db.insert(escoConcept).values([
    { uri: uri("dispatch"), type: "skill", labelEn: "pick orders for dispatching", labelFi: "poimi tilauksia lähetettäväksi" },
    { uri: uri("order"), type: "skill", labelEn: "order picking", labelFi: null },
    { uri: uri("react"), type: "skill", labelEn: "react to mining emergencies", labelFi: null },
    { uri: uri("excel"), type: "skill", labelEn: "demand excellence from performers", labelFi: null },
    { uri: uri("sap"), type: "skill", labelEn: "SAP", labelFi: "SAP" },
  ]);
}, 120_000);
afterAll(() => t.close());
afterEach(() => resetLlmState());

const items = [
  { key: "a", phrase: "Order picking", kind: "skill" as const },
  { key: "b", phrase: "React", kind: "tool" as const },
];
const run = () => pickEscoLabels(t.db, items);

describe("pickEscoLabels (prompt C)", () => {
  it("makes one analyst call for the whole card with phrases and candidate labels only, and maps choices", async () => {
    const seen: LlmOptions[] = [];
    setLlmFake((o) => {
      seen.push(o);
      return { picks: [{ i: 0, choice: 1 }, { i: 1, choice: 0 }] };
    });
    const out = await run();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ role: "analyst", purpose: "card.esco_pick", temperature: 0, maxTokens: 400, deadlineMs: 15_000 });
    const text = seen[0].messages.map((m) => m.content).join("\n");
    expect(text).toContain("i=0 | phrase: Order picking | kind: skill");
    expect(text).toContain("i=1 | phrase: React | kind: tool");
    expect(out.get("a")?.uri).toBeTruthy();
    expect(out.get("b")).toBeNull(); // "React" with "react to mining emergencies" and a pick of 0
  });

  it("takes the purpose and the deadline from the caller, with the card's values as defaults", async () => {
    const seen: LlmOptions[] = [];
    setLlmFake((o) => {
      seen.push(o);
      return { picks: [] };
    });
    await pickEscoLabels(t.db, items, { purpose: "interview.esco_pick", deadlineMs: 10_000 });
    expect(seen[0]).toMatchObject({ role: "analyst", purpose: "interview.esco_pick", deadlineMs: 10_000 });
  });

  it("choice 0, an out-of-range choice and a missing item all mean no label", async () => {
    setLlmFake(() => ({ picks: [{ i: 0, choice: 6 }] }));
    const out = await run();
    expect(out.get("a")).toBeNull();
    expect(out.get("b")).toBeNull();
    setLlmFake(() => ({ picks: [{ i: 1, choice: 0 }] }));
    expect((await run()).get("a")).toBeNull();
    setLlmFake(() => ({ picks: [{ i: 7, choice: 1 }] })); // an item that is not in the request
    expect((await run()).get("a")).toBeNull();
  });

  it("maps the chosen candidate to uri and both labels", async () => {
    setLlmFake((o) => {
      const lines = o.messages[1].content.split("\n");
      const n = lines.findIndex((l) => l.startsWith("i=0"));
      const k = lines.slice(n + 1).findIndex((l) => l.includes("pick orders for dispatching"));
      return { picks: [{ i: 0, choice: k + 1 }] };
    });
    expect((await run()).get("a")).toEqual({ uri: uri("dispatch"), labelEn: "pick orders for dispatching", labelFi: "poimi tilauksia lähetettäväksi" });
  });

  it("falls back to the strict text match when the call fails", async () => {
    setLlmFake(() => {
      throw new Error("429");
    });
    const out = await pickEscoLabels(t.db, [
      { key: "sap", phrase: "SAP", kind: "tool" },
      { key: "react", phrase: "React", kind: "tool" },
    ]);
    expect(out.get("sap")?.uri).toBe(uri("sap"));
    expect(out.get("react")).toBeNull();
  });

  it("makes no call when no signal has a candidate", async () => {
    let calls = 0;
    setLlmFake(() => {
      calls++;
      return { picks: [] };
    });
    const out = await pickEscoLabels(t.db, [{ key: "x", phrase: "Zzqxv", kind: "skill" }]);
    expect(calls).toBe(0);
    expect(out.get("x")).toBeNull();
  });
});
