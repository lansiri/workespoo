/** Caps how many text-to-speech requests run at once in this process. */
export class ConcurrencyLimiter {
  private active = 0;
  constructor(private readonly max: number) {}

  /** Returns a release function, or null when the cap is reached. */
  tryAcquire(): (() => void) | null {
    if (this.active >= this.max) return null;
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
    };
  }

  get inFlight(): number {
    return this.active;
  }
}

export const ttsLimiter = new ConcurrencyLimiter(6);
