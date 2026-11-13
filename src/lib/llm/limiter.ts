import type { LlmRole } from "@/contracts/trust";
import { liveReserveRpm, liveReserveSlots, maxConcurrency, providerRpmBudget } from "./config";

function realTimer(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Timing seam so tests do not wait on real time. `sleep` is retry backoff; `timer` drives the
 * gate and the call deadline; `now` is the clock for both. Tests replace all three together.
 */
export const timing = {
  now: () => Date.now(),
  sleep: realTimer,
  timer: realTimer,
};
const realTiming = { ...timing };

export function resetTiming(): void {
  Object.assign(timing, realTiming);
}

const RANK: Record<LlmRole, number> = { live: 0, analyst: 1, bulk: 2 };
const WINDOW_MS = 60_000;
export const MAX_PAUSE_MS = 60_000;
export const DEFAULT_PAUSE_MS = 10_000;
export const LIVE_MAX_PAUSE_MS = 1_000;

/** Why `acquire` gave up. */
export class GateError extends Error {
  constructor(readonly kind: "aborted" | "deadline") {
    super(kind === "aborted" ? "aborted" : "deadline passed while waiting for a rate-limit slot");
    this.name = "GateError";
  }
}

export type Admission = { release: () => void; waitedMs: number };

type Waiter = {
  role: LlmRole;
  since: number;
  admit: (a: Admission) => void;
  fail: (e: GateError) => void;
  cleanup: () => void;
};

/**
 * The one gate in front of a provider: concurrency, requests per minute and 429 pauses, with
 * `live` served before `analyst` before `bulk`. A lower role is never let through while a higher
 * one waits, and `analyst` and `bulk` never use the slots and minute budget reserved for `live`.
 */
export class Gate {
  private inflight = 0;
  private stamps: number[] = [];
  private waiters: Waiter[] = [];
  private liveUntil = 0;
  private backgroundUntil = 0;
  private wake: { at: number; ac: AbortController } | null = null;

  constructor(private readonly provider: string) {}

  /** Number of calls waiting (tests). */
  get waiting(): number {
    return this.waiters.length;
  }
  get active(): number {
    return this.inflight;
  }

  acquire(a: { role: LlmRole; signal?: AbortSignal; deadlineAt?: number }): Promise<Admission> {
    if (a.signal?.aborted) return Promise.reject(new GateError("aborted"));
    const since = timing.now();
    if (a.deadlineAt !== undefined && since >= a.deadlineAt) return Promise.reject(new GateError("deadline"));
    return new Promise<Admission>((resolve, reject) => {
      const deadlineAc = new AbortController();
      const waiter: Waiter = {
        role: a.role,
        since,
        admit: resolve,
        fail: reject,
        cleanup: () => {
          deadlineAc.abort();
          a.signal?.removeEventListener("abort", onAbort);
        },
      };
      const leave = (e: GateError) => {
        const i = this.waiters.indexOf(waiter);
        if (i < 0) return;
        this.waiters.splice(i, 1);
        waiter.cleanup();
        reject(e);
        this.pump(); // a removed higher-priority waiter may have been blocking the ones behind it
      };
      const onAbort = () => leave(new GateError("aborted"));
      a.signal?.addEventListener("abort", onAbort, { once: true });
      if (a.deadlineAt !== undefined) {
        timing
          .timer(Math.max(0, a.deadlineAt - since), deadlineAc.signal)
          .then(() => leave(new GateError("deadline")), () => {});
      }
      // first come first served within a role, roles in priority order
      let i = this.waiters.length;
      while (i > 0 && RANK[this.waiters[i - 1].role] > RANK[a.role]) i--;
      this.waiters.splice(i, 0, waiter);
      this.pump();
    });
  }

  /**
   * HTTP 429 from the provider: hold back `analyst` and `bulk` until `retryAfterMs` (10 s when
   * unknown, at most 60 s) and `live` for at most one second.
   */
  pause(retryAfterMs?: number): void {
    const now = timing.now();
    const background = Math.min(Math.max(0, retryAfterMs ?? DEFAULT_PAUSE_MS), MAX_PAUSE_MS);
    this.backgroundUntil = Math.max(this.backgroundUntil, now + background);
    this.liveUntil = Math.max(this.liveUntil, now + Math.min(background, LIVE_MAX_PAUSE_MS));
    this.pump();
  }

  private limits(role: LlmRole): { slots: number; rpm: number | null } {
    const live = role === "live";
    const max = maxConcurrency();
    const budget = providerRpmBudget(this.provider);
    return {
      slots: live ? max : Math.max(1, max - liveReserveSlots()),
      rpm: budget === null ? null : live ? budget : Math.max(1, budget - liveReserveRpm()),
    };
  }

  private canAdmit(role: LlmRole, now: number): boolean {
    if (now < (role === "live" ? this.liveUntil : this.backgroundUntil)) return false;
    const { slots, rpm } = this.limits(role);
    if (this.inflight >= slots) return false;
    return rpm === null || this.stamps.length < rpm;
  }

  private release(): void {
    this.inflight--;
    this.pump();
  }

  private pump(): void {
    const now = timing.now();
    this.stamps = this.stamps.filter((s) => now - s < WINDOW_MS);
    while (this.waiters.length > 0) {
      const w = this.waiters[0];
      if (!this.canAdmit(w.role, now)) break;
      this.waiters.shift();
      w.cleanup();
      this.inflight++;
      if (this.limits(w.role).rpm !== null) this.stamps.push(now);
      let done = false;
      w.admit({
        waitedMs: Math.max(0, now - w.since),
        release: () => {
          if (done) return;
          done = true;
          this.release();
        },
      });
    }
    this.arm(now);
  }

  /** Wake the gate when time alone (the minute window or a pause) can let the first waiter in. */
  private arm(now: number): void {
    const w = this.waiters[0];
    let at = Infinity;
    if (w) {
      const until = w.role === "live" ? this.liveUntil : this.backgroundUntil;
      if (now < until) at = until;
      const { rpm } = this.limits(w.role);
      if (rpm !== null && this.stamps.length >= rpm) {
        // the oldest stamp that must age out for the count to drop below the budget
        const s = this.stamps[this.stamps.length - rpm];
        at = Math.max(at === Infinity ? 0 : at, s + WINDOW_MS);
      }
    }
    if (at === Infinity) {
      this.disarm();
      return;
    }
    if (this.wake && this.wake.at === at) return;
    this.disarm();
    const ac = new AbortController();
    this.wake = { at, ac };
    timing.timer(Math.max(1, at - now), ac.signal).then(
      () => {
        if (this.wake?.ac === ac) this.wake = null;
        this.pump();
      },
      () => {},
    );
  }

  private disarm(): void {
    this.wake?.ac.abort();
    this.wake = null;
  }

  /** Forget all state (tests). Pending waiters are failed as aborted. */
  reset(): void {
    this.disarm();
    for (const w of this.waiters.splice(0)) {
      w.cleanup();
      w.fail(new GateError("aborted"));
    }
    this.inflight = 0;
    this.stamps = [];
    this.liveUntil = 0;
    this.backgroundUntil = 0;
  }
}

const gates = new Map<string, Gate>();

export function gateFor(provider: string): Gate {
  let g = gates.get(provider);
  if (!g) gates.set(provider, (g = new Gate(provider)));
  return g;
}

export function resetLimiters(): void {
  for (const g of gates.values()) g.reset();
  gates.clear();
}
