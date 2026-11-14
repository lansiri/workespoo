import { describe, expect, it } from "vitest";
import { alphabetical } from "./useReviewQueue";
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
