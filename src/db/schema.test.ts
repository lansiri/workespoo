import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initialInterviewState } from "@/contracts";
import { createTestDb, type TestDb } from "../../tests/helpers/db";
import {
  escoConcept,
  escoOccupationSkill,
  interview,
  job,
  jobSkill,
  signal,
  signalCard,
  talent,
  turn,
} from "./schema";

const PYTHON = "http://data.europa.eu/esco/skill/python";
const SQL_SKILL = "http://data.europa.eu/esco/skill/sql";
const DEVELOPER = "http://data.europa.eu/esco/occupation/software-developer";

/** Unwrap a raw `db.execute` result: postgres.js returns rows directly, PGlite wraps them. */
function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return (result as { rows: T[] }).rows;
}

describe("database schema", () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb();
    const { db } = t;

    await db.insert(escoConcept).values([
      { uri: PYTHON, type: "skill", labelEn: "Python (computer programming)", labelFi: "Python (tietokoneohjelmointi)" },
      { uri: SQL_SKILL, type: "skill", labelEn: "SQL", labelFi: "SQL" },
      { uri: DEVELOPER, type: "occupation", labelEn: "software developer", labelFi: "ohjelmistokehittäjä" },
    ]);
    await db.insert(escoOccupationSkill).values([
      { occupationUri: DEVELOPER, skillUri: SQL_SKILL, relation: "essential" },
    ]);

    await db.insert(job).values([
      {
        id: "job_direct",
        source: "tmt",
        sourceId: "a",
        url: "https://example.test/a",
        title: "Python-kehittäjä",
        description: "Etsimme Python-kehittäjää Espooseen. Työkieli on englanti.",
        sentences: ["Etsimme Python-kehittäjää Espooseen.", "Työkieli on englanti."],
        municipalityCode: "049",
        escoSkillUris: [PYTHON],
        workLanguages: ["en"],
      },
      {
        id: "job_via_occupation",
        source: "tmt",
        sourceId: "b",
        url: "https://example.test/b",
        title: "Software developer",
        description: "We build data pipelines.",
        sentences: ["We build data pipelines."],
        municipalityCode: "049",
        escoOccupationUris: [DEVELOPER],
      },
      {
        id: "job_unrelated",
        source: "kuntarekry",
        sourceId: "c",
        url: "https://example.test/c",
        title: "Lähihoitaja",
        description: "Hoivatyötä.",
        sentences: ["Hoivatyötä."],
        municipalityCode: "049",
      },
    ]);
    await db.insert(jobSkill).values([{ jobId: "job_direct", skillUri: PYTHON, origin: "posting" }]);

    await db.insert(talent).values({ id: "tal_1", handle: "Maple-42", synthetic: true });
    await db.insert(interview).values({
      id: "int_1",
      talentId: "tal_1",
      mode: "express",
      state: initialInterviewState("en", new Date().toISOString()),
    });
    await db.insert(turn).values([
      { id: "trn_0", interviewId: "int_1", index: 0, role: "interviewer", kind: "opening", text: "Hello." },
      {
        id: "trn_1",
        interviewId: "int_1",
        index: 1,
        role: "participant",
        kind: "answer",
        text: "I write Python. I also use SQL daily.",
        sentences: ["I write Python.", "I also use SQL daily."],
        inputMode: "text",
      },
    ]);
    await db.insert(signal).values([
      {
        talentId: "tal_1",
        id: "s1",
        interviewId: "int_1",
        phrase: "Python programming",
        kind: "skill",
        escoUri: PYTHON,
        evidence: [{ turnIndex: 1, sentenceFrom: 1, sentenceTo: 1 }],
      },
      {
        talentId: "tal_1",
        id: "s2",
        interviewId: "int_1",
        phrase: "SQL queries",
        kind: "tool",
        escoUri: SQL_SKILL,
        evidence: [{ turnIndex: 1, sentenceFrom: 2, sentenceTo: 2 }],
      },
    ]);
  });

  afterAll(async () => {
    await t.close();
  });

  it("finds postings for a person's signals directly and through occupations", async () => {
    const result = await t.db.execute(sql`
      SELECT DISTINCT j.id
      FROM signal s
      JOIN job j ON j.active AND (
        j.id IN (SELECT js.job_id FROM job_skill js WHERE js.skill_uri = s.esco_uri)
        OR j.esco_occupation_uris && ARRAY(
          SELECT eos.occupation_uri FROM esco_occupation_skill eos WHERE eos.skill_uri = s.esco_uri
        )
      )
      WHERE s.talent_id = 'tal_1'
      ORDER BY j.id
    `);
    expect(rows<{ id: string }>(result).map((r) => r.id)).toEqual(["job_direct", "job_via_occupation"]);
  });

  it("supports full-text search over the generated column", async () => {
    const result = await t.db.execute(sql`
      SELECT id FROM job WHERE search @@ plainto_tsquery('simple', 'pipelines') ORDER BY id
    `);
    expect(rows<{ id: string }>(result).map((r) => r.id)).toEqual(["job_via_occupation"]);
  });

  it("supports trigram matching on ESCO labels in English and Finnish", async () => {
    const result = await t.db.execute(sql`
      SELECT uri FROM esco_concept
      WHERE type = 'skill' AND (similarity(label_en, 'python programming') > 0.3 OR similarity(label_fi, 'python ohjelmointi') > 0.3)
    `);
    expect(rows<{ uri: string }>(result).map((r) => r.uri)).toEqual([PYTHON]);
  });

  it("keeps signal ids unique per person and allows one draft plus one approved card", async () => {
    await expect(
      t.db.insert(signal).values({ talentId: "tal_1", id: "s1", phrase: "duplicate", kind: "skill" }),
    ).rejects.toThrow();

    const body = {
      version: 1,
      status: "draft" as const,
      handle: "Maple-42",
      headline: "Writes Python and SQL",
      signals: [],
      lookingFor: { roles: [], workMode: null, startFrom: null, workLanguages: [] },
      companyView: { label: "AI rendering", summary: "", items: [] },
      approvedAt: null,
    };
    await t.db.insert(signalCard).values({ talentId: "tal_1", status: "draft", body });
    await t.db
      .insert(signalCard)
      .values({ talentId: "tal_1", status: "approved", body: { ...body, status: "approved" } });
    await expect(t.db.insert(signalCard).values({ talentId: "tal_1", status: "draft", body })).rejects.toThrow();
  });

  it("removes everything derived from a person when the person is deleted", async () => {
    await t.db.delete(talent).where(eq(talent.id, "tal_1"));
    const left = await t.db
      .select({ id: signal.id })
      .from(signal)
      .where(and(eq(signal.talentId, "tal_1")));
    expect(left).toEqual([]);
    expect(await t.db.select().from(interview)).toEqual([]);
    expect(await t.db.select().from(turn)).toEqual([]);
    expect(await t.db.select().from(signalCard)).toEqual([]);
  });
});
