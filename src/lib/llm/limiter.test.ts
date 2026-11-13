import { describe, expect, it } from "vitest";
import { RpmLimiter, Semaphore } from "./limiter";

describe("Semaphore", () => {
  it("never runs more than max at once and hands slots over in order", async () => {
    const s = new Semaphore(2);
    const r1 = await s.acquire();
    const r2 = await s.acquire();
    const order: number[] = [];
    const p3 = s.acquire().then((r) => (order.push(3), r));
    const p4 = s.acquire().then((r) => (order.push(4), r));
    await Promise.resolve();
    expect(order).toEqual([]);
    r1();
    const r3 = await p3;
    expect(order).toEqual([3]);
    r2();
    const r4 = await p4;
    expect(order).toEqual([3, 4]);
    r3();
    r4();
    const again = await s.acquire();
    again();
  });
  it("rejects a waiting acquire when aborted", async () => {
    const s = new Semaphore(1);
    await s.acquire();
    const ac = new AbortController();
    const p = s.acquire(ac.signal);
    ac.abort();
    await expect(p).rejects.toThrow("aborted");
  });
});

describe("RpmLimiter", () => {
  it("waits for the window when the budget is spent", async () => {
    let now = 0;
    const sleeps: number[] = [];
    const lim = new RpmLimiter(2, {
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    });
    await lim.wait();
    now = 1000;
    await lim.wait();
    await lim.wait(); // third must wait until the first stamp is 60 s old
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(59_000);
    expect(now).toBeGreaterThanOrEqual(60_000);
  });
});
