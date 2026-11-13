import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { createFakeEngine } from "./fake-engine";
import { loadPersonas } from "./persona";
import { renderMarkdown } from "./report";
import { runSimulation } from "./simulate";

const personas = loadPersonas();
let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

describe("runSimulation with the fake engine", () => {
  it("runs all fifteen personas, passes the rubric, and writes a report that says it is fake", async () => {
    const { runs, report } = await runSimulation(t.db, personas, { deps: createFakeEngine(t.db, { personas }), engine: "fake", now: () => new Date("2026-11-13T12:00:00Z") });
    expect(runs).toHaveLength(15);
    const failing = report.metrics.filter((m) => m.enforced && m.status === "fail");
    expect(failing.map((m) => `${m.id}: ${m.failures.join("; ")}`)).toEqual([]);
    expect(report.verdict).toBe("pass");
    // Metrics the fake cannot feed are n/a, not silently passing.
    expect(report.metrics.find((m) => m.id === "2")?.status).toBe("n/a");
    expect(report.metrics.find((m) => m.id === "13")).toMatchObject({ value: 0, status: "pass" });

    const md = renderMarkdown(report);
    expect(md).toContain("built-in fake engine");
    expect(md).toContain("| 13 | Planted protected facts absent from the card | 0 |");
    expect(md).toContain("| p07 |");
    // The report never reproduces what a person said.
    for (const p of personas) expect(md).not.toContain(p.answers.recent_work.slice(0, 40));
  });

  it("fails the planted-fact check when a protected token reaches a card", async () => {
    const leaky = createFakeEngine(t.db, { personas, injectIntoHeadline: (p) => (p.id === "p01" ? ", 38" : "") });
    const { report } = await runSimulation(t.db, personas.slice(0, 3), { deps: leaky, engine: "fake" });
    const leak = report.metrics.find((m) => m.id === "13")!;
    expect(leak.status).toBe("fail");
    expect(leak.failures).toEqual(["p01: 38 on the card"]);
    expect(report.verdict).toBe("fail");
    expect(renderMarkdown(report)).toContain("p01: 38 on the card");
  });

  it("runs with a mode override for every persona", async () => {
    const { runs } = await runSimulation(t.db, personas.slice(0, 4), { deps: createFakeEngine(t.db, { personas }), engine: "fake", mode: "express" });
    expect(runs.every((r) => r.mode === "express")).toBe(true);
  });
});

describe("sim database choice", () => {
  it("uses memory unless --db is given, and never mixes --fake with --db", async () => {
    const { simUsesMemory } = await import("./script-db");
    expect(simUsesMemory({})).toBe(true);
    expect(simUsesMemory({ pglite: true })).toBe(true);
    expect(simUsesMemory({ fake: true })).toBe(true);
    expect(simUsesMemory({ db: true })).toBe(false);
    expect(() => simUsesMemory({ fake: true, db: true })).toThrow(/--fake/);
  });
});
