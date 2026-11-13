import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { company, job, needCard } from "@/db/schema";
import { containsContactCue } from "@/lib/redact";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { FIXTURE_TMT_POSTINGS } from "../../../fixtures/load";
import { rescrubStoredPostings } from "./index";
import { decodeEntities, normaliseTmtPosting, postingSentences } from "./tmt";

describe("fixture postings", () => {
  const rows = (FIXTURE_TMT_POSTINGS() as unknown[]).map((d) => normaliseTmtPosting(d)!.job);

  it("have no contact cue in the description, and no cue or name in the sentences", () => {
    for (const r of rows) {
      for (const line of r.description!.split("\n")) expect(containsContactCue(line)).toBe(false);
      expect(r.description).not.toContain("[removed]");
      for (const s of r.sentences!) expect(s === "[removed]" || !containsContactCue(s)).toBe(true);
    }
  });

  it("keep no recruiter names from the lab list anywhere in the row", () => {
    const text = JSON.stringify(rows);
    for (const name of ["Grönholm", "Rytsölä", "Zahkna", "Jan Kollin", "Mika Suominen", "Kärsämä", "Roine", "Kerimaa", "Valtaoja", "Kumar", "Kuldip"]) {
      expect(text).not.toContain(name);
    }
  });
});

describe("entities and empty sentences", () => {
  it("decodes entities and drops sentences without letters or digits", () => {
    expect(decodeEntities("A&nbsp;&amp;&nbsp;B &#228; &#xE4;")).toBe("A & B ä ä");
    expect(postingSentences("&nbsp;\nHello there.\n...\n&nbsp;&nbsp;")).toEqual(["Hello there."]);
  });
});

describe("rescrubStoredPostings", () => {
  let t: TestDb;
  const base = {
    source: "tmt" as const,
    url: "https://example.test/x",
    title: "Kehittäjä",
    employerName: "Acme Oy",
    sector: "private" as const,
    lang: "fi" as const,
    workLanguages: [],
    escoOccupationUris: [],
    escoSkillUris: [],
    active: true,
  };
  const dirty = "Kehität sovelluksia.\nLisätietoja antaa Maija Meikäläinen, puh. [removed].\nMaija Meikäläinen\nHae pian.";
  const sentences = ["Kehität sovelluksia.", "Lisätietoja antaa Maija Meikäläinen, puh. [removed].", "Maija Meikäläinen", "Hae pian."];

  beforeAll(async () => {
    t = await createTestDb();
    await t.db.insert(job).values([
      { ...base, id: "j_card", sourceId: "1", description: dirty, sentences, raw: { position: { x: dirty } } },
      { ...base, id: "j_plain", sourceId: "2", description: dirty, sentences, raw: null },
    ]);
    await t.db.insert(company).values({ id: "co", displayName: "Demo", source: "synthetic", digestToken: "tok" });
    await t.db.insert(needCard).values({ id: "nc", jobId: "j_card", companyId: "co", body: {} as never });
  });
  afterAll(() => t.close());

  it("keeps positions with a Need Card, recomputes without, and is safe twice", async () => {
    const first = await rescrubStoredPostings(t.db);
    expect(first).toEqual({ postings: 2, changed: 2 });
    const [card] = await t.db.select().from(job).where(eq(job.id, "j_card"));
    const [plain] = await t.db.select().from(job).where(eq(job.id, "j_plain"));
    expect(card.sentences).toEqual(["Kehität sovelluksia.", "[removed]", "[removed]", "Hae pian."]);
    expect(plain.sentences).toEqual(["Kehität sovelluksia.", "[removed]", "[removed]", "Hae pian."]);
    for (const row of [card, plain]) {
      expect(row.description).toBe("Kehität sovelluksia.\nHae pian.");
      expect(JSON.stringify(row)).not.toContain("Maija");
    }
    expect(JSON.stringify(card.raw)).not.toContain("Maija");
    const second = await rescrubStoredPostings(t.db);
    expect(second).toEqual({ postings: 2, changed: 0 });
  });
});
