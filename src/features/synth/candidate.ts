/**
 * The scripted candidate: answers the interviewer from a persona file, with no model.
 * It is what drives simulated interviews deterministically.
 */
import type { CoverageArea, TurnKind } from "@/contracts";
import type { Persona } from "./persona";

/** The parts of an interviewer turn the candidate needs. */
export type InterviewerTurnLike = { kind: TurnKind; target: CoverageArea | null };

/**
 * One candidate per interview. It remembers what it has said so that:
 * - a question about an area it already answered gets the next, more concrete answer;
 * - a probe gets the next probe answer (the last one repeats if there are more probes than answers);
 * - a repair request gets the previous answer again;
 * - a closing gets nothing.
 */
export class ScriptedCandidate {
  private answered = new Set<CoverageArea>();
  private probesGiven = 0;
  private last: string | null = null;

  constructor(private readonly persona: Persona) {}

  /** The text to submit in answer to this interviewer turn, or null when no answer is due. */
  reply(turn: InterviewerTurnLike): string | null {
    switch (turn.kind) {
      case "closing":
      case "answer":
      case "review_note":
        return null;
      case "repair":
        return this.say(this.last ?? this.persona.answers.recent_work);
      case "probe":
        return this.say(this.nextProbe());
      case "opening":
        return this.ask("recent_work");
      case "question":
        return this.ask(turn.target ?? "open_floor");
    }
  }

  private ask(area: CoverageArea): string {
    if (this.answered.has(area)) {
      // Asked again (a thin or short answer was re-asked): add detail instead of repeating.
      return this.say(this.probesGiven < this.persona.probes.length ? this.nextProbe() : this.persona.answers[area]);
    }
    this.answered.add(area);
    return this.say(this.persona.answers[area]);
  }

  private nextProbe(): string {
    const { probes } = this.persona;
    const text = probes[Math.min(this.probesGiven, probes.length - 1)];
    this.probesGiven++;
    return text;
  }

  private say(text: string): string {
    this.last = text;
    return text;
  }
}
