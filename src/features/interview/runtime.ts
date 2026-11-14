/**
 * In-process coordination for interviews: the event bus, per-interview locks, barge-in
 * controllers, outstanding background work and the clock. Held on `globalThis` so the turn
 * route, the events route and tests share one instance even when a bundler loads this module
 * twice. Everything here is an optimisation or a safety net: the database is the truth.
 */

type Runtime = {
  listeners: Map<string, Set<() => void>>;
  /** Tail of each interview's lock chain. */
  locks: Map<string, Promise<void>>;
  /** The controller of the reply currently being streamed, for barge-in. */
  active: Map<string, AbortController>;
  /** Background work (extraction, finishing) per interview. */
  pending: Map<string, Map<Promise<void>, WorkKind>>;
  /** Client turn ids already accepted per interview, mapped to the participant turn index. */
  seenKeys: Map<string, Map<string, number | null>>;
  now: () => number;
};

const KEY = Symbol.for("workespoo.interview.runtime");
const holder = globalThis as unknown as Record<symbol, Runtime | undefined>;

export function runtime(): Runtime {
  let rt = holder[KEY];
  if (!rt) {
    rt = {
      listeners: new Map(),
      locks: new Map(),
      active: new Map(),
      pending: new Map(),
      seenKeys: new Map(),
      now: () => Date.now(),
    };
    holder[KEY] = rt;
  }
  return rt;
}

/** Replace the clock (tests). Pass null to restore the real one. */
export function setEngineClock(now: (() => number) | null): void {
  runtime().now = now ?? (() => Date.now());
}

export function nowMs(): number {
  return runtime().now();
}

/** Wait for every earlier holder of this interview's lock, then hold it until `release()` is called. */
export async function acquireLock(interviewId: string): Promise<() => void> {
  const rt = runtime();
  const previous = rt.locks.get(interviewId) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => (release = resolve));
  const tail = previous.then(() => mine);
  rt.locks.set(interviewId, tail);
  await previous;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    release();
    if (rt.locks.get(interviewId) === tail) rt.locks.delete(interviewId);
  };
}

/** Run `fn` while holding the interview's lock. */
export async function withLock<T>(interviewId: string, fn: () => Promise<T>): Promise<T> {
  const release = await acquireLock(interviewId);
  try {
    return await fn();
  } finally {
    release();
  }
}

/** `label` is the live skill-label call: `settleInterview` waits for it, finishing and removing an answer do not. */
export type WorkKind = "work" | "finish" | "label";

/** Track background work so `settleInterview` can wait for it. The promise never rejects. */
export function track(interviewId: string, work: Promise<unknown>, kind: WorkKind = "work"): void {
  const rt = runtime();
  const set = rt.pending.get(interviewId) ?? new Map<Promise<void>, WorkKind>();
  rt.pending.set(interviewId, set);
  const safe = work.then(
    () => undefined,
    () => undefined,
  );
  set.set(safe, kind);
  void safe.then(() => {
    set.delete(safe);
    if (set.size === 0 && rt.pending.get(interviewId) === set) rt.pending.delete(interviewId);
  });
}

function pendingWork(interviewId: string, kinds: readonly WorkKind[]): Promise<void>[] {
  const set = runtime().pending.get(interviewId);
  return set ? [...set].filter(([, kind]) => kinds.includes(kind)).map(([p]) => p) : [];
}

/** Wait for the interview's outstanding work of the given kinds, or until `timeoutMs` passes. */
export async function waitForPending(
  interviewId: string,
  timeoutMs: number,
  kinds: readonly WorkKind[] = ["work"],
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    for (;;) {
      const work = pendingWork(interviewId, kinds);
      if (work.length === 0) return;
      const outcome = await Promise.race([Promise.all(work).then(() => "done" as const), deadline]);
      if (outcome === "timeout") return;
    }
  } finally {
    clearTimeout(timer);
  }
}

export function subscribe(interviewId: string, onActivity: () => void): () => void {
  const rt = runtime();
  const set = rt.listeners.get(interviewId) ?? new Set();
  rt.listeners.set(interviewId, set);
  set.add(onActivity);
  return () => {
    set.delete(onActivity);
    if (set.size === 0 && rt.listeners.get(interviewId) === set) rt.listeners.delete(interviewId);
  };
}

export function notify(interviewId: string): void {
  for (const listener of [...(runtime().listeners.get(interviewId) ?? [])]) {
    try {
      listener();
    } catch {
      /* a broken listener must not affect the others */
    }
  }
}
