import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { loadJobFixtures } from "../../../fixtures/load";
import { company, interview, job, jobMatch, jobQueue, needCard, signal, talent, turn } from "@/db/schema";
import type { Intro, NeedCard, SignalCard } from "@/contracts";
import { resetLlmState, setLlmFake, type LlmOptions } from "@/lib/llm";
import { computeFeed, feedForTalent } from "./feed";
import { matchesPayload } from "./payload";
import { STATUTORY_SUFFIX } from "./constants";
import { checkModelReasons, type AllowedPair, type SignalForReason } from "./reasons";
import { addMaskedCompany, addNeed, addPerson, jobIdByTitle, occupationSkillsOf, req } from "./testkit";

const cards = new Map<string, SignalCard>();
const needCards = new Map<string, NeedCard | null>();
let intros: Intro[] = [];
vi.mock("@/features/card", () => ({ getApprovedCard: async (_db: unknown, id: string) => cards.get(id) ?? null }));
vi.mock("@/features/needs", () => ({ getNeedCardForJob: async (_db: unknown, jobId: string) => needCards.get(jobId) ?? null }));
vi.mock("@/features/intros", () => ({ introsForTalent: async () => intros }));

const NOW = new Date("2026-11-13T09:00:00Z");
let t: TestDb;
let calls: LlmOptions[];

beforeAll(async () => {
  t = await createTestDb();
  await loadJobFixtures(t.db);
});
afterAll(() => t.close());
beforeEach(() => {
  calls = [];
  intros = [];
  setLlmFake((opts) => {
    calls.push(opts);
    return { reasons: [] };
  });
});
afterEach(async () => {
  resetLlmState();
  cards.clear();
  needCards.clear();
  await t.db.delete(jobQueue);
  await t.db.delete(needCard);
  await t.db.delete(company);
  await t.db.delete(talent);
});

/** A person whose approved signals are essential skills of the occupation of a fixture posting. */
async function personFor(id: string, title: string, over: { handle?: string; take?: number; roles?: string[] } = {}) {
  const skills = await occupationSkillsOf(t.db, title, over.take ?? 3);
  const card = await addPerson(t.db, {
    id,
    handle: over.handle,
    roles: over.roles,
    signals: skills.map((s, i) => ({ id: `s${i + 1}`, phrase: s.label, escoUri: s.uri })),
  });
  cards.set(id, card);
  return { card, skills };
}

const feedTitles = async (id: string) => (await feedForTalent(t.db, id)).map((f) => f.job.title);

describe("retrieval", () => {
  it("M1: a person with software skills gets software postings, none outside Uusimaa, expired or masked", async () => {
    await personFor("tal_sw", "Mobile Developer");
    const mobileId = await jobIdByTitle(t.db, "Mobile Developer");
    await computeFeed(t.db, "tal_sw", { now: NOW });
    const titles = await feedTitles("tal_sw");
    expect(titles).toContain("Mobile Developer");
    expect(titles.length).toBeGreaterThan(2);
    for (const title of titles) expect(title).toMatch(/developer|kehittäjä|designer/i);

    // Outside Uusimaa: gone.
    await t.db.update(job).set({ municipalityCode: "837", region: "06" }).where(eq(job.id, mobileId));
    await computeFeed(t.db, "tal_sw", { now: NOW });
    expect(await feedTitles("tal_sw")).not.toContain("Mobile Developer");
    await t.db.update(job).set({ municipalityCode: "049", region: "01" }).where(eq(job.id, mobileId));

    // Masked demo company: gone.
    await addMaskedCompany(t.db, "co_demo");
    await addNeed(t.db, { id: "nc_demo", jobId: mobileId, companyId: "co_demo", requirements: [req("r1", "Anything")] });
    await computeFeed(t.db, "tal_sw", { now: NOW });
    expect(await feedTitles("tal_sw")).not.toContain("Mobile Developer");
    await t.db.delete(needCard);

    // Expired: gone. Older than 60 days: gone.
    const [{ expiresAt }] = await t.db.select({ expiresAt: job.expiresAt }).from(job).where(eq(job.id, mobileId));
    await t.db.update(job).set({ expiresAt: new Date("2026-11-12T00:00:00Z") }).where(eq(job.id, mobileId));
    await computeFeed(t.db, "tal_sw", { now: NOW });
    expect(await feedTitles("tal_sw")).not.toContain("Mobile Developer");
    await t.db.update(job).set({ expiresAt }).where(eq(job.id, mobileId));
    await computeFeed(t.db, "tal_sw", { now: new Date("2027-03-01T00:00:00Z") });
    expect(await feedTitles("tal_sw")).toEqual([]);
  });

  it("a person with care skills gets care postings and no software postings", async () => {
    await personFor("tal_care", "Sairaanhoitaja");
    await computeFeed(t.db, "tal_care", { now: NOW });
    const titles = await feedTitles("tal_care");
    expect(titles.some((x) => /sairaanhoitaja/i.test(x))).toBe(true);
    expect(titles.some((x) => /developer|kehittäjä/i.test(x))).toBe(false);
  });

  it("a person with logistics skills gets the forklift posting", async () => {
    await personFor("tal_log", "Trukkikuski");
    await computeFeed(t.db, "tal_log", { now: NOW });
    expect(await feedTitles("tal_log")).toContain("Trukkikuski syksyn rengaslogistiikkaan");
  });

  it("a declared role finds a posting by title, and a person with nothing gets an empty feed", async () => {
    const card = await addPerson(t.db, { id: "tal_role", signals: [{ id: "s1", phrase: "Gardening" }], roles: ["Lukkoseppä"] });
    cards.set("tal_role", card);
    await computeFeed(t.db, "tal_role", { now: NOW });
    const feed = await feedForTalent(t.db, "tal_role");
    expect(feed.map((f) => f.job.title)).toEqual(["Lukkoseppä"]);
    expect(feed[0].match.basis).toContain("role");
    const none = await addPerson(t.db, { id: "tal_none", signals: [{ id: "s1", phrase: "Gardening" }] });
    cards.set("tal_none", none);
    expect(await computeFeed(t.db, "tal_none", { now: NOW })).toEqual({ matches: 0 });
  });

  it("keeps at most 40 postings, records basis and a feed position, and replaces the old rows", async () => {
    await personFor("tal_sw", "Mobile Developer");
    await computeFeed(t.db, "tal_sw", { now: NOW });
    const first = await t.db.select().from(jobMatch).where(eq(jobMatch.talentId, "tal_sw"));
    expect(first.length).toBeLessThanOrEqual(40);
    expect(first.map((r) => r.feedPosition).sort((a, b) => a - b)).toEqual(first.map((_, i) => i));
    expect(first.every((r) => r.body.basis.length > 0 && r.cardVersion === 1)).toBe(true);
    await computeFeed(t.db, "tal_sw", { now: NOW });
    expect(await t.db.select().from(jobMatch).where(eq(jobMatch.talentId, "tal_sw"))).toHaveLength(first.length);
    cards.delete("tal_sw");
    expect(await computeFeed(t.db, "tal_sw", { now: NOW })).toEqual({ matches: 0 });
    expect(await t.db.select().from(jobMatch).where(eq(jobMatch.talentId, "tal_sw"))).toHaveLength(0);
  });
});

describe("reasons", () => {
  async function setup() {
    const { skills } = await personFor("tal_sw", "Mobile Developer");
    const jobId = await jobIdByTitle(t.db, "Mobile Developer");
    const [row] = await t.db.select().from(job).where(eq(job.id, jobId));
    const need: NeedCard = await addNeed(t.db, {
      id: "nc_m",
      jobId,
      title: "Mobile Developer",
      requirements: [
        req("r1", skills[0].label, { escoSkillUris: [skills[0].uri], postingSentence: 0 }),
        req("r2", "Kubernetes in production", { kind: "must" }),
        req("r3", "Fluent Finnish", { kind: "nice", category: "language", languageCode: "fi" }),
        req("r4", "Valid driving licence", { kind: "must", category: "authorisation", statutory: "licence" }),
      ],
    });
    needCards.set(jobId, need);
    return { skills, jobId, sentence: row.sentences[0] };
  }
  const goodReply = (skillPhrase: string) => ({
    reasons: [{ signal: "S1", sentence: "P0", text: `Your card mentions ${skillPhrase}; the posting asks for the same kind of work.` }],
  });

  it("uses the model's wording for an allowed pair and attaches evidence by reference", async () => {
    const { skills, jobId } = await setup();
    setLlmFake((opts) => {
      calls.push(opts);
      return goodReply(skills[0].label);
    });
    await computeFeed(t.db, "tal_sw", { now: NOW });
    const mine = (await feedForTalent(t.db, "tal_sw")).find((f) => f.job.id === jobId)!;
    expect(mine.match.reasonsSource).toBe("model");
    expect(mine.match.reasons).toEqual([
      expect.objectContaining({ signalId: "s1", postingSentence: 0, evidence: { turnIndex: 1, sentenceFrom: 1, sentenceTo: 1 } }),
    ]);
    expect(mine.match.reasons[0].text).toContain(skills[0].label);
    expect(calls.every((c) => c.role === "analyst" && c.purpose === "matching.feed_reasons" && c.db)).toBe(true);
  });

  it("M12: the prompt holds only title, signal phrases and renderings, posting sentences and pairs", async () => {
    await setup();
    // A transcript line, a handle and a mode that must never reach the model.
    await t.db.update(talent).set({ handle: "Birch-27" }).where(eq(talent.id, "tal_sw"));
    cards.get("tal_sw")!.handle = "Birch-27";
    await t.db.insert(interview).values({ id: "int_1", talentId: "tal_sw", mode: "express", lang: "fi", state: {} as never });
    await t.db.insert(turn).values({
      id: "trn_1", interviewId: "int_1", index: 1, role: "participant", kind: "answer" as never,
      text: "Secret transcript sentence about my kitchen.", sentences: ["Secret transcript sentence about my kitchen."], inputMode: "voice",
    });
    await computeFeed(t.db, "tal_sw", { now: NOW });
    const prompt = JSON.stringify(calls.map((c) => c.messages));
    expect(calls.length).toBeGreaterThan(0);
    for (const banned of ["Birch-27", "Secret transcript", "kitchen", "voice", "express", "tal_sw", "interview", "inputMode"]) {
      expect(prompt).not.toContain(banned);
    }
    expect(prompt).toContain("Allowed pairs");
    expect(prompt).toContain("Posting title: Mobile Developer");
  });

  it.each([
    ["praise and the word match", "You are a strong match for this Python role."],
    ["a fraction", "Your card mentions SQL; you meet 2/5 requirements of the posting."],
    ["a percentage", "Your card mentions SQL; the posting asks for it, about 80% of it."],
    ["the word fit", "Your card mentions SQL; this would fit the posting."],
  ])("falls back to the code reason when the model's text has %s", async (_name, text) => {
    const { jobId } = await setup();
    setLlmFake(() => ({ reasons: [{ signal: "S1", sentence: "P0", text }] }));
    await computeFeed(t.db, "tal_sw", { now: NOW });
    const mine = (await feedForTalent(t.db, "tal_sw")).find((f) => f.job.id === jobId)!;
    expect(mine.match.reasonsSource).toBe("code");
    expect(mine.match.reasons[0].text).toMatch(/^Your card mentions .+\. This posting lists /);
  });

  it("falls back to the code reason when the model cites a pair that is not allowed, returns junk, or throws", async () => {
    const { jobId } = await setup();
    for (const reply of [
      () => ({ reasons: [{ signal: "S2", sentence: "P9", text: "Your card mentions Kubernetes; the posting asks for it." }] }),
      () => "this is not json at all",
      () => {
        throw new Error("model down");
      },
    ]) {
      setLlmFake(reply);
      await computeFeed(t.db, "tal_sw", { now: NOW });
      const mine = (await feedForTalent(t.db, "tal_sw")).find((f) => f.job.id === jobId)!;
      expect(mine.match.reasonsSource).toBe("code");
      expect(mine.match.reasons).toHaveLength(1);
    }
  });

  it("checkModelReasons drops each documented bad output, and repeats of one signal", () => {
    const signals: SignalForReason[] = [
      { id: "s1", phrase: "Python", rendering: null, evidence: null },
      { id: "s2", phrase: "SQL", rendering: null, evidence: null },
    ];
    const pairs: AllowedPair[] = [
      { signalId: "s1", sentence: 4, via: "requirement", listed: "Python" },
      { signalId: "s2", sentence: 5, via: "requirement", listed: "SQL" },
    ];
    const out = checkModelReasons(
      {
        reasons: [
          { signal: "S1", sentence: "P4", text: "You are a strong match for this Python role." },
          { signal: "S4", sentence: "P9", text: "Your card mentions Kubernetes; the posting asks for it." },
          { signal: "S2", sentence: "P5", text: "You meet 2/5 requirements." },
          { signal: "S1", sentence: "P4", text: "Your card mentions Python; the posting asks for Python skills." },
          { signal: "S1", sentence: "P4", text: "Your card mentions Python again; the posting asks for Python." },
        ],
      },
      pairs,
      signals,
    );
    expect(out.reasons.map((r) => r.text)).toEqual(["Your card mentions Python; the posting asks for Python skills."]);
    expect(out.dropped).toEqual(["banned_wording", "pair_not_allowed", "banned_wording", "duplicate_signal"]);
  });

  it("builds 'not mentioned' from the Need Card: untouched requirements, must first, statutory marked", async () => {
    const { jobId } = await setup();
    await computeFeed(t.db, "tal_sw", { now: NOW });
    const mine = (await feedForTalent(t.db, "tal_sw")).find((f) => f.job.id === jobId)!;
    // r1 is touched and r3 (Finnish) is not held; must items come before nice, never the touched one.
    expect(mine.match.notMentioned).toEqual([
      "Kubernetes in production",
      `Valid driving licence${STATUTORY_SUFFIX}`,
      "Fluent Finnish",
    ]);
  });

  it("asks the needs feature to draft a card for postings without one, and for none that have one", async () => {
    const { jobId } = await setup();
    await computeFeed(t.db, "tal_sw", { now: NOW });
    const drafts = (await t.db.select().from(jobQueue)).filter((j) => j.kind === "needs.draft");
    const ids = drafts.map((d) => (d.payload as { jobId: string }).jobId);
    expect(drafts.every((d) => (d.payload as { companyId: unknown }).companyId === null)).toBe(true);
    expect(ids).not.toContain(jobId);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("stability and fairness", () => {
  const snapshot = async (id: string) =>
    (await feedForTalent(t.db, id)).map(({ match, job: j }) => ({
      job: j.id,
      pos: match.feedPosition,
      basis: match.basis,
      source: match.reasonsSource,
      reasons: match.reasons,
      notMentioned: match.notMentioned,
    }));

  it("the feed is stable for the same card version, including model wording", async () => {
    await personFor("tal_sw", "Mobile Developer");
    let n = 0;
    setLlmFake(() => ({ reasons: [{ signal: "S1", sentence: null, text: `Your card mentions it; version ${++n}.` }] }));
    await computeFeed(t.db, "tal_sw", { now: NOW });
    const a = await snapshot("tal_sw");
    await computeFeed(t.db, "tal_sw", { now: NOW });
    expect(await snapshot("tal_sw")).toEqual(a);
  });

  it("twins with identical signals and different handles get identical feeds", async () => {
    const skills = await occupationSkillsOf(t.db, "Sairaanhoitaja", 3);
    for (const [id, handle] of [["tal_t1", "Birch-11"], ["tal_t2", "Aspen-99"]] as const) {
      cards.set(id, await addPerson(t.db, { id, handle, signals: skills.map((s, i) => ({ id: `s${i + 1}`, phrase: s.label, escoUri: s.uri })) }));
    }
    await computeFeed(t.db, "tal_t1", { now: NOW });
    await computeFeed(t.db, "tal_t2", { now: NOW });
    const [a, b] = [await snapshot("tal_t1"), await snapshot("tal_t2")];
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it("no stored or returned field carries a score, rank or count of overlap", async () => {
    await personFor("tal_sw", "Mobile Developer");
    await computeFeed(t.db, "tal_sw", { now: NOW });
    const payload = await matchesPayload(t.db, "tal_sw");
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) {
          keys.add(k);
          walk(x);
        }
      }
    };
    walk(payload);
    walk((await t.db.select().from(jobMatch)).map((r) => r.body));
    expect([...keys].filter((k) => /score|rank|similarity|overlap|weight|percent|level|count/i.test(k))).toEqual([]);
  });
});

describe("the payload for /matches", () => {
  it("M2: shows the real employer, the source attribution, the link, renderings and the person's own words", async () => {
    const { skills } = await personFor("tal_sw", "Mobile Developer");
    await t.db.insert(interview).values({ id: "int_1", talentId: "tal_sw", mode: "express", state: {} as never });
    await t.db.insert(turn).values({
      id: "trn_1", interviewId: "int_1", index: 1, role: "participant", kind: "answer" as never,
      text: "I build apps. I ship them.", sentences: ["I build apps.", "I ship them."],
    });
    await t.db.update(signal).set({ interviewId: "int_1" }).where(eq(signal.talentId, "tal_sw"));
    const jobId = await jobIdByTitle(t.db, "Mobile Developer");
    needCards.set(
      jobId,
      await addNeed(t.db, { id: "nc_m", jobId, requirements: [req("r1", skills[0].label, { escoSkillUris: [skills[0].uri], postingSentence: 0 })] }),
    );
    setLlmFake(() => ({ reasons: [{ signal: "S1", sentence: "P0", text: "Your card mentions apps; the posting asks for them." }] }));
    intros = [{ id: "intro_1", status: "awaiting_talent" } as Intro];
    await computeFeed(t.db, "tal_sw", { now: NOW });
    const payload = await matchesPayload(t.db, "tal_sw");
    const item = payload.matches.find((m) => m.jobId === jobId)!;
    expect(item.employerName.length).toBeGreaterThan(0);
    expect(item.attribution).toBe("Lähde: Työmarkkinatorin asiakastietojärjestelmä (Job Market Finland)");
    expect(item.url).toMatch(/^http/);
    expect(item.reasons[0].rendering).toContain(skills[0].label);
    expect(item.reasons[0].quote).toBe("I build apps.");
    expect(item.reasons[0].postingSentence).toBeTruthy();
    expect(payload.intros).toEqual(intros);
  });

  it("degrades to empty introductions when that feature fails", async () => {
    await personFor("tal_sw", "Mobile Developer");
    const mod = await import("@/features/intros");
    vi.spyOn(mod, "introsForTalent").mockRejectedValueOnce(new Error("not implemented yet"));
    expect((await matchesPayload(t.db, "tal_sw")).intros).toEqual([]);
  });
});

