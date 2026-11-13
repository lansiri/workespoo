import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { escoOccupationFetch, escoOccupationSkill, job } from "@/db/schema";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { crawlOccupationSkills, ESCO_API_BASE, pendingOccupationUris } from "./esco-occupations";
import { fakeFetch, FAST, jsonResponse } from "./testing";

const occ = (id: string) => `http://data.europa.eu/esco/occupation/${id}`;
const skill = (id: string) => `http://data.europa.eu/esco/skill/${id}`;
const links = (essential: string[], optional: string[]) => ({
  _links: {
    hasEssentialSkill: essential.map((s) => ({ uri: skill(s), title: s })),
    hasOptionalSkill: optional.map((s) => ({ uri: skill(s), title: s })),
  },
});

describe("crawlOccupationSkills", () => {
  let t: TestDb;
  const state = { failC: true };
  const server = () =>
    fakeFetch([
      (url) => {
        if (!url.href.startsWith(`${ESCO_API_BASE}/resource/occupation`)) return undefined;
        const uri = url.searchParams.get("uri")!;
        expect(url.searchParams.get("selectedVersion")).toBe("v1.2.1");
        if (uri === occ("a")) return jsonResponse(links(["s1", "s2"], ["s3", "s1"])); // s1 listed twice: essential wins
        if (uri === occ("b")) return jsonResponse({}, 404);
        if (uri === occ("c")) return state.failC ? jsonResponse({}, 503) : jsonResponse(links(["s9"], []));
        if (uri === occ("d")) return jsonResponse({ _links: {} });
        return jsonResponse({}, 404);
      },
    ]);

  beforeAll(async () => {
    t = await createTestDb();
    const row = (id: string, uris: string[], active = true) => ({
      id, source: "tmt" as const, sourceId: id, url: "https://x.example", title: id, escoOccupationUris: uris, active,
    });
    await t.db.insert(job).values([
      row("j1", [occ("a"), occ("b")]),
      row("j2", [occ("a"), occ("c"), "http://data.tyomarkkinatori.fi/esco/occupation/national", "http://data.europa.eu/esco/isco/C5321"]),
      row("j3", [occ("d")]),
      row("j4_inactive", [occ("zzz")], false),
    ]);
  }, 60_000);
  afterAll(() => t.close());

  it("lists only ESCO occupations of active postings", async () => {
    expect(await pendingOccupationUris(t.db)).toEqual([occ("a"), occ("b"), occ("c"), occ("d")]);
  });

  it("honours limit", async () => {
    const fetchImpl = server();
    const r = await crawlOccupationSkills(t.db, { limit: 1, fetchImpl, ...FAST });
    expect(r).toMatchObject({ pending: 4, fetched: 1, links: 3, failed: 0, missing: 0 });
    expect(fetchImpl.calls).toHaveLength(1);
    expect(await pendingOccupationUris(t.db)).toEqual([occ("b"), occ("c"), occ("d")]);
  });

  it("stores essential and optional links, records 404 as missing and retries server errors later", async () => {
    const r = await crawlOccupationSkills(t.db, { fetchImpl: server(), ...FAST });
    expect(r).toMatchObject({ pending: 3, fetched: 1, missing: 1, failed: 1, links: 0 });

    const stored = await t.db.select().from(escoOccupationSkill).where(eq(escoOccupationSkill.occupationUri, occ("a")));
    expect(Object.fromEntries(stored.map((s) => [s.skillUri, s.relation]))).toEqual({
      [skill("s1")]: "essential",
      [skill("s2")]: "essential",
      [skill("s3")]: "optional",
    });
    const fetches = await t.db.select().from(escoOccupationFetch);
    const byUri = Object.fromEntries(fetches.map((f) => [f.occupationUri, f]));
    expect(byUri[occ("a")]).toMatchObject({ ok: true, skillCount: 3 });
    expect(byUri[occ("b")]).toMatchObject({ ok: false });
    expect(byUri[occ("d")]).toMatchObject({ ok: true, skillCount: 0 });
    expect(byUri[occ("c")]).toBeUndefined(); // a 503 is not remembered

    expect(await pendingOccupationUris(t.db)).toEqual([occ("c")]);
  });

  it("fetches each occupation once: a later run only retries what failed", async () => {
    state.failC = false;
    const fetchImpl = server();
    const r = await crawlOccupationSkills(t.db, { fetchImpl, ...FAST });
    expect(r).toMatchObject({ pending: 1, fetched: 1, links: 1, failed: 0 });
    expect(fetchImpl.calls).toHaveLength(1);
    const again = await crawlOccupationSkills(t.db, { fetchImpl: server(), ...FAST });
    expect(again).toMatchObject({ pending: 0, fetched: 0 });
  });
});
