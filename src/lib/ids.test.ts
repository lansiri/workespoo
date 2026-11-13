import { describe, expect, it } from "vitest";
import { HANDLE_WORDS, newHandle, newId, newToken } from "./ids";

describe("ids", () => {
  it("newId has prefix and 12 lowercase alphanumerics, unique over many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const id = newId("tal");
      expect(id).toMatch(/^tal_[a-z0-9]{12}$/);
      seen.add(id);
    }
    expect(seen.size).toBe(5000);
    expect(newId("intro")).toMatch(/^intro_[a-z0-9]{12}$/);
  });

  it("newToken is 32 URL-safe characters, unique", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const t = newToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
      seen.add(t);
    }
    expect(seen.size).toBe(5000);
  });

  it("newHandle is Word-NN from the fixed list", async () => {
    expect(HANDLE_WORDS).toHaveLength(32);
    for (let i = 0; i < 300; i++) {
      const h = await newHandle(async () => false);
      const m = /^([A-Z][a-z]+)-(\d{2})$/.exec(h);
      expect(m).not.toBeNull();
      expect(HANDLE_WORDS).toContain(m![1]);
      expect(Number(m![2])).toBeGreaterThanOrEqual(10);
    }
  });

  it("newHandle retries on collision and moves to three digits after 20 collisions", async () => {
    let calls = 0;
    const h = await newHandle(async () => ++calls <= 3);
    expect(calls).toBe(4);
    expect(h).toMatch(/^[A-Z][a-z]+-\d{2}$/);

    const tried: string[] = [];
    const h2 = await newHandle(async (x) => {
      tried.push(x);
      return tried.length <= 20;
    });
    expect(tried).toHaveLength(21);
    expect(tried.slice(0, 20).every((x) => /-\d{2}$/.test(x))).toBe(true);
    expect(h2).toMatch(/^[A-Z][a-z]+-\d{3}$/);
  });
});
