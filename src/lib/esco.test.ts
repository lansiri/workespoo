import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { escoConcept } from "@/db/schema";
import { createTestDb, type TestDb } from "../../tests/helpers/db";
import { loadJobFixtures } from "../../fixtures/load";
import { escoByUris, escoCandidates, escoTopMatch } from "./esco";

describe("esco lookups against the fixture subset", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
    await loadJobFixtures(t.db);
  }, 60_000);
  afterAll(() => t.close());

  it("finds English skills by trigram", async () => {
    const python = await escoCandidates(t.db, "python", { type: "skill" });
    expect(python[0]).toMatchObject({ labelEn: "Python (computer programming)", labelFi: "Python (tietokoneohjelmointi)" });
    expect(python[0].similarity).toBeGreaterThan(0.45);
    for (let i = 1; i < python.length; i++) expect(python[i].similarity).toBeLessThanOrEqual(python[i - 1].similarity);

    expect((await escoCandidates(t.db, "customer service", { limit: 3 }))[0].labelEn).toBe("customer service");
    expect((await escoCandidates(t.db, "first aid", { type: "skill", limit: 1 }))[0].labelEn).toBe("first aid");
    expect((await escoCandidates(t.db, "operate a forklift", { type: "skill", limit: 1 }))[0].labelEn).toBe("operate forklift");
  });

  it("finds skills from Finnish phrases", async () => {
    expect((await escoCandidates(t.db, "asiakaspalvelu", { type: "skill", limit: 1 }))[0]).toMatchObject({
      labelEn: "customer service",
      labelFi: "asiakaspalvelu",
    });
    expect((await escoCandidates(t.db, "ensiapu", { type: "skill", limit: 1 }))[0].labelEn).toBe("first aid");
    expect((await escoCandidates(t.db, "projektinhallinta", { type: "skill", limit: 1 }))[0].labelEn).toBe("project management");
  });

  it("filters by type and respects limit", async () => {
    const occupations = await escoCandidates(t.db, "nurse", { type: "occupation", limit: 5 });
    expect(occupations.length).toBeGreaterThan(0);
    expect(occupations.length).toBeLessThanOrEqual(5);
    const occupationUris = new Set(
      (await t.db.select({ uri: escoConcept.uri, type: escoConcept.type }).from(escoConcept)).filter((c) => c.type === "occupation").map((c) => c.uri),
    );
    expect(occupations.every((c) => occupationUris.has(c.uri))).toBe(true);
    expect(await escoCandidates(t.db, "", {})).toEqual([]);
    expect(await escoCandidates(t.db, "xqzvwk", {})).toEqual([]);
  });

  it("never returns retired concepts", async () => {
    await t.db.insert(escoConcept).values({ uri: "http://data.europa.eu/esco/skill/retired1", type: "skill", labelEn: "quantum knitting", labelFi: "kvanttineulonta", retired: true });
    expect((await escoCandidates(t.db, "quantum knitting")).map((c) => c.uri)).not.toContain("http://data.europa.eu/esco/skill/retired1");
    await t.db.insert(escoConcept).values({ uri: "http://data.europa.eu/esco/skill/live1", type: "skill", labelEn: "quantum knitting", labelFi: "kvanttineulonta" });
    expect((await escoCandidates(t.db, "kvanttineulonta"))[0].uri).toBe("http://data.europa.eu/esco/skill/live1");
  });

  it("escoTopMatch returns a ref above the threshold, else null", async () => {
    const ref = await escoTopMatch(t.db, "Python");
    expect(ref).toMatchObject({ labelEn: "Python (computer programming)", labelFi: "Python (tietokoneohjelmointi)" });
    expect(ref!.uri).toMatch(/\/esco\/skill\//);
    expect((await escoTopMatch(t.db, "asiakaspalvelu"))!.labelEn).toBe("customer service");
    expect(await escoTopMatch(t.db, "underwater basket diving championship")).toBeNull();
    expect(await escoTopMatch(t.db, "python", 0.99)).toBeNull();
    // occupations are never returned as skill matches
    expect(await escoTopMatch(t.db, "nurse responsible for general care")).not.toMatchObject({ labelEn: "nurse responsible for general care" });
  });

  it("escoByUris resolves known uris and ignores unknown ones", async () => {
    const [python] = await escoCandidates(t.db, "python", { type: "skill", limit: 1 });
    const map = await escoByUris(t.db, [python.uri, "http://data.europa.eu/esco/skill/nope", python.uri]);
    expect(map.size).toBe(1);
    expect(map.get(python.uri)).toEqual({ uri: python.uri, labelEn: python.labelEn, labelFi: python.labelFi });
    expect((await escoByUris(t.db, [])).size).toBe(0);
  });
});
