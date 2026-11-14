import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { escoConcept, escoOccupationSkill, job, jobSkill } from "@/db/schema";
import { GENERIC_MIN_POSTINGS } from "./constants";
import { retrieveForSignals, type RetrievalSignal } from "./retrieval";

const NOW = new Date("2026-11-13T09:00:00Z");
const DAY = 86_400_000;
const sk = (n: string) => `http://esco/skill/${n}`;
const occ = (n: string) => `http://esco/occupation/${n}`;

let t: TestDb;
let seq = 0;

type Post = {
  title: string;
  text?: string;
  code?: string;
  ageDays?: number;
  occupations?: string[];
  skills?: string[];
  expiresAt?: Date;
  active?: boolean;
};

async function addJob(p: Post): Promise<string> {
  const id = `job_${++seq}`;
  await t.db.insert(job).values({
    id,
    source: "tmt",
    sourceId: id,
    url: `https://example.invalid/${id}`,
    title: p.title,
    description: p.text ?? "",
    sentences: p.text ? [p.text] : [],
    municipalityCode: p.code ?? "049",
    postedAt: new Date(NOW.getTime() - (p.ageDays ?? 1) * DAY),
    escoOccupationUris: p.occupations ?? [],
    expiresAt: p.expiresAt ?? null,
    active: p.active ?? true,
  });
  for (const s of p.skills ?? []) await t.db.insert(jobSkill).values({ jobId: id, skillUri: s, origin: "posting" });
  return id;
}

async function ids(signals: RetrievalSignal[], roles: string[] = []) {
  return (await retrieveForSignals(t.db, signals, roles, NOW)).map((c) => c.jobId);
}

const own = (phrase: string, kind: RetrievalSignal["kind"] = "skill", escoUri: string | null = null): RetrievalSignal => ({ phrase, kind, escoUri });

beforeAll(async () => {
  t = await createTestDb();
  await t.db.insert(escoConcept).values([
    { uri: sk("picking"), type: "skill", labelEn: "pick orders for dispatching", labelFi: "suorittaa tilausten keräys lähetystä varten" },
    { uri: sk("wms"), type: "skill", labelEn: "use a warehouse management system", labelFi: "käyttää varastonhallintajärjestelmää" },
    { uri: sk("forklift"), type: "skill", labelEn: "operate forklift", labelFi: "käyttää haarukkatrukkia" },
    { uri: sk("cs"), type: "skill", labelEn: "customer service", labelFi: "asiakaspalvelu" },
    { uri: sk("python"), type: "skill", labelEn: "Python (computer programming)", labelFi: "Python (tietokoneohjelmointi)" },
    { uri: sk("sql"), type: "skill", labelEn: "SQL", labelFi: "SQL" },
    { uri: occ("warehouse"), type: "occupation", labelEn: "warehouse worker", labelFi: "varastotyöntekijä" },
    { uri: occ("dev"), type: "occupation", labelEn: "software developer", labelFi: "ohjelmistokehittäjä" },
  ]);
  await t.db.insert(escoOccupationSkill).values([
    { occupationUri: occ("warehouse"), skillUri: sk("picking"), relation: "essential" },
    { occupationUri: occ("warehouse"), skillUri: sk("forklift"), relation: "essential" },
    { occupationUri: occ("warehouse"), skillUri: sk("wms"), relation: "optional" },
    { occupationUri: occ("dev"), skillUri: sk("python"), relation: "optional" },
    { occupationUri: occ("dev"), skillUri: sk("sql"), relation: "optional" },
  ]);
});
afterAll(() => t.close());

describe("text evidence is a whole phrase", () => {
  it("a posting with the words of a phrase apart is not a mention; one with the phrase is", async () => {
    const apart = await addJob({ title: "Project manager", text: "You manage the system of order intake and the warehouse budget." });
    const together = await addJob({ title: "Planner", text: "You work with our warehouse management system every day." });
    const found = await ids([own("warehouse management system", "skill")]);
    expect(found).toContain(together);
    expect(found).not.toContain(apart);
  });

  it("the ESCO label in Finnish counts as a mention, and a label with a bracket note is said without it", async () => {
    const fi = await addJob({ title: "Myyjä", text: "Tehtäviisi kuuluu asiakaspalvelu myymälässä." });
    const py = await addJob({ title: "Koodari", text: "We write Python and ship daily." });
    expect(await ids([own("service to buyers", "skill", sk("cs"))])).toContain(fi);
    expect(await ids([own("scripting", "skill", sk("python"))])).toContain(py);
  });

  it("the last word is whole too: Excel is not found in 'excellent'", async () => {
    const id = await addJob({ title: "Perks", text: "We offer excellent benefits. Experience with SAP is needed." });
    expect(await ids([own("Excel", "tool"), own("SAP", "tool")])).not.toContain(id);
  });

  it("a signal without an ESCO label can still be mentioned, and links come back for it", async () => {
    const id = await addJob({ title: "Frontend", text: "We build with React and TypeScript." });
    const found = await retrieveForSignals(t.db, [own("React", "skill"), own("TypeScript", "skill")], [], NOW);
    expect(found.find((c) => c.jobId === id)).toMatchObject({
      basis: ["text"],
      links: [
        { signal: 0, link: "mention" },
        { signal: 1, link: "mention" },
      ],
    });
  });
});

describe("the gate", () => {
  it("one tool by itself is not enough, even when it is mentioned or linked through an occupation", async () => {
    const mention = await addJob({ title: "Finance IT", text: "Experience with SAP is needed." });
    const viaOcc = await addJob({ title: "Developer", occupations: [occ("dev")] });
    expect(await ids([own("SAP", "tool")])).not.toContain(mention);
    const py = await ids([own("scripting", "tool", sk("python"))]);
    expect(py).not.toContain(viaOcc);
  });

  it("one non-tool signal in so many words, listed directly or needed by the occupation is enough", async () => {
    const said = await addJob({ title: "Welder wanted", text: "We need someone for stainless welding." });
    const listed = await addJob({ title: "Keräilijä", skills: [sk("picking")] });
    const essential = await addJob({ title: "Varastomies", occupations: [occ("warehouse")] });
    expect(await ids([own("stainless welding", "skill")])).toContain(said);
    expect(await ids([own("order picking", "skill", sk("picking"))])).toEqual(expect.arrayContaining([listed, essential]));
  });

  it("one optional occupation link is not enough for a non-tool signal; two different signals are", async () => {
    const dev = await addJob({ title: "Developer 2", occupations: [occ("dev")] });
    expect(await ids([own("data analysis", "skill", sk("python"))])).not.toContain(dev);
    expect(await ids([own("data analysis", "skill", sk("python")), own("queries", "skill", sk("sql"))])).toContain(dev);
  });

  it("two tools together pass the gate", async () => {
    const id = await addJob({ title: "Support", text: "You use SAP and Excel for reporting." });
    expect(await ids([own("SAP", "tool"), own("Excel", "tool")])).toContain(id);
  });

  it("a signal that links strongly to a large share of postings does not bring a posting in alone, but still counts as one of two", async () => {
    for (let i = 0; i < GENERIC_MIN_POSTINGS + 10; i++) await addJob({ title: `Shop ${i}`, text: "Tehtäviisi kuuluu asiakaspalvelu.", code: "091" });
    const only = await ids([own("serving people", "skill", sk("cs"))]);
    expect(only).toEqual([]);
    const withOther = await addJob({ title: "Kassa", text: "Asiakaspalvelu ja myynti, kassatyö sujuvasti.", code: "091" });
    const both = await ids([own("serving people", "skill", sk("cs")), own("kassatyö", "skill")]);
    expect(both).toEqual([withOther]);
  });

  it("a signal at exactly the minimum count is generic when the pool is small", async () => {
    const n = GENERIC_MIN_POSTINGS;
    for (let i = 0; i < n; i++) await addJob({ title: `Boundary ${i}`, text: "Tehtäviisi kuuluu ompelukoneen huolto.", code: "092" });
    // The pool here is far below 1,000 postings, so 4 percent of it is under the minimum of 40.
    expect(await ids([own("ompelukoneen huolto", "skill")])).toEqual([]);
  });

  it("a declared role close to the title still brings a posting in", async () => {
    const id = await addJob({ title: "Lukkoseppä" });
    expect(await ids([own("gardening", "skill")], ["Lukkoseppä"])).toEqual([id]);
  });

  it("postings outside the area, expired, older than the window, or inactive stay out", async () => {
    const far = await addJob({ title: "Far welding", text: "stainless welding in Oulu", code: "564" });
    const old = await addJob({ title: "Old welding", text: "stainless welding", ageDays: 200 });
    const found = await ids([own("stainless welding", "skill")]);
    expect(found).not.toContain(far);
    expect(found).not.toContain(old);
  });

  it("expired and inactive postings stay out", async () => {
    const live = await addJob({ title: "Live brazing", text: "We need brazing of copper." });
    const expired = await addJob({ title: "Expired brazing", text: "We need brazing of copper.", expiresAt: new Date(NOW.getTime() - DAY) });
    const inactive = await addJob({ title: "Closed brazing", text: "We need brazing of copper.", active: false });
    const found = await ids([own("brazing of copper", "skill")]);
    expect(found).toContain(live);
    expect(found).not.toContain(expired);
    expect(found).not.toContain(inactive);
  });

  it("two signals on one ESCO skill count once at the gate", async () => {
    const dev = await addJob({ title: "Dev dup", occupations: [occ("dev")] });
    const found = await ids([own("Python", "tool", sk("python")), own("Python 3", "tool", sk("python"))]);
    expect(found).not.toContain(dev);
    const skills = await ids([own("scripting", "skill", sk("python")), own("python work", "skill", sk("python"))]);
    expect(skills).not.toContain(dev);
  });
});

describe("the order", () => {
  it("more different signals first, then stronger links, then Espoo, then newer", async () => {
    const two = await addJob({ title: "Two links", text: "Sorting parcels and labelling pallets.", code: "091", ageDays: 30 });
    const strong = await addJob({ title: "Sorter, mention", text: "Sorting parcels in a hall.", code: "091", ageDays: 30 });
    const espoo = await addJob({ title: "Sorter, Espoo", text: "Sorting parcels in a hall.", code: "049", ageDays: 30 });
    const newer = await addJob({ title: "Sorter, newer", text: "Sorting parcels in a hall.", code: "049", ageDays: 5 });
    const direct = await addJob({ title: "Sorter, listed", skills: [sk("picking")], code: "091", ageDays: 30 });
    const found = await ids([own("sorting parcels", "skill"), own("labelling pallets", "skill"), own("order picking", "skill", sk("picking"))]);
    const at = (id: string) => found.indexOf(id);
    expect(at(two)).toBeLessThan(at(direct));
    expect(at(direct)).toBeLessThan(at(strong));
    expect(at(newer)).toBeLessThan(at(espoo));
    expect(at(espoo)).toBeLessThan(at(strong));
  });

  it("tools count once together: a skill with a posting beats two tools", async () => {
    const tools = await addJob({ title: "IT support", text: "SAP and Excel are daily tools." });
    const skill = await addJob({ title: "Keräilijä", skills: [sk("picking")], ageDays: 40 });
    const found = await ids([own("SAP", "tool"), own("Excel", "tool"), own("order picking", "skill", sk("picking"))]);
    expect(found.indexOf(skill)).toBeLessThan(found.indexOf(tools));
  });

  it("no result carries a number about the person or the posting", async () => {
    const [c] = await retrieveForSignals(t.db, [own("sorting parcels", "skill"), own("labelling pallets", "skill")], [], NOW);
    expect(Object.keys(c).sort()).toEqual(["basis", "jobId", "links"]);
  });
});
