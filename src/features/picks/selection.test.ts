import { describe, expect, it } from "vitest";
import { chooseHandful, type Candidate } from "./selection";

const never = (talentId: string, extra: Partial<Candidate> = {}): Candidate => ({
  talentId,
  lastDrafted: null,
  recent: false,
  capped: false,
  ...extra,
});
const day = (n: number) => new Date(Date.UTC(2026, 10, n));

describe("chooseHandful", () => {
  it("takes people never suggested before anyone who was, then the least recently suggested", () => {
    const chosen = chooseHandful(
      [
        never("old", { lastDrafted: day(1) }),
        never("newer", { lastDrafted: day(5) }),
        never("fresh1"),
        never("middle", { lastDrafted: day(3) }),
        never("fresh2"),
      ],
      { k: 4, seed: "s" },
    );
    const ids = chosen.map((c) => c.talentId);
    expect(ids.slice(0, 2).sort()).toEqual(["fresh1", "fresh2"]);
    expect(ids.slice(2)).toEqual(["old", "middle"]);
    expect(chosen.every((c) => c.pass === 1)).toBe(true);
  });

  it("records when each chosen person was last suggested", () => {
    const [c] = chooseHandful([never("a", { lastDrafted: day(2) })], { k: 1, seed: "s" });
    expect(c.lastDraftedBefore).toEqual(day(2));
  });

  it("breaks ties with a hash of the seed, so a different seed can change the order", () => {
    const people = ["a", "b", "c", "d", "e", "f"].map((id) => never(id));
    const orders = new Set<string>();
    for (let i = 0; i < 20; i++) {
      orders.add(chooseHandful(people, { k: 6, seed: `seed-${i}` }).map((c) => c.talentId).join(""));
    }
    expect(orders.size).toBeGreaterThan(1);
    const again = chooseHandful(people, { k: 6, seed: "seed-3" }).map((c) => c.talentId).join("");
    expect(again).toBe(chooseHandful(people, { k: 6, seed: "seed-3" }).map((c) => c.talentId).join(""));
  });

  it("takes people outside the rotation window first and recent ones only to fill up (M16)", () => {
    const people = [
      ...["a", "b", "c", "d", "e"].map((id) => never(id)),
      ...["r1", "r2", "r3"].map((id) => never(id, { lastDrafted: day(10), recent: true })),
    ];
    const five = chooseHandful(people, { k: 5, seed: "s" });
    expect(five.map((c) => c.talentId).sort()).toEqual(["a", "b", "c", "d", "e"]);
    const seven = chooseHandful(people, { k: 7, seed: "s" });
    const filled = seven.filter((c) => c.pass === 2).map((c) => c.talentId);
    expect(filled).toHaveLength(2);
    expect(filled.every((id) => ["r1", "r2", "r3"].includes(id))).toBe(true);
    expect(seven.filter((c) => c.pass === 1)).toHaveLength(5);
  });

  it("never takes someone who is at the daily cap", () => {
    const chosen = chooseHandful([never("a", { capped: true }), never("b"), never("c", { recent: true, capped: true })], {
      k: 5,
      seed: "s",
    });
    expect(chosen.map((c) => c.talentId)).toEqual(["b"]);
  });

  it("does not let how many requirements a person touches change who is chosen (M8, M9)", () => {
    // The candidate type has no field for overlap, so the rule cannot read it. Check the
    // outcome as well: over many seeds, two never-suggested people are picked about equally.
    const people = [never("two-requirements"), never("six-requirements")];
    let first = 0;
    const runs = 400;
    for (let i = 0; i < runs; i++) {
      const [c] = chooseHandful(people, { k: 1, seed: `2026-11-26:co_1:nc_${i}` });
      if (c.talentId === "two-requirements") first++;
    }
    const share = first / runs;
    expect(share).toBeGreaterThan(0.35);
    expect(share).toBeLessThan(0.65);
    // Same seed, same input: same result, whatever else is true of the card.
    expect(chooseHandful(people, { k: 1, seed: "x" })).toEqual(chooseHandful([...people].reverse(), { k: 1, seed: "x" }));
  });
});
