import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { escoConcept } from "@/db/schema";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { ESCO_OCCUPATIONS_URL, ESCO_SKILLS_URL, importEsco } from "./esco-import";
import { fakeFetch, FAST, jsonResponse } from "./testing";

const label = (en: string, fi?: string, sv?: string) =>
  [
    ...(fi ? [{ kielikoodi: "fi", teksti: fi }] : []),
    ...(sv ? [{ kielikoodi: "sv", teksti: sv }] : []),
    { kielikoodi: "en", teksti: en },
  ];

const SKILLS = [
  { tunnus: "a", uri: "http://data.europa.eu/esco/skill/a", selite: label("manage staff", "johtaa henkilökuntaa", "leda personal"), laajennus: [] },
  { tunnus: "b", uri: "http://data.europa.eu/esco/skill/b", selite: label("old skill", "vanha taito"), laajennus: [], loppupaiva: "2020-07-02T22:00:00Z" },
  { tunnus: "c", uri: "http://data.europa.eu/esco/skill/c", selite: [{ kielikoodi: "fi", teksti: "vain suomeksi" }], laajennus: [] },
  { tunnus: "d", uri: "http://data.europa.eu/esco/skill/d", selite: [], laajennus: [] }, // no label: dropped
];

const OCCUPATIONS = [
  {
    tunnus: "2654.1.7",
    uri: "http://data.europa.eu/esco/occupation/o1",
    selite: label("technical director", "tekninen johtaja"),
    laajennus: [{ tyyppi: "ISCOKoodi", arvo: "2654" }],
  },
  {
    tunnus: "6129.102",
    uri: "http://data.tyomarkkinatori.fi/esco/occupation/n1",
    selite: label("ostrich breeder", "strutsinkasvattaja"),
    laajennus: [{ tyyppi: "ISCOKoodi", arvo: "6129" }],
  },
  { tunnus: "0", uri: "http://data.europa.eu/esco/isco/C0", selite: label("Armed forces occupations"), laajennus: [] },
  { tunnus: "x", uri: "http://data.europa.eu/esco/occupation/o2", selite: label("gone job"), laajennus: [], loppupaiva: "2019-01-01T00:00:00Z" },
];

function server(skills: unknown[], occupations: unknown[]) {
  return fakeFetch([
    (url) => (url.href === ESCO_SKILLS_URL ? jsonResponse(skills) : undefined),
    (url) => (url.href === ESCO_OCCUPATIONS_URL ? jsonResponse(occupations) : undefined),
  ]);
}

describe("importEsco", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  }, 60_000);
  afterAll(() => t.close());

  it("loads skills and occupations, marks retired, skips ISCO groups", async () => {
    const fetchImpl = server(SKILLS, OCCUPATIONS);
    const result = await importEsco(t.db, { fetchImpl, ...FAST });
    expect(result.skills).toEqual({ rows: 3, retired: 1 });
    expect(result.occupations).toMatchObject({ rows: 3, retired: 1, nationalOccupations: 1, iscoGroupsSkipped: 1 });

    const all = await t.db.select().from(escoConcept);
    expect(all).toHaveLength(6);
    expect(all.some((r) => r.uri.includes("/esco/isco/"))).toBe(false);

    const [a] = await t.db.select().from(escoConcept).where(eq(escoConcept.uri, "http://data.europa.eu/esco/skill/a"));
    expect(a).toMatchObject({ type: "skill", labelEn: "manage staff", labelFi: "johtaa henkilökuntaa", labelSv: "leda personal", retired: false });
    const [b] = await t.db.select().from(escoConcept).where(eq(escoConcept.uri, "http://data.europa.eu/esco/skill/b"));
    expect(b.retired).toBe(true);
    const [c] = await t.db.select().from(escoConcept).where(eq(escoConcept.uri, "http://data.europa.eu/esco/skill/c"));
    expect(c.labelEn).toBe("vain suomeksi"); // falls back to the Finnish label
    const [o1] = await t.db.select().from(escoConcept).where(eq(escoConcept.uri, "http://data.europa.eu/esco/occupation/o1"));
    expect(o1).toMatchObject({ type: "occupation", isco: "2654" });
    const [n1] = await t.db.select().from(escoConcept).where(eq(escoConcept.uri, "http://data.tyomarkkinatori.fi/esco/occupation/n1"));
    expect(n1).toMatchObject({ type: "occupation", isco: "6129", retired: false });
    expect(fetchImpl.calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("is idempotent and picks up label changes and newly retired rows", async () => {
    const before = (await t.db.select().from(escoConcept)).length;
    await importEsco(t.db, { fetchImpl: server(SKILLS, OCCUPATIONS), ...FAST });
    expect(await t.db.select().from(escoConcept)).toHaveLength(before);

    const changed = SKILLS.map((s) =>
      s.tunnus === "a" ? { ...s, selite: label("manage staff members", "johtaa henkilökuntaa"), loppupaiva: "2021-01-01T00:00:00Z" } : s,
    );
    await importEsco(t.db, { fetchImpl: server(changed, OCCUPATIONS), ...FAST });
    const rows = await t.db.select().from(escoConcept);
    expect(rows).toHaveLength(before);
    const a = rows.find((r) => r.uri.endsWith("/skill/a"));
    expect(a).toMatchObject({ labelEn: "manage staff members", retired: true, labelSv: null });
  });

  it("fails clearly when the download is not an array", async () => {
    const fetchImpl = server({ error: "oops" } as unknown as unknown[], OCCUPATIONS);
    await expect(importEsco(t.db, { fetchImpl, ...FAST })).rejects.toThrow(/arrays/);
  });
});
