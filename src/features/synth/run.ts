/**
 * One simulated interview, run through the same public functions a real one goes through.
 * The only direct writes are the synthetic flag, the persona key and the synthetic identity.
 */
import { and, eq } from "drizzle-orm";
import type { CardForCompany, CardForPerson, CoverageArea, InterviewMode, TurnKind } from "@/contracts";
import type { Db } from "@/db/client";
import { interview, talent, talentIdentity, turn } from "@/db/schema";
import { ScriptedCandidate } from "./candidate";
import { realSimDeps, type SimDeps } from "./deps";
import type { Persona } from "./persona";

/** A turn as stored, reduced to what the evaluation reads. */
export type RunTurn = {
  index: number;
  role: "interviewer" | "participant";
  kind: TurnKind;
  target: CoverageArea | null;
  text: string;
  sentences: string[];
  lang: string | null;
  redacted: boolean;
};

export type SimulatedRun = {
  persona: Persona;
  mode: InterviewMode;
  interviewId: string;
  talentId: string;
  handle: string;
  /** Shown as the first line of a synthetic interview's transcript (synthetic-world.md 7.5). */
  systemLine: string;
  turns: RunTurn[];
  /** The approved card as the person sees it, and as a company sees it. */
  person: CardForPerson;
  company: CardForCompany | null;
  /** Wall-clock span of this run, to attribute model calls to it (`usage.ts`). */
  timing?: { startedAt: Date; endedAt: Date };
};

export const SIMULATED_TRANSCRIPT_LINE = "Simulated interview for the WorkEspoo demo";

/**
 * Start the interview the way the public start page does, as a live demo session: the engine then
 * gives the person a `purgeAfter` (LEAD-DECISIONS, 14 Nov). Until `labelSynthetic` runs, a person
 * the simulator created is therefore an ordinary session that the purge job removes after 24
 * hours, never a person nobody will clean up.
 */
export async function beginSimulated(db: Db, persona: Persona, mode: InterviewMode, deps: SimDeps = realSimDeps()) {
  return deps.startInterview(db, {
    mode,
    uiLang: persona.interviewLang,
    consent: { interview: true, voiceVendor: false, liveDemo: true },
  });
}

/**
 * Mark a simulated person as synthetic. One update sets the flag and the persona key and clears
 * `purgeAfter` and `liveDemo`, so the person is never due for purging and never a "live demo".
 */
export async function labelSynthetic(db: Db, talentId: string, persona: Persona): Promise<void> {
  await db.update(talent).set({ synthetic: true, personaKey: persona.id, purgeAfter: null, liveDemo: false }).where(eq(talent.id, talentId));
}

/** How a person writes a language's name in the language they are using on the page. */
const LANGUAGE_NAMES: Record<string, Record<string, string>> = {
  en: { en: "English", fi: "Finnish", sv: "Swedish" },
  fi: { en: "englanti", fi: "suomi", sv: "ruotsi" },
  sv: { en: "engelska", fi: "finska", sv: "svenska" },
};

/** A persona's work-language code as the person would type it; an unknown one stays a code. */
export function typedLanguage(code: string, pageLang: string): string {
  return LANGUAGE_NAMES[pageLang]?.[code] ?? code;
}

/** Safety stop: the longest interview plans 7 questions plus repairs and probes. */
const MAX_ANSWERS = 16;

export async function readTurns(db: Db, interviewId: string): Promise<RunTurn[]> {
  const rows = await db.select().from(turn).where(eq(turn.interviewId, interviewId));
  return rows
    .sort((a, b) => a.index - b.index)
    .map((r) => ({
      index: r.index,
      role: r.role,
      kind: r.kind,
      target: r.target ?? null,
      text: r.text,
      sentences: r.sentences,
      lang: r.lang ?? null,
      redacted: r.redactedAt !== null,
    }));
}

/**
 * The transcript as a view receives it: the turns, and for a synthetic person the line that says
 * the interview was simulated (synthetic-world.md 7.5). A real person's transcript has no such line.
 */
export async function readTranscript(db: Db, interviewId: string): Promise<{ systemLine: string | null; turns: RunTurn[] }> {
  const [row] = await db
    .select({ synthetic: talent.synthetic })
    .from(interview)
    .innerJoin(talent, eq(talent.id, interview.talentId))
    .where(eq(interview.id, interviewId));
  return { systemLine: row?.synthetic ? SIMULATED_TRANSCRIPT_LINE : null, turns: await readTurns(db, interviewId) };
}

async function readTurn(db: Db, interviewId: string, index: number) {
  const [row] = await db.select().from(turn).where(and(eq(turn.interviewId, interviewId), eq(turn.index, index)));
  if (!row) throw new Error(`interview ${interviewId} has no turn ${index} after the interviewer replied`);
  return row;
}

export type RunOptions = {
  deps?: SimDeps;
  /** Seconds to wait for extraction and synthesis to settle. */
  settleTimeoutMs?: number;
  log?: (line: string) => void;
};

/**
 * Start an interview, answer it from the persona's script until the interviewer closes it,
 * settle, label the person synthetic, store the synthetic identity, declare how the person wants
 * to work (mode, start, work languages), approve the card and opt in to the pool. `mode`
 * defaults to the persona's own.
 */
export async function runSimulatedInterview(
  db: Db,
  persona: Persona,
  mode: InterviewMode = persona.interviewMode,
  options: RunOptions = {},
): Promise<SimulatedRun> {
  const deps = options.deps ?? realSimDeps();
  const startedAt = new Date();
  const log = options.log ?? (() => {});

  const started = await beginSimulated(db, persona, mode, deps);
  const { interviewId, talentId } = started;
  // Label at once, so a crash half-way never leaves an unlabelled person behind (and one that
  // slips through is still due for purging: see `beginSimulated`).
  await labelSynthetic(db, talentId, persona);
  await setHandle(db, talentId, persona.handle);

  const candidate = new ScriptedCandidate(persona);
  let last: { kind: TurnKind; target: CoverageArea | null } = { kind: started.opening.kind, target: started.opening.target };
  for (let answers = 0; ; answers++) {
    const text = candidate.reply(last);
    if (text === null) break;
    if (answers >= MAX_ANSWERS) throw new Error(`${persona.id}: the interview did not close after ${MAX_ANSWERS} answers`);
    let replyIndex: number | null = null;
    for await (const event of deps.submitTurn(db, interviewId, { text, inputMode: persona.inputMode })) {
      if (event.type === "turn.done") replyIndex = event.turnIndex;
      if (event.type === "error") throw new Error(`${persona.id}: the interview engine reported an error: ${event.message}`);
    }
    if (replyIndex === null) throw new Error(`${persona.id}: the interviewer never replied to answer ${answers + 1}`);
    const reply = await readTurn(db, interviewId, replyIndex);
    last = { kind: reply.kind, target: reply.target ?? null };
  }

  // With the real model the card takes 20 to 40 s after the last answer, more with a repair.
  await deps.settleInterview(db, interviewId, options.settleTimeoutMs ?? 150_000);

  await db
    .insert(talentIdentity)
    .values({ talentId, displayName: persona.name, contact: persona.email })
    .onConflictDoUpdate({ target: talentIdentity.talentId, set: { displayName: persona.name, contact: persona.email } });

  const draft = await deps.cardForPerson(db, talentId);
  if (!draft) throw new Error(`${persona.id}: no card exists after the interview settled`);
  // What a person does on the card page before approving: say where, when and in which languages
  // they want to work. The interview never infers a language; it is declared here, by the same
  // edit the page makes. The roles the notes already hold stay; missing ones the person types in.
  await deps.editCard(db, talentId, {
    op: "lookingFor",
    lookingFor: {
      roles: draft.lookingFor.roles.length > 0 ? draft.lookingFor.roles : persona.lookingFor.roles,
      workMode: persona.lookingFor.workMode,
      startFrom: persona.lookingFor.startFrom,
      workLanguages: persona.lookingFor.workLanguages.map((code) => typedLanguage(code, persona.interviewLang)),
    },
  });
  await deps.approveCard(db, talentId);
  await deps.setPoolOptIn(db, talentId, true);

  const person = await deps.cardForPerson(db, talentId);
  if (!person) throw new Error(`${persona.id}: the approved card cannot be read`);
  const company = await deps.cardForCompany(db, talentId);
  const { systemLine, turns } = await readTranscript(db, interviewId);
  log(`${persona.id} ${mode}: ${turns.filter((t) => t.role === "participant").length} answers, ${person.signals.length} signals`);

  return {
    persona,
    mode,
    interviewId,
    talentId,
    handle: person.handle,
    systemLine: systemLine ?? SIMULATED_TRANSCRIPT_LINE,
    turns,
    person,
    company,
    timing: { startedAt, endedAt: new Date() },
  };
}

/** Give the person the persona's fixed handle when it is free; otherwise keep the generated one. */
async function setHandle(db: Db, talentId: string, handle: string): Promise<void> {
  try {
    await db.update(talent).set({ handle }).where(eq(talent.id, talentId));
  } catch {
    // Handle already taken: keep the generated one.
  }
}
