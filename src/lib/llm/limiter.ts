/** Timing seam so tests do not wait on real backoff. */
export const timing = {
  now: () => Date.now(),
  sleep: (ms: number, signal?: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
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
    }),
};

export class Semaphore {
  private active = 0;
  private waiters: Array<() => void> = [];
  constructor(private readonly max: number) {}

  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) throw new Error("aborted");
    if (this.active < this.max) {
      this.active++;
      return this.releaser();
    }
    await new Promise<void>((resolve, reject) => {
      const wake = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      const onAbort = () => {
        this.waiters = this.waiters.filter((w) => w !== wake);
        reject(new Error("aborted"));
      };
      this.waiters.push(wake);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
    // the slot was handed over by release(), `active` already counts it
    return this.releaser();
  }

  private releaser(): () => void {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const next = this.waiters.shift();
      if (next) next();
      else this.active--;
    };
  }
}

/** Sliding one-minute window. */
export class RpmLimiter {
  private stamps: number[] = [];
  constructor(
    private readonly max: number,
    private readonly t: Pick<typeof timing, "now" | "sleep"> = timing,
  ) {}

  async wait(signal?: AbortSignal): Promise<void> {
    for (;;) {
      const now = this.t.now();
      this.stamps = this.stamps.filter((s) => now - s < 60_000);
      if (this.stamps.length < this.max) {
        this.stamps.push(now);
        return;
      }
      await this.t.sleep(60_000 - (now - this.stamps[0]) + 5, signal);
    }
  }
}

const semaphores = new Map<string, Semaphore>();
const rpm = new Map<string, RpmLimiter>();

export function semaphoreFor(provider: string, max: number): Semaphore {
  let s = semaphores.get(provider);
  if (!s) semaphores.set(provider, (s = new Semaphore(max)));
  return s;
}

export function rpmFor(provider: string, max: number): RpmLimiter {
  let s = rpm.get(provider);
  if (!s) rpm.set(provider, (s = new RpmLimiter(max)));
  return s;
}

export function resetLimiters(): void {
  semaphores.clear();
  rpm.clear();
}
