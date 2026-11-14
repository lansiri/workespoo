/**
 * One person travels the whole product through the real features: interview, card, approval,
 * a Need Card for a masked company, the person's feed, the daily pick, the organiser's decision
 * and publish, the company page, "ask to meet", the person's acceptance and the reveal.
 *
 * Only the model is a stand-in (`journeyModel`). The database is PGlite with the fixture postings,
 * the route handlers are called with real `Request` objects, and the queue runs the real jobs.
 * Sessions are the only other stand-in: a route reads who is signed in from a cookie, and a test
 * has no cookie, so `requireTalent` and `requireOrganiser` answer from two variables.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { AuditAction, CardForCompany, CardForPerson, CoverageArea, TurnKind } from "@/contracts";
import { turn as turnTable, company, digest, eligibility, jobMatch, jobQueue, needCard, pick, talent, talentIdentity } from "@/db/schema";
import { HttpError } from "@/lib/http";
import { listAudit } from "@/lib/audit";
import { resetLlmState, setLlmFake } from "@/lib/llm";
import { runReadyJobs } from "@/lib/queue";
import { allJobs, backgroundKinds } from "@/worker/registry";
import { createTestDb, type TestDb } from "../../../tests/helpers/db";
import { loadJobFixtures } from "../../../fixtures/load";

const mocks = vi.hoisted(() => ({ db: null as unknown as Db, talentId: null as string | null, organiser: false }));
vi.mock("@/db/client", () => ({ getDb: () => mocks.db }));
vi.mock("@/lib/session", async () => {
  const real = await vi.importActual<typeof import("@/lib/session")>("@/lib/session");
  return {
    ...real,
    requireTalent: async () => {
      if (!mocks.talentId) throw new HttpError(401, "unauthenticated", "Sign in to continue");
      return mocks.talentId;
    },
    requireOrganiser: async () => {
      if (!mocks.organiser) throw new HttpError(401, "unauthenticated", "Organiser sign-in required");
    },
  };
});

import { approveCard, cardForPerson, setPoolOptIn } from "@/features/card";
import { settleInterview, startInterview, submitTurn } from "@/features/interview";
import { computeEligibility, feedForTalent } from "@/features/matching";
import { getNeedCard, draftNeedCard } from "@/features/needs";
import { draftDailyDigests } from "@/features/picks";
import { buildCompanyPage } from "@/features/picks";
import { GET as matchesRoute } from "@/app/api/matches/route";
import { GET as queueRoute } from "@/app/api/picks/queue/route";
import { POST as decisionRoute } from "@/app/api/picks/decision/route";
import { POST as publishRoute } from "@/app/api/digests/[id]/publish/route";
import { POST as askRoute } from "@/app/api/intros/route";
import { POST as respondRoute } from "@/app/api/intros/[id]/respond/route";
import { ScriptedCandidate } from "./candidate";
import { journeyModel } from "./journey-model";
import { loadPersonas } from "./persona";
import { SIMULATED_TRANSCRIPT_LINE } from "./run";

const persona = loadPersonas().find((p) => p.id === "p01")!;
const NOW = new Date("2026-11-14T09:00:00Z");
const TODAY = "2026-11-14";
const POSTING = "FullStack Developer (Java, SpringBoot)";
const COMPANY_ID = "co_journey";
const COMPANY_TOKEN = "journey-company-token-0123456789";

/** Everything the persona says in an interview: a quote on a card must be one of these sentences. */
const spoken = [...Object.values(persona.answers), ...persona.probes].join(" ");

const model = journeyModel({
  persona,
  need: {
    postingTitle: POSTING,
    title: "Full-stack developer (Java)",
    summary: "Builds Java and Spring Boot solutions end to end in a development team.",
    items: [
      { sentenceStarts: "Relevant work experience with Java", text: "Java and Spring Boot work experience", kind: "must", category: "experience", years: 1, esco: ["computer programming"] },
      { sentenceStarts: "Good understanding of modern full-stack", text: "Full-stack development", kind: "must", esco: ["computer programming", "web services"] },
      { sentenceStarts: "Self-motivated", text: "Self-motivated, open-minded", kind: "must", category: "other", question: { type: "vague", text: "What does 'self-motivated and open-minded' look like in this job? One concrete example helps us find people who have done it.", why: "The posting does not say what this means in practice." } },
      { sentenceStarts: "Fluent communication skills in English", text: "Fluent English", kind: "must", category: "language", language: "en" },
      { sentenceStarts: "Familiarity with DevOps", text: "DevOps practices", kind: "nice", esco: ["tools for software configuration management"] },
      { sentenceStarts: "Experience with Web UI", text: "Web UI development", kind: "nice", esco: ["web services"] },
    ],
  },
});

let t: TestDb;
let interviewId = "";
let talentId = "";
let needId = "";
let digestId = "";
let pickId = "";
let introId = "";
let signalLabels: string[] = [];

const json = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

/** Run every ready queue job, as the worker does, until nothing is left. */
async function runQueue(): Promise<number> {
  // The feed queues its Need Card drafts a few seconds ahead so that quick jobs go first.
  // Run what is ready, move the clock past the delay, and run again until nothing is left.
  let total = 0;
  for (let pass = 0; pass < 30; pass++) {
    const ran = await runReadyJobs(t.db, allJobs, { last: backgroundKinds });
    total += ran;
    const open = await t.db.select({ id: jobQueue.id }).from(jobQueue).where(isNull(jobQueue.doneAt));
    if (open.length === 0) break;
    if (ran === 0) vi.setSystemTime(new Date(Date.now() + 30_000));
  }
  return total;
}
const actions = async (action: AuditAction) => (await listAudit(t.db, { action })).length;

beforeAll(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  t = await createTestDb();
  mocks.db = t.db;
  await loadJobFixtures(t.db);
  setLlmFake(model.fake);
}, 120_000);
afterAll(async () => {
  resetLlmState();
  vi.useRealTimers();
  await t.close();
});

describe("one person through the whole product", () => {
  it("1. the interview: scripted answers through the engine, stored as the person's own sentences", async () => {
    const started = await startInterview(t.db, { mode: persona.interviewMode, uiLang: persona.interviewLang, consent: { interview: true, voiceVendor: false, liveDemo: true } });
    interviewId = started.interviewId;
    talentId = started.talentId;
    expect(started.opening.kind).toBe("opening");

    const candidate = new ScriptedCandidate(persona);
    let last: { kind: TurnKind; target: CoverageArea | null } = { kind: started.opening.kind, target: started.opening.target };
    for (let n = 0; n < 16; n++) {
      const text = candidate.reply(last);
      if (text === null) break;
      let repliedAt: number | null = null;
      for await (const event of submitTurn(t.db, interviewId, { text, inputMode: persona.inputMode })) {
        if (event.type === "turn.done") repliedAt = event.turnIndex;
        expect(event.type).not.toBe("error");
      }
      expect(repliedAt).not.toBeNull();
      // The area the interviewer asked about is on the stored turn, as the simulator reads it.
      const [reply] = await t.db.select().from(turnTable).where(and(eq(turnTable.interviewId, interviewId), eq(turnTable.index, repliedAt!)));
      last = { kind: reply!.kind, target: reply!.target ?? null };
    }
    expect(last.kind).toBe("closing");
    await settleInterview(t.db, interviewId, 20_000);

    expect(await actions("interview.started")).toBe(1);
    expect(model.calls.filter((c) => c.purpose === "interview.extract").length).toBeGreaterThan(0);
    expect(model.calls.filter((c) => c.purpose === "card.synthesis")).toHaveLength(1);
  }, 120_000);

  it("2. the draft card has signals whose evidence resolves to the person's own sentences", async () => {
    const card = (await cardForPerson(t.db, talentId)) as CardForPerson;
    expect(card).not.toBeNull();
    expect(card.status).toBe("draft");
    expect(card.signals.length).toBeGreaterThanOrEqual(3);
    signalLabels = card.signals.map((s) => s.phrase);
    const turns = await t.db.select().from(turnTable).where(eq(turnTable.interviewId, interviewId));
    let quoted = 0;
    for (const s of card.signals) {
      expect(s.evidence.length).toBeGreaterThan(0);
      // The card stores references; the quotes are rendered from the stored transcript by code.
      const rendered = s.evidence.map((ref) => {
        const row = turns.find((x) => x.index === ref.turnIndex)!;
        expect(row.role).toBe("participant");
        return row.sentences.slice(ref.sentenceFrom - 1, ref.sentenceTo).join(" ");
      });
      expect(s.quotes).toEqual(rendered);
      for (const quote of s.quotes) {
        expect(spoken).toContain(quote);
        quoted++;
      }
      // The words of the fact sheet's protected sentence are not on the card.
      expect(`${s.phrase} ${s.quotes.join(" ")} ${s.rendering ?? ""}`).not.toMatch(/\b38\b|husband|Porto|Portugal/i);
    }
    expect(quoted).toBeGreaterThanOrEqual(3);
    expect(card.headline).not.toMatch(/\b38\b|husband|Porto|Portugal/i);
    // The stand-in model repeated the planted sentence in a signal's rendering. The card feature's
    // guard caught it: the note keeps its evidence with a code-written sentence (counted as
    // salvaged), or is dropped when nothing clean is left. Either way the words are gone (above).
    const [synthesised] = await listAudit(t.db, { action: "card.synthesised" });
    const caught = Number((synthesised?.detail as { salvaged?: number } | undefined)?.salvaged ?? 0) + (await actions("card.protected_dropped"));
    expect(caught).toBeGreaterThan(0);
    expect(await actions("card.synthesised")).toBe(1);
  });

  it("3. approval and pool opt-in enqueue the matching work, which the worker runs", { timeout: 300_000 }, async () => {
    await approveCard(t.db, talentId);
    await setPoolOptIn(t.db, talentId, true);
    expect(await actions("card.approved")).toBe(1);
    const queued = await t.db.select().from(jobQueue);
    expect(queued.some((j) => j.kind === "matching.card_approved")).toBe(true);
    await runQueue();
    expect(await t.db.select().from(jobQueue).where(isNull(jobQueue.doneAt))).toHaveLength(0);
    expect((await cardForPerson(t.db, talentId))?.status).toBe("approved");
    expect((await t.db.select().from(talent).where(eq(talent.id, talentId)))[0]!.inPool).toBe(true);
  });

  it("4. the person's feed has postings, each with a reason", async () => {
    const feed = await feedForTalent(t.db, talentId);
    expect(feed.length).toBeGreaterThan(0);
    mocks.talentId = talentId;
    const res = await matchesRoute(new Request("http://localhost/api/matches"), undefined as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { matches: Array<{ reasons: unknown[]; job: { title: string } }> };
    expect(body.matches.length).toBe(feed.length);
    expect(body.matches.every((m) => m.reasons.length > 0)).toBe(true);
    expect((await t.db.select().from(jobMatch).where(eq(jobMatch.talentId, talentId))).length).toBe(feed.length);
  });

  it("5. a Need Card is drafted for a masked company, and the person counts for it", { timeout: 300_000 }, async () => {
    await t.db.insert(company).values({ id: COMPANY_ID, displayName: "Demo company 01", realName: "Academic Work Finland Oy", source: "posting", masked: true, participating: true, digestToken: COMPANY_TOKEN });
    const { job } = await import("@/db/schema");
    const [posting] = (await t.db.select({ id: job.id, title: job.title }).from(job)).filter((j) => j.title.includes(POSTING));
    const card = await draftNeedCard(t.db, posting.id, COMPANY_ID);
    needId = card.id;
    expect(card.requirements.length).toBe(6);
    // The feed may already have drafted a company-less card for this posting; the company's draft takes it over.
    expect(card.companyId).toBe(COMPANY_ID);
    expect((await listAudit(t.db, { action: "needcard.drafted", subjectId: needId })).length).toBeGreaterThanOrEqual(1);
    await runQueue();
    const [row] = await t.db.select().from(eligibility).where(and(eq(eligibility.needCardId, needId), eq(eligibility.talentId, talentId)));
    expect(row?.eligible).toBe(true);
    expect(row.touchedRequirementIds.length).toBeGreaterThan(0);
    // The direct call agrees with the queue job.
    await computeEligibility(t.db, { needCardId: needId });
    const refreshed = (await getNeedCard(t.db, needId))!;
    expect(refreshed.requirements.some((r) => r.pool !== null && r.pool.scope !== undefined)).toBe(true);
  });

  it("6. nothing is drafted for the company before the daily run, and the page shows no pick", async () => {
    expect(await t.db.select().from(pick)).toHaveLength(0);
    const page = await buildCompanyPage(t.db, COMPANY_TOKEN);
    expect(page?.digest).toBeNull();
  });

  it("7. the daily run drafts one pick; it is in the organiser's queue and not on the company page", async () => {
    const drafted = await draftDailyDigests(t.db, TODAY);
    expect(drafted).toMatchObject({ digests: 1, picks: 1 });
    expect(await actions("digest.drafted")).toBeGreaterThanOrEqual(1);
    expect(await actions("pick.drafted")).toBe(1);

    mocks.organiser = true;
    const res = await queueRoute(new Request("http://localhost/api/picks/queue"), undefined as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { digests: Array<{ id: string; status: string; needs: Array<{ picks: Array<{ id: string; reasons: unknown[] }> }> }> };
    const d = body.digests.find((x) => x.status === "draft")!;
    digestId = d.id;
    const p = d.needs.flatMap((n) => n.picks)[0]!;
    pickId = p.id;
    expect(p.reasons.length).toBeGreaterThan(0);

    const page = await buildCompanyPage(t.db, COMPANY_TOKEN);
    expect(page?.digest).toBeNull();
  });

  it("8. the organiser decides the pick, then publishes; only then does the company see it", async () => {
    mocks.organiser = true;
    const early = await publishRoute(json(`/api/digests/${digestId}/publish`, {}), ctx(digestId));
    expect(early.status).toBeGreaterThanOrEqual(400); // refuses while a pick is undecided
    expect((await buildCompanyPage(t.db, COMPANY_TOKEN))?.digest).toBeNull();

    const decided = await decisionRoute(json("/api/picks/decision", { pickId, decision: "approve" }), undefined as never);
    expect(decided.status).toBe(200);
    // Approved but not published: still nothing on the company page.
    expect((await buildCompanyPage(t.db, COMPANY_TOKEN))?.digest).toBeNull();

    const published = await publishRoute(json(`/api/digests/${digestId}/publish`, {}), ctx(digestId));
    expect(published.status).toBe(200);
    expect(await actions("pick.approved")).toBe(1);
    expect(await actions("digest.published")).toBe(1);
  });

  it("9. the company page shows the pick with reasons and the English rendering, and nothing that identifies the person", async () => {
    const page = (await buildCompanyPage(t.db, COMPANY_TOKEN))!;
    expect(page.company.displayName).toBe("Demo company 01");
    const picks = page.digest!.groups.flatMap((g) => g.picks);
    expect(picks).toHaveLength(1);
    const view = picks[0]!;
    expect(view.reasons.length).toBeGreaterThan(0);
    expect(view.revealed).toBeNull();
    expect(view.canAsk).toBe(true);
    const text = JSON.stringify(page);
    const person = (await t.db.select().from(talent).where(eq(talent.id, talentId)))[0]!;
    expect(text).not.toContain(persona.name);
    expect(text).not.toContain(persona.email);
    expect(text).not.toContain(talentId);
    // Whole words only, and not inside timestamps, the link token or the person's handle: ids are
    // random letters and digits and may contain "38" by chance, a clock reads 12:38 once an hour,
    // and a handle is a made-up word with a random number ("Birch-38").
    const prose = text.replaceAll(COMPANY_TOKEN, "").replaceAll(person.handle, "").replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, "");
    const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const planted of persona.planted.flatMap((p) => [...p.tokens, ...p.alsoCheck])) {
      expect(prose, planted).not.toMatch(new RegExp(`(?<![\\p{L}\\p{N}_])${escape(planted)}(?![\\p{L}\\p{N}_])`, "iu"));
    }
    expect(text).not.toContain(SIMULATED_TRANSCRIPT_LINE);
    expect(text).not.toContain("inputMode");
    expect(text).not.toContain("interviewLang");
    expect(text).not.toContain("phraseOwn\":\"");
    expect(text).not.toContain("Academic Work");
    expect(person.handle).toBeTruthy();
    const company_: CardForCompany = view.card;
    // The company-level card: English renderings and labels, never the person's quotes or own phrases.
    expect(company_.signals.length).toBeGreaterThanOrEqual(3);
    for (const sig of company_.signals) {
      expect(Object.keys(sig)).not.toContain("quotes");
      expect(Object.keys(sig)).not.toContain("phraseOwn");
    }
    expect(company_.renderingLabel).toMatch(/not a quote/i);
  });

  it("10. the company asks to meet; the person sees who is asking; nothing is revealed yet", async () => {
    const res = await askRoute(json("/api/intros", { token: COMPANY_TOKEN, pickId }), undefined as never);
    expect(res.status).toBe(201);
    introId = ((await res.json()) as { id: string }).id;
    expect(await actions("intro.requested")).toBe(1);

    mocks.talentId = talentId;
    const mine = (await (await matchesRoute(new Request("http://localhost/api/matches"), undefined as never)).json()) as { intros: Array<{ id: string; companyName: string }> };
    expect(mine.intros.find((i) => i.id === introId)?.companyName).toBe("Demo company 01");
    const page = (await buildCompanyPage(t.db, COMPANY_TOKEN))!;
    expect(page.digest!.groups[0]!.picks[0]!.revealed).toBeNull();
  });

  it("11. the person accepts with a name and contact; the company page then shows exactly the agreed fields", async () => {
    mocks.talentId = talentId;
    const res = await respondRoute(json(`/api/intros/${introId}/respond`, { decision: "accept", displayName: persona.name, contact: persona.email }), ctx(introId));
    expect(res.status).toBe(200);
    expect((await t.db.select().from(talentIdentity).where(eq(talentIdentity.talentId, talentId)))[0]).toMatchObject({ displayName: persona.name, contact: persona.email });

    const page = (await buildCompanyPage(t.db, COMPANY_TOKEN))!;
    const revealed = page.digest!.groups[0]!.picks[0]!.revealed;
    expect(revealed).not.toBeNull();
    expect(revealed!.name).toBe(persona.name);
    expect(revealed!.contact).toBe(persona.email);
    expect(Object.keys(revealed!).sort()).toEqual(["contact", "name", "signals"]);
    for (const s of revealed!.signals) expect(Object.keys(s).sort()).toEqual(["id", "phraseOwn", "phrase", "quotes"].sort());
    expect(revealed!.signals.some((s) => s.quotes.length > 0)).toBe(true);
    const after = JSON.stringify(page);
    expect(after).not.toMatch(/inputMode|interviewLang|"lang"/);
    expect(await actions("intro.accepted")).toBe(1);
    expect(await actions("identity.revealed")).toBe(1);
    // The person's quotes in the reveal are sentences of their own interview.
    for (const s of revealed!.signals) for (const q of s.quotes) expect(spoken).toContain(q);
    expect(signalLabels.length).toBeGreaterThan(0);
    expect(await t.db.select().from(digest).where(eq(digest.id, digestId))).toHaveLength(1);
    expect(await t.db.select().from(needCard).where(eq(needCard.id, needId))).toHaveLength(1);
  });
});
