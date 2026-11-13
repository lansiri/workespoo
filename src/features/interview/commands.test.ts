import { describe, expect, it } from "vitest";
import { preCheck } from "./commands";

describe("pre-check", () => {
  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["...", "empty"],
    ["123 456", "empty"],
    ["um", "empty"],
    ["Um, uh, hmm.", "empty"],
    ["öö niinku tota", "empty"],
    ["eh alltså ehm", "empty"],
    ["stop", "stop"],
    ["Stop.", "stop"],
    ["  END  ", "stop"],
    ["lopeta", "stop"],
    ["Lopetetaan!", "stop"],
    ["riittää", "stop"],
    ["avsluta intervjun", "stop"],
    ["I want to stop", "stop"],
    ["skip", "skip"],
    ["Next", "skip"],
    ["ohita", "skip"],
    ["en halua vastata", "skip"],
    ["hoppa över", "skip"],
    ["delete this", "delete"],
    ["Poista tuo", "delete"],
    ["ta bort det där", "delete"],
    ["I worked at a warehouse", "none"],
    ["I will stop by the warehouse every day and check the pallets", "none"],
    ["skip the queue at the checkout", "none"],
    ["uh I fixed the conveyor", "none"],
    ["tein siivousta hotellissa", "none"],
  ])("%j is %s", (text, expected) => {
    expect(preCheck(text)).toBe(expected);
  });

  it("matches a command only as the whole turn", () => {
    expect(preCheck("stop please, I want to add something about the forklift")).toBe("none");
  });
});
