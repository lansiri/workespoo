import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { talent, talentIdentity } from "@/db/schema";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { cardForCompany, cardForCompanyRevealed, cardForOrganiser, cardForPerson, getApprovedCard } from "./projections";
import { seedCard, seedInterview, signal } from "./test-helpers";

let t: TestDb;
const TALENT = "tal_test00000001";
const NAME = "Aino Virtanen";
const CONTACT = "aino.v@example.org";
const esco = { uri: "http://data.europa.eu/esco/skill/x", labelEn: "manage supplier claims", labelFi: "hallita toimittajareklamaatioita" };

beforeAll(async () => {
  t = await createTestDb();
  await seedInterview(t.db, { lang: "fi", inputMode: "voice" });
  await t.db.update(talent).set({ inPool: true }).where((await import("drizzle-orm")).eq(talent.id, TALENT));
  await t.db.insert(talentIdentity).values({ talentId: TALENT, displayName: NAME, contact: CONTACT });
  await seedCard(t.db, TALENT, {
    status: "approved",
    version: 2,
    // Typed in Finnish, the language of the interview: the words themselves would give that away.
    lookingFor: { roles: ["Warehouse coordinator"], workMode: "hybrid", workLanguages: ["englanti", "ruotsi", "not a language"] },
    signals: [
      signal({ id: "s3", phrase: "SAP", kind: "tool", esco, evidence: [{ turnIndex: 3, sentenceFrom: 2, sentenceTo: 2 }] }),
      signal({ id: "s1", phrase: "Receiving goods", phraseOwn: "Tavaran vastaanotto", evidence: [{ turnIndex: 1, sentenceFrom: 1, sentenceTo: 1 }] }),
      signal({ id: "s2", phrase: "Training workers", evidence: [{ turnIndex: 5, sentenceFrom: 2, sentenceTo: 2 }], hasExample: false }),
    ],
  });
  await seedCard(t.db, TALENT, {
    status: "draft",
    version: 3,
    signals: [signal({ id: "s1", phrase: "Draft only phrase" }), signal({ id: "s9", phrase: "Removed one", status: "removed" })],
  });
}, 120_000);
afterAll(() => t.close());

const keys = (o: object) => Object.keys(o).sort();
const QUOTES = ["I checked every pallet against the delivery note", "I also trained two summer workers on the scanners.", "I worked at a logistics centre, mainly receiving goods."];

describe("projections", () => {
  it("cardForCompany has exactly the company-visible keys, from the approved card only", async () => {
    const c = (await cardForCompany(t.db, TALENT))!;
    expect(keys(c)).toEqual(["handle", "headline", "lookingFor", "renderingLabel", "signals", "summary", "synthetic"]);
    expect(c.signals.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    // group order: skills (by first evidence turn) then tools
    expect(c.signals.map((s) => s.phrase)).toEqual(["Receiving goods", "Training workers", "SAP"]);
    for (const s of c.signals) expect(keys(s)).toEqual(["esco", "id", "kind", "phrase", "rendering"]);
    expect(c.signals[2].esco).toEqual(esco);
    expect(c.signals[0].rendering).toBe("They worked with receiving goods.");
    expect(JSON.stringify(c)).not.toContain("Draft only phrase");
    expect(keys(c.lookingFor)).toEqual(["roles", "startFrom", "workLanguages", "workMode"]);
    // Declared work languages reach a company as codes, never as the person typed them.
    expect(c.lookingFor.workLanguages).toEqual(["en", "sv"]);
  });

  it("cardForOrganiser is the company payload plus pool status, version, approval date and talent id", async () => {
    const company = (await cardForCompany(t.db, TALENT))!;
    const o = (await cardForOrganiser(t.db, TALENT))!;
    expect(keys(o)).toEqual([...keys(company), "approvedAt", "inPool", "talentId", "version"].sort());
    const { approvedAt, inPool, talentId, version, ...rest } = o;
    expect(rest).toEqual(company);
    expect({ inPool, talentId, version }).toEqual({ inPool: true, talentId: TALENT, version: 2 });
    expect(approvedAt).toBeTruthy();
  });

  it("serialised company and organiser payloads carry no quote, name, contact, language or input mode", async () => {
    for (const payload of [await cardForCompany(t.db, TALENT), await cardForOrganiser(t.db, TALENT)]) {
      const json = JSON.stringify(payload);
      for (const q of QUOTES) expect(json).not.toContain(q);
      expect(json).not.toContain(NAME);
      expect(json).not.toContain(CONTACT);
      expect(json).not.toContain("Tavaran vastaanotto");
      for (const forbidden of ['"fi"', "englanti", "ruotsi", "not a language", '"voice"', '"text"', "inputMode", "interviewLang", '"lang"', "quotes", "phraseOwn", "hasExample", "evidence", "identity"]) {
        expect(json).not.toContain(forbidden);
      }
    }
  });

  it("returns null for company, organiser and revealed views when nothing is approved", async () => {
    await seedInterview(t.db, { talentId: "tal_other0000001", interviewId: "int_other0000001", handle: "Pine-11" });
    await seedCard(t.db, "tal_other0000001", { status: "draft", signals: [signal({ id: "s1", phrase: "SAP" })] });
    expect(await cardForCompany(t.db, "tal_other0000001")).toBeNull();
    expect(await cardForOrganiser(t.db, "tal_other0000001")).toBeNull();
    expect(await cardForCompanyRevealed(t.db, "tal_other0000001")).toBeNull();
    expect(await getApprovedCard(t.db, "tal_other0000001")).toBeNull();
  });

  it("cardForCompanyRevealed adds quotes rendered from the transcript, own wording, identity, language and modes", async () => {
    const r = (await cardForCompanyRevealed(t.db, TALENT))!;
    expect(keys(r)).toEqual(["handle", "headline", "identity", "inputModes", "interviewLang", "lookingFor", "renderingLabel", "signals", "summary", "synthetic"]);
    for (const s of r.signals) expect(keys(s)).toEqual(["esco", "id", "kind", "phraseOwn", "phrase", "quotes", "rendering"].sort());
    const byId = Object.fromEntries(r.signals.map((s) => [s.id, s]));
    expect(byId.s1.quotes).toEqual(["I worked at a logistics centre, mainly receiving goods."]);
    expect(byId.s1.phraseOwn).toBe("Tavaran vastaanotto");
    expect(byId.s3.quotes[0]).toContain("I checked every pallet against the delivery note");
    expect(r.identity).toEqual({ displayName: NAME, contact: CONTACT });
    expect(r.interviewLang).toBe("fi");
    expect(r.inputModes).toEqual(["voice"]);
  });

  it("cardForPerson shows the newest card (draft) with quotes, removed notes and no hasExample", async () => {
    const p = (await cardForPerson(t.db, TALENT))!;
    expect(p).toMatchObject({ status: "draft", version: 3, hasApprovedVersion: true, inPool: true, handle: "Birch-27" });
    expect(p.signals.map((s) => [s.id, s.status])).toEqual([["s1", "proposed"], ["s9", "removed"]]);
    expect(JSON.stringify(p)).not.toContain("hasExample");
    expect(p.signals[0].quotes).toEqual(["I worked at a logistics centre, mainly receiving goods."]);
    expect(p.signals[0].stale).toBe(false);
    expect(keys(p.signals[0])).toEqual(
      ["id", "phrase", "phraseOwn", "kind", "esco", "evidence", "status", "addedBy", "quotes", "rendering", "stale"].sort(),
    );
  });

  it("cardForPerson falls back to the approved card when there is no draft", async () => {
    await seedInterview(t.db, { talentId: "tal_third00000001", interviewId: "int_third00000001", handle: "Moss-12" });
    await seedCard(t.db, "tal_third00000001", { status: "approved", signals: [signal({ id: "s1", phrase: "SAP" })] });
    const p = (await cardForPerson(t.db, "tal_third00000001"))!;
    expect(p).toMatchObject({ status: "approved", hasApprovedVersion: false });
    expect(await cardForPerson(t.db, "tal_nobody")).toBeNull();
  });
});
