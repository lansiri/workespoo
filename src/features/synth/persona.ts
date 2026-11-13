/**
 * The persona file: a fact sheet (docs/specs/synthetic-world.md 2.3) plus the scripted answers
 * a person gives in an interview. Everything here is synthetic and labelled as such.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CoverageArea, InputMode, InterviewMode, LookingFor, UiLang } from "@/contracts";

export const PERSONA_DIR = path.resolve(process.cwd(), "seed/personas");

/** Areas an interview of each mode asks about. Express: Q1 recent_work, Q2 example, Q3 looking_for. */
export const EXPRESS_AREAS = ["recent_work", "example", "looking_for"] as const satisfies readonly CoverageArea[];
export const ANSWER_AREAS = CoverageArea.options;

const Answer = z.string().min(20).max(1200);

export const PersonaFact = z.strictObject({
  skillUri: z.string().min(1),
  /** English ESCO label, for readers of the file. */
  label: z.string().min(1),
  /** One concrete sentence about how the person used the skill. No protected attributes. */
  story: z.string().min(10).max(260),
});

/**
 * A protected fact placed inside an answer that also contains a real skill (interview spec
 * 10.5). The harness checks that none of `tokens` and `alsoCheck` reaches the card while one
 * of `skillKeywords` does.
 */
export const PlantedFact = z.strictObject({
  area: CoverageArea,
  /** What kind of protected attribute this is, for the reader of the report. */
  kind: z.string().min(3).max(60),
  /** Words that appear in the answer and must not appear on the card. */
  tokens: z.array(z.string().min(2)).min(1).max(6),
  /** Other forms the card might use (an English translation, an adjective). Need not occur in the answer. */
  alsoCheck: z.array(z.string().min(2)).max(6).default([]),
  /** Lower-case fragments; at least one must appear in a card signal for the skill to count as kept. */
  skillKeywords: z.array(z.string().min(2)).min(1).max(8),
});
export type PlantedFact = z.infer<typeof PlantedFact>;

export const PersonaSchema = z
  .strictObject({
    id: z.string().regex(/^p\d{2}b?$/),
    synthetic: z.literal(true),
    /** Pseudonymous handle, `Word-NN`. */
    handle: z.string().regex(/^[A-Z][a-z]+-\d{2,3}$/),
    /** Always ends with " (synthetic)". Shown only after both sides accepted an introduction. */
    name: z.string().endsWith(" (synthetic)"),
    email: z.string().regex(/^[^@\s]+@example\.invalid$/),
    interviewLang: UiLang,
    interviewMode: InterviewMode,
    inputMode: InputMode,
    occupationUri: z.string().min(1),
    occupationLabel: z.string().min(1),
    isco2: z.string().regex(/^\d{2}$/),
    stage: z.enum(["early", "mid", "long"]),
    route: z.enum(["studied_in_finland", "moved_for_work", "grew_up_in_finland", "career_changer"]),
    facts: z.array(PersonaFact).min(3).max(8),
    /** Skills the postings of this occupation often ask for and the person never mentions. */
    omit: z.array(z.string()).min(1).max(3),
    lookingFor: LookingFor,
    answers: z.strictObject({
      recent_work: Answer,
      example: Answer,
      tools: Answer,
      people: Answer,
      beyond: Answer,
      open_floor: Answer,
      looking_for: Answer,
    }),
    /** More concrete second answers, given in order when the interviewer asks for an example. */
    probes: z.array(Answer).min(1).max(3),
    planted: z.array(PlantedFact).min(1).max(2),
    twinOf: z.string().nullable(),
  })
  .superRefine((p, ctx) => {
    for (const [i, fact] of p.planted.entries()) {
      const text = p.answers[fact.area].toLowerCase();
      for (const token of fact.tokens) {
        if (!text.includes(token.toLowerCase())) {
          ctx.addIssue({ code: "custom", path: ["planted", i, "tokens"], message: `token "${token}" is not in the ${fact.area} answer` });
        }
      }
      if (p.interviewMode === "express" && !(EXPRESS_AREAS as readonly string[]).includes(fact.area)) {
        ctx.addIssue({ code: "custom", path: ["planted", i, "area"], message: "an express interview never asks this area" });
      }
    }
  });
export type Persona = z.infer<typeof PersonaSchema>;

/** Parse one persona file's contents. Throws a readable error naming the file. */
export function parsePersona(raw: unknown, source = "persona"): Persona {
  const parsed = PersonaSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`${source} is not a valid persona: ${issues}`);
  }
  return parsed.data;
}

/** Load and validate every `*.json` file in the persona directory, sorted by id. */
export function loadPersonas(dir: string = PERSONA_DIR): Persona[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) throw new Error(`no persona files in ${dir}`);
  const personas = files.map((f) => parsePersona(JSON.parse(readFileSync(path.join(dir, f), "utf8")), f));
  const seen = new Set<string>();
  for (const p of personas) {
    for (const key of [p.id, p.handle, p.email]) {
      if (seen.has(key)) throw new Error(`duplicate persona id, handle or email: ${key}`);
      seen.add(key);
    }
  }
  return personas.sort((a, b) => a.id.localeCompare(b.id));
}
