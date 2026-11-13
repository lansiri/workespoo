import { describe, expect, it } from "vitest";
import type { CoverageArea, TurnKind } from "@/contracts";
import { ScriptedCandidate } from "./candidate";
import { loadPersonas } from "./persona";

const [p01] = loadPersonas();
const turn = (kind: TurnKind, target: CoverageArea | null = null) => ({ kind, target });

describe("ScriptedCandidate", () => {
  it("answers the opening with recent_work and each question with its area", () => {
    const c = new ScriptedCandidate(p01);
    expect(c.reply(turn("opening", "recent_work"))).toBe(p01.answers.recent_work);
    expect(c.reply(turn("question", "example"))).toBe(p01.answers.example);
    expect(c.reply(turn("question", "tools"))).toBe(p01.answers.tools);
    expect(c.reply(turn("question", "people"))).toBe(p01.answers.people);
    expect(c.reply(turn("question", "beyond"))).toBe(p01.answers.beyond);
    expect(c.reply(turn("question", "open_floor"))).toBe(p01.answers.open_floor);
    expect(c.reply(turn("question", "looking_for"))).toBe(p01.answers.looking_for);
  });

  it("answers a probe with a more concrete second answer, in order", () => {
    const c = new ScriptedCandidate(p01);
    c.reply(turn("opening", "recent_work"));
    expect(c.reply(turn("probe", "recent_work"))).toBe(p01.probes[0]);
    expect(c.reply(turn("probe", "tools"))).toBe(p01.probes[1]);
    // More probes than answers: the last one repeats rather than failing.
    expect(c.reply(turn("probe", "tools"))).toBe(p01.probes[1]);
  });

  it("repeats the previous answer after a repair", () => {
    const c = new ScriptedCandidate(p01);
    c.reply(turn("opening", "recent_work"));
    c.reply(turn("question", "example"));
    expect(c.reply(turn("repair"))).toBe(p01.answers.example);
    expect(c.reply(turn("repair"))).toBe(p01.answers.example);
  });

  it("falls back to the first answer when asked to repeat before saying anything", () => {
    expect(new ScriptedCandidate(p01).reply(turn("repair"))).toBe(p01.answers.recent_work);
  });

  it("says nothing to a closing", () => {
    expect(new ScriptedCandidate(p01).reply(turn("closing"))).toBeNull();
  });

  it("adds detail when an area is asked a second time", () => {
    const c = new ScriptedCandidate(p01);
    c.reply(turn("question", "tools"));
    expect(c.reply(turn("question", "tools"))).toBe(p01.probes[0]);
  });

  it("has an answer for every area and turn kind, for every persona", () => {
    for (const persona of loadPersonas()) {
      const c = new ScriptedCandidate(persona);
      const kinds: TurnKind[] = ["opening", "question", "probe", "repair"];
      for (const kind of kinds) for (const area of ["recent_work", "example", "tools", "people", "beyond", "open_floor", "looking_for"] as const) {
        const text = c.reply(turn(kind, area));
        expect(text, `${persona.id} ${kind} ${area}`).toBeTruthy();
      }
      expect(c.reply(turn("closing"))).toBeNull();
    }
  });
});
