import { and, desc, eq, sql } from "drizzle-orm";
import {
  ApplicationPlan,
  ApplicationState,
  type ApplicationStatus,
  type ApplicationTurn,
  type ApplicationTurnKind,
  type InputMode,
  type TurnRole,
} from "@/contracts";
import type { Db } from "@/db/client";
import { application, applicationTurn } from "@/db/schema";
import { HttpError } from "@/lib/http";
import { newId } from "@/lib/ids";

/** Rows of the application tables, parsed. Private to this feature. */

export interface AppRow {
  id: string;
  talentId: string;
  jobId: string;
  companyId: string;
  status: ApplicationStatus;
  plan: ApplicationPlan;
  state: ApplicationState;
  assessment: unknown;
  createdAt: Date;
  submittedAt: Date | null;
}

type RawApp = typeof application.$inferSelect;

function toRow(r: RawApp): AppRow {
  return {
    id: r.id,
    talentId: r.talentId,
    jobId: r.jobId,
    companyId: r.companyId,
    status: r.status,
    plan: ApplicationPlan.parse(r.plan),
    state: ApplicationState.parse(r.state),
    assessment: r.assessment,
    createdAt: r.createdAt,
    submittedAt: r.submittedAt,
  };
}

export async function loadApp(db: Db, id: string): Promise<AppRow | null> {
  const [r] = await db.select().from(application).where(eq(application.id, id));
  return r ? toRow(r) : null;
}

export async function requireApp(db: Db, id: string): Promise<AppRow> {
  const row = await loadApp(db, id);
  if (!row) throw new HttpError(404, "not_found", "Application not found");
  return row;
}

export type TurnRow = ApplicationTurn & { clientTurnId: string | null };

export function toTurn(r: typeof applicationTurn.$inferSelect): TurnRow {
  return {
    id: r.id,
    applicationId: r.applicationId,
    index: r.index,
    role: r.role,
    kind: r.kind,
    requirementId: r.requirementId,
    text: r.text,
    sentences: r.sentences,
    inputMode: r.inputMode,
    removedAt: r.removedAt ? r.removedAt.toISOString() : null,
    at: r.at.toISOString(),
    clientTurnId: r.clientTurnId,
  };
}

/** Drops the browser's retry key: it is not part of the contract. */
export function publicTurn(t: TurnRow): ApplicationTurn {
  const { clientTurnId, ...rest } = t;
  void clientTurnId;
  return rest;
}

export async function loadTurns(db: Db, applicationId: string): Promise<TurnRow[]> {
  const rows = await db.select().from(applicationTurn).where(eq(applicationTurn.applicationId, applicationId)).orderBy(applicationTurn.index);
  return rows.map(toTurn);
}

export async function nextTurnIndex(db: Db, applicationId: string): Promise<number> {
  const [r] = await db
    .select({ max: sql<number | null>`max(${applicationTurn.index})` })
    .from(applicationTurn)
    .where(eq(applicationTurn.applicationId, applicationId));
  return (r?.max ?? -1) + 1;
}

export interface NewTurn {
  role: TurnRole;
  kind: ApplicationTurnKind;
  requirementId: string | null;
  text: string;
  sentences: string[];
  inputMode?: InputMode | null;
  clientTurnId?: string | null;
}

/** Inserts the next turn of an application (the caller holds the application's lock). */
export async function insertTurn(db: Db, applicationId: string, turn: NewTurn, at: Date): Promise<TurnRow> {
  const index = await nextTurnIndex(db, applicationId);
  const [row] = await db
    .insert(applicationTurn)
    .values({
      id: newId("apt"),
      applicationId,
      index,
      role: turn.role,
      kind: turn.kind,
      requirementId: turn.requirementId,
      text: turn.text,
      sentences: turn.sentences,
      inputMode: turn.inputMode ?? null,
      clientTurnId: turn.clientTurnId ?? null,
      at,
    })
    .returning();
  return toTurn(row!);
}

export async function saveState(db: Db, id: string, state: ApplicationState, status?: ApplicationStatus): Promise<void> {
  await db
    .update(application)
    .set({ state: ApplicationState.parse(state), ...(status ? { status } : {}) })
    .where(eq(application.id, id));
}

/** The latest turn of the person that is a real answer and has not been removed. */
export function lastAnswer(turns: readonly TurnRow[]): TurnRow | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!;
    if (t.role === "participant" && t.kind === "answer" && !t.removedAt) return t;
  }
  return null;
}

export function answersFor(turns: readonly TurnRow[], requirementId: string): TurnRow[] {
  return turns.filter((t) => t.role === "participant" && t.kind === "answer" && !t.removedAt && t.requirementId === requirementId);
}

export async function findByClientTurnId(db: Db, applicationId: string, clientTurnId: string): Promise<TurnRow | null> {
  const [r] = await db
    .select()
    .from(applicationTurn)
    .where(and(eq(applicationTurn.applicationId, applicationId), eq(applicationTurn.clientTurnId, clientTurnId)));
  return r ? toTurn(r) : null;
}

export async function newestTurn(db: Db, applicationId: string): Promise<TurnRow | null> {
  const [r] = await db
    .select()
    .from(applicationTurn)
    .where(eq(applicationTurn.applicationId, applicationId))
    .orderBy(desc(applicationTurn.index))
    .limit(1);
  return r ? toTurn(r) : null;
}

/** What a route checks before it opens a stream: the answer is welcome, or it is a retry of one already stored. Throws 409. */
export async function assertInterviewing(db: Db, applicationId: string, clientTurnId?: string): Promise<void> {
  if (clientTurnId && (await findByClientTurnId(db, applicationId, clientTurnId))) return;
  const row = await requireApp(db, applicationId);
  if (row.status !== "interviewing") {
    throw new HttpError(409, "not_interviewing", "This interview is not running");
  }
}

/* ------------------------------------- locks ------------------------------------- */

type Locks = Map<string, Promise<void>>;
const KEY = Symbol.for("workespoo.application.locks");
const holder = globalThis as unknown as Record<symbol, Locks | undefined>;
function locks(): Locks {
  return (holder[KEY] ??= new Map());
}

/** Waits for every earlier holder of this application's lock, then holds it until `release()`. */
export async function acquireLock(applicationId: string): Promise<() => void> {
  const map = locks();
  const previous = map.get(applicationId) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => (release = resolve));
  const tail = previous.then(() => mine);
  map.set(applicationId, tail);
  await previous;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    release();
    if (map.get(applicationId) === tail) map.delete(applicationId);
  };
}

export async function withLock<T>(applicationId: string, fn: () => Promise<T>): Promise<T> {
  const release = await acquireLock(applicationId);
  try {
    return await fn();
  } finally {
    release();
  }
}
