/**
 * Seeding the demo: the event, the masked demo companies with their Need Cards, the simulated
 * pool, eligibility, and the digest history the demo script needs
 * (docs/specs/synthetic-world.md sections 4 and 5, docs/specs/demo-script.md "before going on stage").
 *
 * Idempotent: every stage checks what exists. `resetDemo` removes the demo state first.
 * Nothing here calls a model; the features it calls may, but the harness never depends on a key
 * to produce the data (the interview is answered by the scripted candidate).
 */
import { and, eq, gte, inArray, like, lte, or } from "drizzle-orm";
import type { InterviewMode } from "@/contracts";
import type { Db } from "@/db/client";
import { appMeta, company, consent, digest, eligibility, llmCall, matchEvent, eventCompany, needCard, pick, talent } from "@/db/schema";
import { QUESTIONS_KEY_PREFIX } from "@/features/application";
import { audit } from "@/lib/audit";
import { newId, newToken } from "@/lib/ids";
import { runSimulatedApplications, type ApplicationsReport } from "./applications";
import { loadDemoCandidates, selectDemoPostings, type DemoPick } from "./demo-postings";
import { realSeedDeps, type SeedDeps } from "./deps";
import type { Persona } from "./persona";
import { seededHash } from "./prng";
import { runSimulatedInterview, type SimulatedRun } from "./run";
import { buildUsageReport, type UsageReport } from "./usage";

export const DEMO_EVENT_ID = "ev_demo2026";
export const DEMO_EVENT_DATE = "2026-11-26";
/** 13:00 to 16:00 Europe/Helsinki on 26 November 2026 (UTC+2). */
export const DEMO_EVENT_STARTS = new Date("2026-11-26T11:00:00Z");
export const DEMO_EVENT_ENDS = new Date("2026-11-26T14:00:00Z");
export const DEMO_COMPANIES_KEY = "seed:demo-companies";
/**
 * The picks setting "nobody is suggested to more than N companies a day", for the demo event
 * (read by the picks feature from `settings:<eventId>:<key>`; default 3). The demo turns on one
 * company's list being drafted live, last, with a newcomer on it. With the default, a newcomer
 * who relates to four of the eight demo companies was left off exactly that list. In the demo
 * event the cap is the number of companies, so nobody is left off a list by it.
 */
export const DEMO_MAX_PICKS_PER_DAY = 8;
export const demoSettingKey = (key: string) => `settings:${DEMO_EVENT_ID}:${key}`;
const pad = (n: number) => String(n).padStart(2, "0");
export const demoCompanyId = (number: number) => `co_demo${pad(number)}`;
export const demoCompanyName = (number: number) => `Demo company ${pad(number)}`;

/** The calendar day of `date` in Helsinki, as `YYYY-MM-DD`. */
export function helsinkiDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Helsinki", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export type SeedOptions = {
  /** The features the seed calls. Defaults to the real ones; `--fake` passes the stand-in. */
  deps?: SeedDeps;
  personas: Persona[];
  /** Number of masked demo companies: 8 (default) or 12. */
  companies?: number;
  /** The posting behind the pitch company, when the lead has chosen one (`--pitch-job`). */
  pitchJobId?: string;
  /** Interview mode for every persona; default is each persona's own. */
  mode?: InterviewMode;
  /** `false` skips the simulated applications (`--no-applications`). Default: they run when the deps hold the application feature. */
  applications?: boolean;
  /** Remove existing demo state first. */
  reset?: boolean;
  /** The generated rows were just restored from the snapshot: do not run the queue or eligibility again. */
  restored?: boolean;
  now?: () => Date;
  appUrl?: string;
  log?: (line: string) => void;
};

export type SeedSummary = {
  event: { id: string; date: string };
  companies: Array<{ number: number; companyId: string; displayName: string; jobId: string; title: string; link: string; needCardId: string | null; eligiblePeople: number; tags: string[] }>;
  personas: { created: number; kept: number };
  eligibilityRows: number;
  yesterday: { date: string; digests: number; picks: number };
  today: { date: string; digests: number; picks: number; pitchLeftUndrafted: boolean };
  queueJobsRun: number;
  /** The simulated applications: how many were planned, assessed, and which failed (left out, not stored). Null when this run made none. */
  applications: ApplicationsReport | null;
  /** Model calls, failures and waiting per interview and in total, read from `llm_call`. */
  usage: UsageReport;
  warnings: string[];
};

/** How many of one interview's model calls may fail before the seed rejects the interview. */
export const MAX_FAILED_INTERVIEW_CALLS = 2;

/**
 * The interview never stalls: when the model does not answer, the engine asks a scripted
 * question and goes on. That is right for a person and wrong for the demo world, which should
 * show what the interviewer really asks. This counts the interview's failed model calls in the
 * run's time span (`llm_call` has no interview id; the seed runs one interview at a time).
 */
async function failedInterviewCalls(db: Db, run: SimulatedRun): Promise<number> {
  if (!run.timing) return 0;
  const rows = await db
    .select({ id: llmCall.id })
    .from(llmCall)
    // The interviewer's reply and the note-taking only: the skill-label call after them is extra and may fail quietly.
    .where(and(gte(llmCall.at, run.timing.startedAt), lte(llmCall.at, run.timing.endedAt), inArray(llmCall.purpose, ["interview.live", "interview.extract"]), eq(llmCall.ok, false)));
  return rows.length;
}

type StoredCompany = { number: number; companyId: string; jobId: string; title: string; tags: string[] };

/**
 * Remove everything the seed creates, and the live-demo people of rehearsals, so that the next
 * person to approve a card on stage is the only never-drafted eligible person. People and their
 * interviews, cards and picks go with them. Real people (neither synthetic nor live demo) stay.
 */
export async function resetDemo(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    const doomed = await tx
      .select({ id: talent.id, synthetic: talent.synthetic })
      .from(talent)
      .where(or(eq(talent.synthetic, true), eq(talent.liveDemo, true)));
    const ids = doomed.map((d) => d.id);
    if (ids.length > 0) {
      // consent has no foreign key to talent, so the cascade does not reach it.
      await tx.delete(consent).where(and(eq(consent.subjectType, "talent"), inArray(consent.subjectId, ids)));
      await tx.delete(talent).where(inArray(talent.id, ids));
    }
    const real = doomed.filter((d) => !d.synthetic).length;
    if (real > 0) {
      await audit(tx, {
        actor: "system",
        action: "talent.purged",
        subjectType: "system",
        subjectId: "live_sessions",
        detail: { count: real, reason: "demo reset" },
      });
    }
    // The worded questions of the demo companies' jobs go with them (a restore brings the snapshot's back).
    const needs = await tx.select({ id: needCard.id }).from(needCard).where(like(needCard.companyId, "co_demo%"));
    if (needs.length > 0) await tx.delete(appMeta).where(or(...needs.map((n) => like(appMeta.key, `${QUESTIONS_KEY_PREFIX}${n.id}:%`))));
    await tx.delete(company).where(like(company.id, "co_demo%"));
    await tx.delete(matchEvent).where(eq(matchEvent.id, DEMO_EVENT_ID));
    await tx.delete(appMeta).where(or(eq(appMeta.key, DEMO_COMPANIES_KEY), like(appMeta.key, `settings:${DEMO_EVENT_ID}:%`)));
  });
}

export async function seedDemo(db: Db, options: SeedOptions): Promise<SeedSummary> {
  const { personas } = options;
  const deps = options.deps ?? realSeedDeps();
  const log = options.log ?? (() => {});
  const now = options.now ?? (() => new Date());
  const count = options.companies ?? 8;
  const warnings: string[] = [];
  const startedAt = new Date();
  const interviewRuns: SimulatedRun[] = [];

  if (options.reset) {
    log("reset: removing the existing demo state");
    await resetDemo(db);
  }

  // 1. The event.
  await db
    .insert(matchEvent)
    .values({
      id: DEMO_EVENT_ID,
      name: "Espoo TalentMatch demo day (prototype)",
      date: DEMO_EVENT_DATE,
      format: "hybrid",
      place: "Demo venue, Espoo",
      startsAt: DEMO_EVENT_STARTS,
      endsAt: DEMO_EVENT_ENDS,
      slotMinutes: 15,
      bufferMinutes: 5,
      maxMeetingsPerTalent: 4,
    })
    .onConflictDoUpdate({
      target: matchEvent.id,
      set: { name: "Espoo TalentMatch demo day (prototype)", date: DEMO_EVENT_DATE, startsAt: DEMO_EVENT_STARTS, endsAt: DEMO_EVENT_ENDS, slotMinutes: 15, bufferMinutes: 5, maxMeetingsPerTalent: 4 },
    });

  // The demo event's own picks setting (see DEMO_MAX_PICKS_PER_DAY).
  await db
    .insert(appMeta)
    .values({ key: demoSettingKey("maxPicksPerDay"), value: DEMO_MAX_PICKS_PER_DAY })
    .onConflictDoUpdate({ target: appMeta.key, set: { value: DEMO_MAX_PICKS_PER_DAY } });

  // 2. The masked companies: choose once, then keep.
  const [stored] = await db.select().from(appMeta).where(eq(appMeta.key, DEMO_COMPANIES_KEY));
  let chosen = (stored?.value as StoredCompany[] | undefined) ?? null;
  if (!chosen) {
    const candidates = await loadDemoCandidates(db, DEMO_EVENT_STARTS);
    if (candidates.length === 0) throw new Error("No postings to build demo companies from. Ingest Espoo postings first: npm run ingest -- all");
    const selection = selectDemoPostings(candidates, { count, pitchJobId: options.pitchJobId });
    warnings.push(...selection.unmet.map((u) => `demo postings: ${u}`));
    chosen = await createCompanies(db, selection.picks);
    await db.insert(appMeta).values({ key: DEMO_COMPANIES_KEY, value: chosen }).onConflictDoUpdate({ target: appMeta.key, set: { value: chosen } });
  }
  const pitch = chosen.find((c) => c.number === 3) ?? null;
  if (!pitch) warnings.push("there is no company 03: the demo script's pitch company does not exist");

  // 3. Need Cards, through the real drafting.
  const needCardIds = new Map<string, string>();
  for (const c of chosen) {
    const [existing] = await db.select().from(needCard).where(and(eq(needCard.jobId, c.jobId), eq(needCard.companyId, c.companyId)));
    if (existing) {
      needCardIds.set(c.companyId, existing.id);
      continue;
    }
    log(`drafting the Need Card for ${demoCompanyName(c.number)}`);
    // A draft can fail on one odd model answer. Try twice, then go on without this company's
    // card and say so: the rest of the demo world is worth more than stopping here.
    let card: Awaited<ReturnType<NonNullable<typeof deps>["draftNeedCard"]>> | null = null;
    let lastError = "";
    for (let attempt = 1; attempt <= 2 && !card; attempt++) {
      try {
        card = await deps.draftNeedCard(db, c.jobId, c.companyId);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        log(`  draft ${attempt} of 2 failed for ${demoCompanyName(c.number)}: ${lastError.slice(0, 160)}`);
      }
    }
    if (card) needCardIds.set(c.companyId, card.id);
    else warnings.push(`${demoCompanyName(c.number)} has no Need Card: ${lastError.slice(0, 160)}`);
  }

  // 4. The pool: one simulated interview per persona that is not already in the pool.
  const taken = await db.select().from(talent).where(eq(talent.synthetic, true));
  let created = 0;
  let kept = 0;
  for (const persona of personas) {
    const done = taken.find((t) => t.personaKey === persona.id && t.inPool);
    if (done) {
      kept++;
      continue;
    }
    for (const stale of taken.filter((t) => t.personaKey === persona.id)) await db.delete(talent).where(eq(talent.id, stale.id));
    // An interview can fail when the model stops answering half-way: a network cut leaves a card
    // with no notes, which cannot be approved, or an interview made of scripted questions, which
    // the demo world should not hold. Try twice, then go on without this person and say so.
    // The seed is idempotent, so a second run fills the gap.
    let run: SimulatedRun | null = null;
    let lastError = "";
    for (let attempt = 1; attempt <= 2 && !run; attempt++) {
      try {
        const attemptRun = await runSimulatedInterview(db, persona, options.mode ?? persona.interviewMode, { deps, log });
        const failed = await failedInterviewCalls(db, attemptRun);
        if (failed > MAX_FAILED_INTERVIEW_CALLS) {
          throw new Error(`the model did not answer ${failed} of this interview's calls, so the interviewer asked scripted questions`);
        }
        run = attemptRun;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        log(`  interview ${attempt} of 2 failed for ${persona.id}: ${lastError.slice(0, 160)}`);
        // The simulator labels its person at once, so what the failed attempt left is found by the persona key.
        await db.delete(talent).where(and(eq(talent.synthetic, true), eq(talent.personaKey, persona.id)));
      }
    }
    if (run) {
      interviewRuns.push(run);
      created++;
    } else {
      warnings.push(`${persona.id} is not in the pool: ${lastError.slice(0, 160)}. Run the seed again to add them`);
    }
  }

  // 5. Background work the approvals queued, then eligibility for every demo need.
  const queueJobsRun = options.restored ? 0 : await deps.runQueue(db);
  let eligibilityRows = 0;
  for (const c of chosen) {
    const id = needCardIds.get(c.companyId);
    if (!id) continue;
    if (options.restored) eligibilityRows += (await db.select().from(eligibility).where(eq(eligibility.needCardId, id))).length;
    else eligibilityRows += (await deps.computeEligibility(db, { needCardId: id })).rows;
  }

  // The coverage check (synthetic-world.md 2.4): reported, never fatal.
  const eligibleByNeed = new Map<string, Set<string>>();
  for (const row of await db.select().from(eligibility).where(eq(eligibility.eligible, true))) {
    const set = eligibleByNeed.get(row.needCardId) ?? new Set<string>();
    set.add(row.talentId);
    eligibleByNeed.set(row.needCardId, set);
  }
  const people = await db.select().from(talent).where(and(eq(talent.synthetic, true), eq(talent.inPool, true)));
  for (const c of chosen) {
    // A posting that lists duties and no requirements gives a card nobody can relate to.
    const needId = needCardIds.get(c.companyId);
    const [need] = needId ? await db.select().from(needCard).where(eq(needCard.id, needId)) : [];
    if (need && need.body.requirements.length === 0) {
      warnings.push(`coverage: ${demoCompanyName(c.number)} has a Need Card with no requirements (the posting lists none): choose another posting for it`);
    }
    const n = eligibleByNeed.get(needCardIds.get(c.companyId) ?? "")?.size ?? 0;
    if (n < 3) warnings.push(`coverage: ${demoCompanyName(c.number)} has ${n} eligible pool people, at least 3 are needed`);
  }
  const everEligible = new Set([...eligibleByNeed.values()].flatMap((s) => [...s]));
  const unmatched = people.filter((p) => !everEligible.has(p.id)).length;
  if (unmatched < 2) warnings.push(`coverage: ${unmatched} pool people have no eligible need, at least 2 are wanted for the unmatched queue`);

  // 5b. Applications of the simulated people, through the real application feature. Not when
  //     restoring: the snapshot holds them.
  let applications: ApplicationsReport | null = null;
  if (!options.restored && options.applications !== false && deps.applications) {
    applications = await runSimulatedApplications(
      db,
      personas,
      chosen.map((c) => ({ number: c.number, companyId: c.companyId, jobId: c.jobId, needCardId: needCardIds.get(c.companyId) ?? null })),
      { deps: deps.applications, log },
    );
    for (const f of applications.failed) warnings.push(`application of ${f.personaId} to company ${f.companyNumber} is not stored: ${f.reason}. Run the seed again to add it`);
  }

  // 6. Yesterday: a published digest for every company, so that every eligible synthetic person
  //    counts as already suggested and a newly approved card is picked first.
  const today = helsinkiDay(now());
  const yesterday = helsinkiDay(new Date(now().getTime() - 24 * 3600 * 1000));
  const yesterdayAt = new Date(`${yesterday}T10:00:00Z`);
  let yDigests = 0;
  let yPicks = 0;
  for (const c of chosen) {
    const needId = needCardIds.get(c.companyId);
    if (!needId) continue;
    const [exists] = await db.select().from(digest).where(and(eq(digest.companyId, c.companyId), eq(digest.date, yesterday)));
    if (exists) continue;
    const [need] = await db.select().from(needCard).where(eq(needCard.id, needId));
    const digestId = newId("dig");
    const seed = seededHash("digest", `${DEMO_EVENT_ID}:${yesterday}:${c.companyId}`);
    await db.insert(digest).values({ id: digestId, companyId: c.companyId, eventId: DEMO_EVENT_ID, date: yesterday, status: "published", seed, publishedBy: "system", publishedAt: yesterdayAt, createdAt: yesterdayAt });
    yDigests++;
    const rows = await db.select().from(eligibility).where(and(eq(eligibility.needCardId, needId), eq(eligibility.eligible, true)));
    for (const row of rows.filter((r) => people.some((p) => p.id === r.talentId)).sort((a, b) => a.talentId.localeCompare(b.talentId))) {
      const pickId = newId("pick");
      await db.insert(pick).values({
        id: pickId,
        digestId,
        companyId: c.companyId,
        needCardId: needId,
        needCardVersion: need.version,
        talentId: row.talentId,
        cardVersion: row.cardVersion,
        origin: "agent",
        body: { reasons: [], notMentioned: [] },
        status: "approved",
        selection: { seed, lastDraftedBefore: null, pass: 1 },
        decidedBy: "system",
        decidedAt: yesterdayAt,
        createdAt: yesterdayAt,
      });
      yPicks++;
      // Seeded history is the system's, and says so: it is never recorded as an organiser's decision.
      await audit(db, { actor: "system", action: "pick.approved", subjectType: "pick", subjectId: pickId, detail: { pickId, digestId, needCardId: needId, seeded: true } });
    }
    await audit(db, { actor: "system", action: "digest.published", subjectType: "digest", subjectId: digestId, detail: { companyId: c.companyId, date: yesterday, seeded: true } });
  }

  // 7. Today: drafted digests for every company except the pitch company.
  let tDigests = 0;
  let tPicks = 0;
  if (pitch) await db.update(company).set({ participating: false }).where(eq(company.id, pitch.companyId));
  try {
    // Code-written reasons: the seeded lists must not need a model, so a demo reset is quick and
    // works when the provider is down. The pitch company's list is drafted live, with the model.
    const drafted = await deps.draftDailyDigests(db, today, now(), { wording: "code" });
    tDigests = drafted.digests;
    tPicks = drafted.picks;
  } finally {
    if (pitch) await db.update(company).set({ participating: true }).where(eq(company.id, pitch.companyId));
  }
  let pitchLeftUndrafted = true;
  if (pitch) {
    const [d] = await db.select().from(digest).where(and(eq(digest.companyId, pitch.companyId), eq(digest.date, today)));
    pitchLeftUndrafted = !d;
    if (d) warnings.push(`${demoCompanyName(3)} already has a digest for ${today}: run with --reset so the live "Run today's picks now" has something to draft`);
  }

  const appUrl = (options.appUrl ?? "http://localhost:3000").replace(/\/$/, "");
  const companies = [];
  for (const c of [...chosen].sort((a, b) => a.number - b.number)) {
    const [row] = await db.select().from(company).where(eq(company.id, c.companyId));
    const needId = needCardIds.get(c.companyId) ?? null;
    companies.push({
      number: c.number,
      companyId: c.companyId,
      displayName: row.displayName,
      jobId: c.jobId,
      title: c.title,
      link: `${appUrl}/c/${row.digestToken}`,
      needCardId: needId,
      eligiblePeople: needId ? (eligibleByNeed.get(needId)?.size ?? 0) : 0,
      tags: c.tags,
    });
  }
  return {
    event: { id: DEMO_EVENT_ID, date: DEMO_EVENT_DATE },
    companies,
    personas: { created, kept },
    eligibilityRows,
    yesterday: { date: yesterday, digests: yDigests, picks: yPicks },
    today: { date: today, digests: tDigests, picks: tPicks, pitchLeftUndrafted },
    queueJobsRun,
    applications,
    usage: await buildUsageReport(
      db,
      interviewRuns.flatMap((r) => (r.timing ? [{ label: `${r.persona.id} (${r.mode})`, ...r.timing }] : [])),
      { startedAt, endedAt: new Date() },
    ),
    warnings,
  };
}

async function createCompanies(db: Db, picks: DemoPick[]): Promise<StoredCompany[]> {
  const out: StoredCompany[] = [];
  for (const p of picks) {
    const id = demoCompanyId(p.number);
    await db
      .insert(company)
      .values({
        id,
        displayName: demoCompanyName(p.number),
        realName: p.candidate.employerName,
        businessId: p.candidate.employerBusinessId,
        source: "posting",
        masked: true,
        participating: true,
        digestToken: newToken(),
      })
      .onConflictDoNothing();
    await db
      .insert(eventCompany)
      .values({ eventId: DEMO_EVENT_ID, companyId: id, number: p.number, format: p.number <= 5 ? "in_person" : "online", agendaToken: newToken() })
      .onConflictDoNothing();
    out.push({ number: p.number, companyId: id, jobId: p.candidate.jobId, title: p.candidate.title, tags: p.tags });
  }
  return out;
}
