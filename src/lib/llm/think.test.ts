import { describe, expect, it } from "vitest";
import { ThinkStripper, stripThink } from "./think";

function run(chunks: string[]): string {
  const s = new ThinkStripper();
  return chunks.map((c) => s.push(c)).join("") + s.flush();
}

describe("ThinkStripper", () => {
  it("strips a whole block and the whitespace after it", () => {
    expect(stripThink("<think>plan\nmore</think>\n\nHello")).toBe("Hello");
    expect(stripThink("Hi <think>x</think>there")).toBe("Hi there");
  });
  it("strips tags split across chunks at every position", () => {
    const text = "A<think>secret</think>B";
    for (let i = 1; i < text.length; i++) {
      expect(run([text.slice(0, i), text.slice(i)])).toBe("AB");
    }
    expect(run([...text])).toBe("AB");
  });
  it("drops an unterminated block at the end of the stream", () => {
    expect(run(["Answer. <thi", "nk>never closed", " still thinking"])).toBe("Answer. ");
  });
  it("keeps a lone partial tag that never completes as text", () => {
    expect(run(["a <th"])).toBe("a <th");
  });
  it("handles several blocks", () => {
    expect(stripThink("<think>a</think>X<think>b</think>Y")).toBe("XY");
  });
});
