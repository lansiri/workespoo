import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { job, jobSkill } from "@/db/schema";
import { containsContact } from "@/lib/redact";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { FIXTURE_TMT_POSTINGS } from "../../../fixtures/load";
import { getJob, listJobs } from "./index";
import { fakeFetch, FAST, jsonResponse, type FakeRoute } from "./testing";
import { ingestTmt, normaliseTmtPosting, postingSentences, sectorFor, tmtJobId, TMT_DETAIL_URL, TMT_SEARCH_URL } from "./tmt";

type Detail = Record<string, unknown> & {
  metadata: { externalId: string; lastModified: string };
  position: { title: Record<string, string> };
};
const fixtures = FIXTURE_TMT_POSTINGS() as Detail[];

describe("normaliseTmtPosting on real postings", () => {
  const rows = fixtures.map((d) => normaliseTmtPosting(d, { preferMunicipalities: ["049"] }));

  it("normalises every fixture posting", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(35);
    expect(rows.every((r) => r !== null)).toBe(true);
  });

  it("builds ids, urls, language, sentences and dates", () => {
    for (const [i, r] of rows.entries()) {
      const j = r!.job;
      const uuid = fixtures[i].metadata.externalId;
      expect(j.id).toBe(`job_tmt_${uuid.replace(/-/g, "")}`);
      expect(j.sourceId).toBe(uuid);
      expect(j.source).toBe("tmt");
      expect(j.title?.length).toBeGreaterThan(0);
      expect(["fi", "en", "sv"]).toContain(j.lang);
      expect(j.url).toMatch(/^https?:\/\//);
      expect(j.sentences!.length).toBeGreaterThan(0);
      expect(j.sentences!.every((s) => s.length >= 3 && !/\n/.test(s))).toBe(true);
      expect(j.postedAt).toBeInstanceOf(Date);
      expect(j.municipalityCode).toBeTruthy();
      expect(j.active).toBe(true);
    }
  });

  it("spans Finnish and English postings and keeps ESCO uris", () => {
    const langs = new Set(rows.map((r) => r!.job.lang));
    expect(langs.has("fi")).toBe(true);
    expect(langs.has("en")).toBe(true);
    const withSkills = rows.filter((r) => r!.skillUris.length > 0);
    expect(withSkills.length).toBeGreaterThan(10);
    for (const r of rows) {
      expect(r!.job.escoOccupationUris!.length).toBeGreaterThan(0);
      expect(r!.job.escoOccupationUris!.every((u) => u.startsWith("http"))).toBe(true);
    }
    // Some postings are tagged with an ISCO group only (`/esco/isco/...`); most carry ESCO occupations.
    const withEsco = rows.filter((r) => r!.job.escoOccupationUris!.some((u) => /\/esco\/occupation\//.test(u)));
    expect(withEsco.length).toBeGreaterThanOrEqual(rows.length - 3);
  });

  it("keeps no contact data and no recruiter anywhere in the row, raw included", () => {
    for (const r of rows) {
      const serialised = JSON.stringify(r!.job);
      expect(serialised).not.toContain('"recruiter"');
      expect(containsContact(serialised)).toBe(false);
    }
  });

  it("does not damage ESCO uris while redacting", () => {
    for (const [i, r] of rows.entries()) {
      const original = (fixtures[i].position as { occupations?: Array<{ uri: string }> }).occupations ?? [];
      for (const o of original) expect(r!.job.escoOccupationUris).toContain(o.uri);
    }
  });
});

describe("normaliseTmtPosting rules", () => {
  const base = (over: Record<string, unknown> = {}) => ({
    application: { published: "2026-11-01T08:00:00Z", expires: "2026-12-01T00:00:00Z", url: {} },
    location: { municipalities: ["049"], regions: [] },
    metadata: { externalId: "11111111-2222-3333-4444-555555555555", lastModified: "2026-11-01T08:00:00Z" },
    owner: { businessId: "1234567-8", company: { fi: "Testi Oy" } },
    position: {
      title: { fi: "Otsikko" },
      jobDescription: { fi: "Kuvaus." },
      occupations: [{ uri: "http://data.europa.eu/esco/occupation/x" }],
      skills: [],
      workLanguages: ["fi"],
    },
    ...over,
  });

  it("drops the recruiter and redacts contacts in text, raw and links", () => {
    const detail = base({
      recruiter: { contacts: [{ firstName: "Maija", lastName: "Meikäläinen", email: "maija@testi.fi", telephone: "040 123 4567" }] },
      application: {
        published: "2026-11-01T08:00:00Z",
        url: { fi: "mailto:maija@testi.fi" },
        helpText: { fi: "Soita 040 123 4567 tai laita sähköpostia maija(at)testi.fi" },
      },
      position: {
        title: { fi: "Kokki" },
        jobDescription: {
          fi: "Kokin tehtävät.\r\n- Ruoanvalmistus\r\n- Siisteys\r\n\r\nLisätietoja: Maija, puh. +358 40 123 4567, maija.meikalainen@testi.fi. Hae 30.11.2026 mennessä.",
        },
      },
    });
    const n = normaliseTmtPosting(detail)!;
    expect(n.job.url).toBe("https://tyomarkkinatori.fi/henkiloasiakkaat/avoimet-tyopaikat/11111111-2222-3333-4444-555555555555");
    expect(n.job.description).toContain("[removed]");
    expect(n.job.description).toContain("30.11.2026");
    expect(n.job.sentences).toEqual([
      "Kokin tehtävät.",
      "Ruoanvalmistus",
      "Siisteys",
      "Lisätietoja: Maija, puh. [removed], [removed].",
      "Hae 30.11.2026 mennessä.",
    ]);
    const raw = JSON.stringify(n.job.raw);
    expect(raw).not.toContain("recruiter");
    expect(raw).not.toContain("Meikäläinen");
    expect(containsContact(raw)).toBe(false);
    expect(containsContact(JSON.stringify(n.job))).toBe(false);
  });

  it("uses an application link when it is a web address", () => {
    const n = normaliseTmtPosting(
      base({ application: { published: "2026-11-01T08:00:00Z", url: { fi: "", en: "https://jobs.example.com/apply/1" } } }),
    )!;
    expect(n.job.url).toBe("https://jobs.example.com/apply/1");
  });

  it("picks the first of fi, en, sv with a description and sets lang", () => {
    const pick = (descriptions: Record<string, string>, titles: Record<string, string>) =>
      normaliseTmtPosting(base({ position: { title: titles, jobDescription: descriptions, occupations: [], skills: [] } }))!.job;
    expect(pick({ fi: "Suomi.", en: "English." }, { fi: "Otsikko", en: "Title" })).toMatchObject({ lang: "fi", title: "Otsikko", description: "Suomi." });
    expect(pick({ en: "English.", sv: "Svenska." }, { en: "Title", sv: "Rubrik" })).toMatchObject({ lang: "en", title: "Title" });
    expect(pick({ sv: "Svenska." }, { sv: "Rubrik" })).toMatchObject({ lang: "sv", title: "Rubrik" });
    // description only in English but title only in Finnish: language follows the description, title falls back
    expect(pick({ en: "English." }, { fi: "Otsikko" })).toMatchObject({ lang: "en", title: "Otsikko" });
    // no description at all: language follows the title
    expect(pick({ fi: "" }, { en: "Title" })).toMatchObject({ lang: "en", description: "", sentences: [] });
  });

  it("falls back to the marketing description, and returns null without id or title", () => {
    const n = normaliseTmtPosting(
      base({ position: { title: { fi: "T" }, jobDescription: { fi: "" }, marketingDescription: { fi: "Yritys esittely." }, occupations: [] } }),
    )!;
    expect(n.job.description).toBe("Yritys esittely.");
    expect(normaliseTmtPosting(base({ position: { title: {}, jobDescription: {}, occupations: [] } }))).toBeNull();
    expect(normaliseTmtPosting({ position: { title: { fi: "x" } } })).toBeNull();
    expect(normaliseTmtPosting(null)).toBeNull();
    expect(normaliseTmtPosting("nonsense")).toBeNull();
    expect(normaliseTmtPosting({ metadata: { externalId: "abc" } })).toBeNull();
  });

  it("assigns sector by employer name and hides private persons", () => {
    expect(sectorFor("Espoon kaupunki")).toBe("public");
    expect(sectorFor("Länsi-Uudenmaan hyvinvointialue")).toBe("public");
    expect(sectorFor("City of Helsinki")).toBe("public");
    expect(sectorFor("Beneq Oy")).toBe("private");
    expect(sectorFor("")).toBe("unknown");
    const person = normaliseTmtPosting(base({ owner: { employerType: "Person", businessId: "", company: { fi: "Matti Meikäläinen" } } }))!;
    expect(person.job.employerName).toBe("Private person");
    expect(JSON.stringify(person.job)).not.toContain("Matti");
  });

  it("parses work languages, ESCO uris and municipality", () => {
    const n = normaliseTmtPosting(
      base({
        location: { municipalities: ["091", "049"] },
        position: {
          title: { fi: "T" },
          jobDescription: { fi: "x yz" },
          mainOccupation: "http://data.europa.eu/esco/occupation/main",
          occupations: [{ uri: "http://data.europa.eu/esco/occupation/other" }, { uri: "http://data.europa.eu/esco/occupation/main" }],
          skills: [{ uri: "http://data.europa.eu/esco/skill/s1" }, { uri: "http://data.europa.eu/esco/skill/s1" }, {}],
          workLanguages: ["FI", "en", "finnish", 7],
        },
      }),
      { preferMunicipalities: ["049"] },
    )!;
    expect(n.job.workLanguages).toEqual(["fi", "en"]);
    expect(n.job.escoOccupationUris).toEqual(["http://data.europa.eu/esco/occupation/main", "http://data.europa.eu/esco/occupation/other"]);
    expect(n.skillUris).toEqual(["http://data.europa.eu/esco/skill/s1"]);
    expect(n.job).toMatchObject({ municipalityCode: "049", municipality: "Espoo", region: "01" });
    expect(normaliseTmtPosting(base({ location: { municipalities: ["091", "049"] } }))!.job.municipalityCode).toBe("091");
  });

  it("postingSentences strips bullets and markdown and keeps order", () => {
    expect(postingSentences("**Tehtävät**\n* Koodaus\n• Testaus\n1. Suunnittelu\n\nHae nyt. Kiitos!")).toEqual([
      "Tehtävät",
      "Koodaus",
      "Testaus",
      "Suunnittelu",
      "Hae nyt.",
      "Kiitos!",
    ]);
  });
});

// ---------- ingest against a fake Työmarkkinatori ----------

type Server = {
  postings: Map<string, Detail>;
  searchFailPages: Set<number>;
  failingDetails: Set<string>;
  fetch: ReturnType<typeof fakeFetch>;
  detailCalls: () => string[];
};

function summaryOf(d: Detail) {
  return {
    id: d.metadata.externalId,
    title: d.position.title,
    lastModified: d.metadata.lastModified,
    officialMunicipality: "049",
    location: { municipalities: [{ value: "049", label: { fi: "Espoo", sv: "Esbo", en: "Espoo" }, region: "01" }] },
  };
}

function makeServer(initial: Detail[]): Server {
  const postings = new Map(initial.map((d) => [d.metadata.externalId, structuredClone(d)]));
  const searchFailPages = new Set<number>();
  const failingDetails = new Set<string>();
  const routes: FakeRoute[] = [
    (url, init) => {
      if (url.href !== TMT_SEARCH_URL) return undefined;
      const body = JSON.parse(String(init?.body)) as { paging: { pageNumber: number; pageSize: number } };
      const { pageNumber, pageSize } = body.paging;
      if (searchFailPages.has(pageNumber)) return jsonResponse({}, 500);
      const all = [...postings.values()];
      return jsonResponse({
        totalElements: all.length,
        pageSize,
        lastPage: Math.ceil(all.length / pageSize),
        content: all.slice(pageNumber * pageSize, (pageNumber + 1) * pageSize).map(summaryOf),
      });
    },
    (url) => {
      if (!url.href.startsWith(TMT_DETAIL_URL + "/")) return undefined;
      const id = url.pathname.split("/").pop()!;
      if (failingDetails.has(id)) return jsonResponse({}, 500);
      const d = postings.get(id);
      return d ? jsonResponse(d) : jsonResponse({}, 404);
    },
  ];
  const fetch = fakeFetch(routes);
  return { postings, searchFailPages, failingDetails, fetch, detailCalls: () => fetch.calls.filter((c) => c.url.startsWith(TMT_DETAIL_URL)).map((c) => c.url.split("/").pop()!) };
}

describe("ingestTmt", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  }, 60_000);
  afterAll(() => t.close());

  const five = fixtures.slice(0, 5);
  const ids = five.map((d) => tmtJobId(d.metadata.externalId));
  const opts = (server: Server, hour: number, extra = {}) => ({
    municipalities: ["049"],
    pageSize: 2,
    fetchImpl: server.fetch,
    now: () => new Date(`2026-11-13T${String(hour).padStart(2, "0")}:00:00Z`),
    ...FAST,
    ...extra,
  });
  const server = makeServer(five);

  it("pages through search, fetches every detail and stores rows and skill links", async () => {
    const r = await ingestTmt(t.db, opts(server, 8));
    expect(r).toMatchObject({ seen: 5, inserted: 5, updated: 0, unchanged: 0, deactivated: 0, failed: 0, pages: 3, complete: true });
    expect(server.detailCalls()).toHaveLength(5);
    const rows = await t.db.select().from(job).where(inArray(job.id, ids));
    expect(rows).toHaveLength(5);
    expect(rows.every((x) => x.active && x.municipalityCode === "049")).toBe(true);
    for (const row of rows) {
      const detail = server.postings.get(row.sourceId)!;
      const links = await t.db.select().from(jobSkill).where(eq(jobSkill.jobId, row.id));
      const expected = new Set(row.escoSkillUris);
      expect(new Set(links.map((l) => l.skillUri))).toEqual(expected);
      expect(links.every((l) => l.origin === "posting")).toBe(true);
      expect(detail.metadata.externalId).toBe(row.sourceId);
    }
    const search = server.fetch.calls.find((c) => c.url === TMT_SEARCH_URL)!;
    expect(search.body).toMatchObject({ query: "", filters: { municipalities: ["049"] }, paging: { pageNumber: 0, pageSize: 2 }, sorting: "LATEST" });
  });

  it("does not re-fetch unchanged postings and refreshes their last-seen time", async () => {
    const before = server.fetch.calls.length;
    const r = await ingestTmt(t.db, opts(server, 9));
    expect(r).toMatchObject({ seen: 5, inserted: 0, updated: 0, unchanged: 5, failed: 0, complete: true });
    expect(server.fetch.calls.slice(before).some((c) => c.url.startsWith(TMT_DETAIL_URL))).toBe(false);
    const rows = await t.db.select().from(job).where(inArray(job.id, ids));
    expect(rows.every((x) => x.lastSeenAt.toISOString() === "2026-11-13T09:00:00.000Z")).toBe(true);
    expect(rows.every((x) => x.firstSeenAt.toISOString() === "2026-11-13T08:00:00.000Z")).toBe(true);
  });

  it("re-fetches and updates a posting whose lastModified changed", async () => {
    const target = five[0].metadata.externalId;
    const d = server.postings.get(target)!;
    d.metadata.lastModified = "2026-11-13T09:30:00.123456Z";
    d.position.title = { fi: "Päivitetty otsikko" };
    const before = server.fetch.calls.length;
    const r = await ingestTmt(t.db, opts(server, 10));
    expect(r).toMatchObject({ seen: 5, inserted: 0, updated: 1, unchanged: 4, failed: 0 });
    expect(server.fetch.calls.slice(before).filter((c) => c.url.startsWith(TMT_DETAIL_URL)).map((c) => c.url)).toEqual([`${TMT_DETAIL_URL}/${target}`]);
    expect((await getJob(t.db, tmtJobId(target)))!.title).toBe("Päivitetty otsikko");
  });

  it("counts a failing detail as failed, keeps going, and keeps the posting active", async () => {
    const bad = five[1].metadata.externalId;
    const changed = five[2].metadata.externalId;
    server.failingDetails.add(bad);
    server.postings.get(bad)!.metadata.lastModified = "2026-11-13T10:30:00Z";
    server.postings.get(changed)!.metadata.lastModified = "2026-11-13T10:31:00Z";
    const r = await ingestTmt(t.db, opts(server, 11));
    expect(r).toMatchObject({ seen: 5, updated: 1, failed: 1, complete: true, deactivated: 0 });
    expect((await getJob(t.db, tmtJobId(bad)))!.active).toBe(true);
    server.failingDetails.clear();
  });

  it("does not deactivate anything after an incomplete run", async () => {
    const gone = five[4].metadata.externalId;
    server.postings.delete(gone);
    const cut = await ingestTmt(t.db, opts(server, 12, { maxPages: 1 }));
    expect(cut).toMatchObject({ complete: false, deactivated: 0, pages: 1 });
    server.searchFailPages.add(1);
    const broken = await ingestTmt(t.db, opts(server, 13));
    expect(broken).toMatchObject({ complete: false, deactivated: 0 });
    server.searchFailPages.clear();
    expect((await getJob(t.db, tmtJobId(gone)))!.active).toBe(true);
  });

  it("deactivates postings of the scope that vanished after a complete run, and leaves other scopes alone", async () => {
    const gone = five[4].metadata.externalId;
    // A posting of another municipality, not part of this run's scope, must stay active.
    await t.db.insert(job).values({
      id: "job_tmt_other_scope", source: "tmt", sourceId: "other-scope", url: "https://x.example", title: "Elsewhere",
      municipalityCode: "091", region: "01", lastSeenAt: new Date("2026-11-01T00:00:00Z"),
    });
    const r = await ingestTmt(t.db, opts(server, 14));
    expect(r).toMatchObject({ seen: 4, deactivated: 1, complete: true, failed: 0 });
    expect((await getJob(t.db, tmtJobId(gone)))!.active).toBe(false);
    expect((await getJob(t.db, "job_tmt_other_scope"))!.active).toBe(true);
    const active = await t.db.select({ id: job.id }).from(job).where(and(eq(job.source, "tmt"), eq(job.active, true)));
    expect(active.map((a) => a.id).sort()).toEqual([...ids.slice(0, 4), "job_tmt_other_scope"].sort());
  });

  it("reactivates a posting that comes back", async () => {
    const back = five[4];
    server.postings.set(back.metadata.externalId, structuredClone(back));
    const r = await ingestTmt(t.db, opts(server, 15));
    expect(r).toMatchObject({ seen: 5, updated: 1, deactivated: 0 });
    expect((await getJob(t.db, tmtJobId(back.metadata.externalId)))!.active).toBe(true);
  });

  it("getJob and listJobs return the contract shape", async () => {
    const one = await getJob(t.db, ids[3]);
    expect(one).toMatchObject({ id: ids[3], source: "tmt", active: true });
    expect(typeof one!.postedAt).toBe("string");
    expect(await getJob(t.db, "job_missing")).toBeNull();
    const listed = await listJobs(t.db, { municipalityCode: "049", limit: 3 });
    expect(listed).toHaveLength(3);
    expect(listed.every((j) => j.municipalityCode === "049" && j.active)).toBe(true);
    const page2 = await listJobs(t.db, { municipalityCode: "049", limit: 3, offset: 3 });
    expect(page2.map((j) => j.id)).not.toContain(listed[0].id);
    expect(await listJobs(t.db, { municipalityCode: "999" })).toEqual([]);
  });
});
