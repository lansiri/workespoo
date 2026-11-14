import { describe, expect, it } from "vitest";
import { renderSwapSummary, summariseSwap, type SwapRow } from "./swap-summary";

const row = (variant: string, before: number, after: number, applicationId = "a1"): SwapRow => ({ applicationId, requirementId: "r", variant, before, after });

describe("summariseSwap", () => {
  it("counts stayed, moved by one and moved by more, per variant", () => {
    const s = summariseSwap([row("fi", 2, 2), row("fi", 2, 3), row("sv", 3, 0, "a2"), row("sv", 1, 1)]);
    expect(s).toMatchObject({ total: 4, stayed: 2, movedByOne: 1, movedByMore: 1, up: 1, down: 1, applicationsWithBigMove: ["a2"], stayedShare: 0.5 });
    expect(s.perVariant.fi).toMatchObject({ total: 2, stayed: 1, movedByOne: 1 });
    expect(s.perVariant.sv).toMatchObject({ total: 2, stayed: 1, movedByMore: 1 });
  });

  it("is empty-safe and renders", () => {
    expect(summariseSwap([]).stayedShare).toBe(1);
    expect(renderSwapSummary(summariseSwap([row("fi", 1, 2)]))).toContain("1 moved by one");
  });
});
