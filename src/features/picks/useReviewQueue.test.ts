import { describe, expect, it } from "vitest";
import { alphabetical, nextAfterDecision } from "./useReviewQueue";
import type { QueuePick, ReviewQueue } from "./queue-view";

const pick = (id: string, handle: string | null) => ({ id, card: handle ? { handle } : null }) as unknown as QueuePick;

describe("alphabetical", () => {
  it("lists people A to Z by handle and by nothing else", () => {
    const q = {
      date: "2026-11-14",
      order: "no_particular_order",
      digests: [{ id: "d", needs: [{ needCardId: "n", picks: [pick("p3", "Spruce-14"), pick("p1", "Alder-38"), pick("p2", "Birch-27")] }] }],
    } as unknown as ReviewQueue;
    const handles = alphabetical(q).digests[0].needs[0].picks.map((p) => p.card?.handle);
    expect(handles).toEqual(["Alder-38", "Birch-27", "Spruce-14"]);
  });
});

describe("nextAfterDecision", () => {
  const p = (id: string, status: string) => ({ id, status, card: { handle: id } }) as unknown as QueuePick;
  const queue = (first: QueuePick[], second: QueuePick[]) =>
    ({
      date: "2026-11-14",
      order: "no_particular_order",
      digests: [
        { id: "d1", needs: [{ needCardId: "n1", picks: first }] },
        { id: "d2", needs: [{ needCardId: "n2", picks: second }] },
      ],
    }) as unknown as ReviewQueue;

  it("goes to the next person still waiting on the same company's list", () => {
    const q = queue([p("a", "approved"), p("b", "suggested"), p("c", "suggested")], [p("x", "suggested")]);
    expect(nextAfterDecision(q, "a")).toBe("b");
  });

  it("wraps round inside the same list", () => {
    const q = queue([p("a", "suggested"), p("b", "removed"), p("c", "approved")], [p("x", "suggested")]);
    expect(nextAfterDecision(q, "c")).toBe("a");
  });

  it("stays on the person just decided when the list has nobody waiting, and never moves to another company", () => {
    const q = queue([p("a", "approved"), p("b", "removed"), p("c", "approved")], [p("x", "suggested")]);
    expect(nextAfterDecision(q, "c")).toBe("c");
  });

  it("gives nothing when the person is no longer listed", () => {
    expect(nextAfterDecision(queue([p("a", "suggested")], []), "gone")).toBeNull();
  });
});
