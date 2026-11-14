import { afterEach, describe, expect, it } from "vitest";
import { escoConcept } from "@/db/schema";
import { createTestDb } from "../../../tests/helpers/db";
import { resetLlmState, setLlmFake } from "@/lib/llm";
import { answerJobQuestion, buildJobAnswerMessages, fallbackJobAnswer, relevantFacts, type JobQuestion } from "./job-candidate";
import { loadPersonas } from "./persona";

const personas = loadPersonas();
const persona = personas[0];
const q = (over: Partial<JobQuestion> = {}): JobQuestion => ({ requirementText: "Experience with underwater welding", question: "Tell me about welding under water.", followUp: false, earlier: [], ...over });

afterEach(() => resetLlmState());

describe("fallbackJobAnswer", () => {
  it("tells a matching story as the sheet holds it", () => {
    const fact = persona.facts[0];
    const answer = fallbackJobAnswer(persona, q({ requirementText: fact.story }));
    expect(answer).toContain(fact.story);
  });

  it("says plainly it has not done it, and offers only a story the sheet holds", () => {
    const answer = fallbackJobAnswer(persona, q({ requirementText: "zzzz qqqq xxxx" }));
    expect(answer).toMatch(/not done that/i);
    expect(answer).toContain(persona.facts[0].story);
  });

  it("never claims what the sheet lacks, for every persona", () => {
    for (const p of personas) {
      const sheet = new Set(p.facts.map((f) => f.story));
      const answer = fallbackJobAnswer(p, q({ requirementText: "quantum chromodynamics" }));
      const stories = [...sheet].filter((s) => answer.includes(s));
      expect(stories).toEqual([p.facts[0].story]);
    }
  });

  it("on a follow-up gives another story if there is one, else says it has nothing to add", () => {
    const fact = persona.facts[0];
    const first = fallbackJobAnswer(persona, q({ requirementText: fact.story }));
    const more = fallbackJobAnswer(persona, q({ requirementText: fact.story, followUp: true, earlier: [first] }));
    expect(more).not.toContain(fact.story);
    const nothing = fallbackJobAnswer(persona, q({ requirementText: "zzzz qqqq", followUp: true, earlier: ["x"] }));
    expect(nothing).toMatch(/nothing to add|anything to add|ei .* lisättävää|inget att tillägga/i);
  });

  it("answers in the persona's language", () => {
    const fi = personas.find((p) => p.interviewLang === "fi");
    if (!fi) return;
    expect(fallbackJobAnswer(fi, q({ requirementText: "zzzz qqqq" }))).toMatch(/En ole tehnyt/);
  });
});

describe("answerJobQuestion", () => {
  it("uses the model for one call per answer and sends the sheet, requirement and question", async () => {
    const seen: string[] = [];
    setLlmFake((opts) => {
      seen.push(`${opts.role}:${opts.purpose}`);
      return "I worked with it. I did the setup.";
    });
    const text = await answerJobQuestion(undefined, persona, q());
    expect(seen).toEqual(["bulk:synth.job_answer"]);
    expect(text).toBe("I worked with it. I did the setup.");
    const msgs = buildJobAnswerMessages(persona, q());
    expect(msgs[0].content).toContain(persona.facts[0].story);
    expect(msgs[1].content).toContain("underwater welding");
  });

  it("falls back to the sheet when the model fails", async () => {
    setLlmFake(() => {
      throw new Error("down");
    });
    expect(await answerJobQuestion(undefined, persona, q({ requirementText: "zzzz qqqq" }))).toMatch(/not done that|En ole|Jag har inte/);
  });
});

describe("relevantFacts", () => {
  it("matches on word stems", () => {
    const f = persona.facts[0];
    const word = f.story.match(/\p{L}{6,}/u)![0];
    expect(relevantFacts(persona, `needs ${word}`)).toContain(f);
  });
});

describe("the NOT done section of the sheet", () => {
  it("holds the omitted skills as labels, never as ESCO uris", async () => {
    const t = await createTestDb();
    try {
      await t.db.insert(escoConcept).values(persona.omit.map((uri, i) => ({ uri, type: "skill" as const, labelEn: `Omitted skill ${i}` })));
      let system = "";
      setLlmFake((opts) => {
        system = String((opts.messages as Array<{ content: string }>)[0].content);
        return "I have not done that. The closest I have is a story.";
      });
      await answerJobQuestion(t.db, persona, q());
      expect(system).not.toContain("http://data.europa.eu/esco");
      persona.omit.forEach((_, i) => expect(system).toContain(`- Omitted skill ${i}`));
    } finally {
      await t.close();
    }
  }, 60_000);
});
