import { describe, expect, it } from "vitest";
import { findBannedEvaluative, findProtectedQuestion } from "@/lib/lexicon";
import { guardStream, type GuardResult } from "./guard";

async function* chunks(text: string, size = 4): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}

async function run(
  source: AsyncIterable<string>,
  fallbackQuestion = "FALLBACK?",
  extra: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<{ sentences: string[]; result: GuardResult; guard: string | null | undefined }> {
  const llmOptions: { guard?: string | null } = {};
  const gen = guardStream(source, { fallbackQuestion, upstream: new AbortController(), llmOptions, ...extra });
  const sentences: string[] = [];
  for (;;) {
    const step = await gen.next();
    if (step.done) return { sentences, result: step.value, guard: llmOptions.guard };
    sentences.push(step.value);
  }
}

describe("output guard", () => {
  it("passes a clean acknowledgement and question", async () => {
    const { sentences, result } = await run(chunks("Thanks, that's clear. Which tools do you use in that work?"));
    expect(sentences).toEqual(["Thanks, that's clear.", "Which tools do you use in that work?"]);
    expect(result.fallbackUsed).toBe(false);
  });

  it("7. drops praise and emits only the question", async () => {
    const { sentences, guard } = await run(chunks("Great, that's impressive! What tools did you use?"));
    expect(sentences).toEqual(["What tools did you use?"]);
    expect(guard).toContain("dropped_sentence");
  });

  it("8. cuts after the first question mark", async () => {
    const { sentences } = await run(chunks("Okay. What tools did you use? And who did you work with?"));
    expect(sentences).toEqual(["Okay.", "What tools did you use?"]);
  });

  it("9. uses the fallback question when the model asks nothing", async () => {
    const { sentences, result, guard } = await run(chunks("Thanks, noted."), "Mitä työkaluja käytät?");
    expect(sentences).toEqual(["Thanks, noted.", "Mitä työkaluja käytät?"]);
    expect(result.fallbackUsed).toBe(true);
    expect(guard).toContain("fallback");
  });

  it("drops a protected question and falls back", async () => {
    const { sentences, result } = await run(chunks("Okay. Where are you from originally?"), "What tools do you use?");
    expect(sentences).toEqual(["Okay.", "What tools do you use?"]);
    expect(result.fallbackUsed).toBe(true);
    for (const s of sentences) expect(findProtectedQuestion(s)).toEqual([]);
  });

  it("drops an evaluative sentence in Finnish and Swedish", async () => {
    const fi = await run(chunks("Hienoa! Mitä välineitä käytit?"));
    expect(fi.sentences).toEqual(["Mitä välineitä käytit?"]);
    const sv = await run(chunks("Fantastiskt! Vilka verktyg använde du?"));
    expect(sv.sentences).toEqual(["Vilka verktyg använde du?"]);
  });

  it("emits at most one statement before the question", async () => {
    const { sentences } = await run(chunks("Okay. Got it. Thanks. What did you do?"));
    expect(sentences).toEqual(["Okay.", "What did you do?"]);
  });

  it("falls back when the question would exceed 40 words in total", async () => {
    const long = `${"word ".repeat(45)}here?`;
    const { sentences, result } = await run(chunks(long), "SHORT?");
    expect(sentences).toEqual(["SHORT?"]);
    expect(result.fallbackUsed).toBe(true);
  });

  it("strips markdown, emoji, quotation marks and a speaker label", async () => {
    const { sentences } = await run(chunks('Interviewer: **Thanks** 😊 "Which tools" do you use?'));
    expect(sentences).toEqual(["Thanks Which tools do you use?"]);
  });

  it("12. [[STOP]] first: nothing is emitted and the guard reports stop", async () => {
    const { sentences, result } = await run(chunks("[[STOP]]"));
    expect(sentences).toEqual([]);
    expect(result.stopped).toBe(true);
    expect(result.fallbackUsed).toBe(false);
  });

  it("[[STOP]] after other text still stops and discards the text", async () => {
    const { result } = await run(chunks("Okay, I see. [[STOP]]", 3));
    expect(result.stopped).toBe(true);
    expect(result.text).toBe("");
  });

  it("falls back when the stream throws before a question", async () => {
    async function* broken(): AsyncGenerator<string> {
      yield "Thanks. ";
      throw new Error("provider failed");
    }
    const { sentences, result } = await run(broken());
    expect(sentences.at(-1)).toBe("FALLBACK?");
    expect(result.fallbackUsed).toBe(true);
  });

  it("falls back when the model does not answer in time", async () => {
    async function* silent(): AsyncGenerator<string> {
      await new Promise<never>(() => {});
      yield "never";
    }
    const { sentences, result } = await run(silent(), "FALLBACK?", { timeoutMs: 20 });
    expect(sentences).toEqual(["FALLBACK?"]);
    expect(result.fallbackUsed).toBe(true);
  });

  it("ends without a fallback when the caller aborts (barge-in)", async () => {
    const controller = new AbortController();
    async function* slow(): AsyncGenerator<string> {
      yield "Thanks. ";
      controller.abort();
      await new Promise<never>(() => {});
      yield "What tools?";
    }
    const { sentences, result } = await run(slow(), "FALLBACK?", { signal: controller.signal });
    expect(sentences).toEqual(["Thanks."]);
    expect(result.aborted).toBe(true);
    expect(result.fallbackUsed).toBe(false);
  });

  it("does not split on abbreviations", async () => {
    const { sentences } = await run(chunks("Which tools, e.g. software or machines, do you use?"));
    expect(sentences).toEqual(["Which tools, e.g. software or machines, do you use?"]);
  });

  it("everything emitted is free of banned and protected wording", async () => {
    const inputs = [
      "You seem confident. Impressive. What do you do?",
      "Excellent work! Tell me about your children. What tools do you use?",
    ];
    for (const input of inputs) {
      const { sentences } = await run(chunks(input));
      for (const s of sentences) {
        expect(findBannedEvaluative(s)).toEqual([]);
        expect(findProtectedQuestion(s)).toEqual([]);
      }
    }
  });

  it("drops a held statement when the fallback is used, so the reply stays within 40 words and 2 sentences", async () => {
    const statement = "Thanks for telling me about the busy warehouse where you worked with many different teams and shifts every single week, and for describing it so clearly.";
    const long = await run(chunks(`${statement} Do you have children?`), "What did you do on a normal day at work, from start to finish, step by step?");
    expect(long.result.fallbackUsed).toBe(true);
    expect(long.sentences).toEqual(["What did you do on a normal day at work, from start to finish, step by step?"]);
    const two = await run(chunks("Okay. Do you have children?"), "Could you give one example of when you did that? You can also skip this.");
    expect(two.sentences).toEqual(["Could you give one example of when you did that? You can also skip this."]);
  });
});
