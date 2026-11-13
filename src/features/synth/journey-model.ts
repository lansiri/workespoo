/**
 * A scripted stand-in for the model, for the end-to-end journey test and nothing else. It answers
 * by `purpose` with outputs shaped like the worked examples of each prompt spec, and it stands in
 * for the model only: the product code that calls it, parses and checks what it says is real.
 *
 * It reads the prompt it is given, so it works for any persona: it cites sentence labels that
 * exist in the prompt, never labels it invented, and it skips sentences that carry a planted
 * protected fact (the real model is asked to do the same by the extractor prompt).
 */
import type { LlmFake } from "@/lib/llm/testing";
import type { LlmOptions } from "@/lib/llm";
import type { Persona } from "./persona";

export type NeedScriptItem = {
  /** The posting sentence this requirement comes from: the start of its text. */
  sentenceStarts: string;
  text: string;
  kind: "must" | "nice";
  category?: "skill" | "language" | "education" | "experience" | "authorisation" | "other";
  /** ESCO labels (English) that must appear in the prompt's list. */
  esco?: string[];
  language?: string | null;
  years?: number | null;
  question?: { type: "language" | "years" | "degree" | "tool" | "vague"; text: string; why: string };
};

export type JourneyModelOptions = {
  persona: Persona;
  /** The scripted Need Card is for the posting whose title starts with `postingTitle`; any other posting gets a one-requirement card. */
  need: { postingTitle: string; title: string; summary: string; items: NeedScriptItem[] };
};

/** The model calls made, in order, so a test can say what was asked for. */
export type ModelCallLog = Array<{ purpose: string; role: string }>;

const LIVE_BY_TARGET: Array<[RegExp, string]> = [
  [/one concrete example/, "Thanks. Could you give one example of that? You can also skip this."],
  [/Their earlier answer/, "Okay. Could you describe a typical day in that work?"],
  [/specific task or situation/, "Thanks, that's clear. Could you describe one task you handled yourself?"],
  [/tools, equipment, software/, "Okay. Which tools do you use in that work?"],
  [/who they worked with/, "Thanks. Who do you usually work with, and what is your part?"],
  [/outside their main job/, "Okay. Is there something you learned outside your main job?"],
  [/anything else/, "Thanks. Is there anything else you would like in your notes?"],
  [/looking for next/, "Okay. What kind of work are you looking for next?"],
];

const STOP = new Set([
  "that", "with", "from", "they", "this", "into", "before", "after", "every", "then", "than", "them", "their",
  "have", "been", "were", "when", "what", "which", "also", "only", "goes", "over", "some", "more", "most",
]);
const words = (text: string): Set<string> => new Set((text.toLowerCase().match(/[a-zåäö]{4,}/g) ?? []).filter((w) => !STOP.has(w)));

type Sentence = { label: string; turn: number; text: string };

function sentencesIn(prompt: string): Sentence[] {
  return [...prompt.matchAll(/^\[T(\d+)\.S(\d+)\] (.*)$/gm)].map((m) => ({ label: `T${m[1]}.S${m[2]}`, turn: Number(m[1]), text: m[3] }));
}

const stripParens = (label: string) => label.replace(/\s*\(.*\)/, "");
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "Writes Python jobs" becomes "They write Python jobs": a third-person paraphrase of the fact sheet. */
function theyForm(story: string): string {
  const [first, ...rest] = story.split(" ");
  const verb = first.endsWith("es") && /(ss|sh|ch|x|zz)es$/.test(first) ? first.slice(0, -2) : first.endsWith("s") && !first.endsWith("ss") ? first.slice(0, -1) : first;
  return `They ${lowerFirst([verb, ...rest].join(" ")).replace(/\.$/, "")}.`;
}

export function journeyModel(options: JourneyModelOptions): { fake: LlmFake; calls: ModelCallLog } {
  const { persona, need } = options;
  const calls: ModelCallLog = [];
  const emitted = new Set<string>();
  const plantedTokens = persona.planted.flatMap((p) => [...p.tokens, ...p.alsoCheck]).map((t) => t.toLowerCase());
  const carriesPlanted = (text: string) => plantedTokens.some((t) => text.toLowerCase().includes(t));
  const exampleWords = words(persona.answers.example);

  /** The fact a sentence is about: the one whose story shares the most words with it, at least two. */
  const factFor = (sentence: string) => {
    const w = words(sentence);
    let best: { fact: Persona["facts"][number]; shared: number } | null = null;
    for (const fact of persona.facts) {
      const shared = [...words(`${fact.story} ${fact.label}`)].filter((x) => w.has(x)).length;
      if (shared >= 2 && (!best || shared > best.shared)) best = { fact, shared };
    }
    return best?.fact ?? null;
  };

  const extract = (opts: LlmOptions) => {
    const user = opts.messages[1]!.content;
    const section = /PERSON'S SENTENCES:\n([\s\S]*?)\n\nKNOWN SIGNALS/.exec(user)?.[1] ?? "";
    const signals: Array<{ ref: string; phrase: string; kind: string; evidence: string[]; hasExample: boolean }> = [];
    for (const s of sentencesIn(section)) {
      if (carriesPlanted(s.text)) continue;
      const fact = factFor(s.text);
      if (!fact || emitted.has(fact.skillUri)) continue;
      emitted.add(fact.skillUri);
      const hasExample = [...words(s.text)].filter((x) => exampleWords.has(x)).length >= 4;
      signals.push({ ref: "new", phrase: stripParens(fact.label), kind: "skill", evidence: [s.label], hasExample });
    }
    const lang = persona.interviewLang;
    return { lang, signals: signals.slice(0, 5), coverage: {}, flags: [], note: "" };
  };

  const synthesise = (opts: LlmOptions) => {
    const user = opts.messages[1]!.content;
    const all = sentencesIn(user.split("DRAFT NOTES")[0] ?? "");
    const drafts = [...user.matchAll(/^(s\d+) \| (\w+) \| (.+?) \| (T[\d.S,\- ]+)$/gm)];
    const signals = drafts.map((d) => {
      const fact = persona.facts.find((f) => stripParens(f.label) === d[3]);
      return {
        phrase: d[3],
        kind: d[2],
        evidence: d[4].split(",").map((e) => e.trim()).slice(0, 3),
        from: [d[1]],
        rendering: fact ? theyForm(fact.story) : `They worked with ${d[3]}.`,
      };
    });
    const looking = all.find((s) => persona.answers.looking_for.includes(s.text));
    const headlineSkills = signals.slice(0, 3).map((s) => s.phrase).join(", ");
    return {
      headline: `${persona.occupationLabel.charAt(0).toUpperCase()}${persona.occupationLabel.slice(1)}: ${headlineSkills}`.slice(0, 90),
      summary: `Has worked as a ${persona.occupationLabel} with ${headlineSkills}.`.slice(0, 300),
      signals,
      roles: looking ? persona.lookingFor.roles.slice(0, 3) : [],
      rolesEvidence: looking ? [looking.label] : [],
    };
  };

  /** Postings the feed asks to explain (no company, no script): one nice-to-have from the first full sentence. */
  const genericNeed = (user: string) => {
    const first = [...user.matchAll(/^\[P(\d+)\] (.*)$/gm)].find((m) => m[2].split(" ").length >= 6);
    return {
      title: /Posting title: (.*)/.exec(user)?.[1]?.slice(0, 60) ?? "A role",
      summary: "A role described in the posting.",
      requirements: first ? [{ text: first[2].slice(0, 80), kind: "nice", category: "other", sentence: Number(first[1]), esco: [], language: null, years: null, statutory: "none", questionType: "none", question: null, why: null }] : [],
      dropped: [],
    };
  };

  const draftNeed = (opts: LlmOptions) => {
    const user = opts.messages.filter((m) => m.role === "user").at(-1)!.content;
    if (!user.includes(`Posting title: ${need.postingTitle}`)) return genericNeed(user);
    const sentenceIndex = (starts: string) => {
      const m = [...user.matchAll(/^\[P(\d+)\] (.*)$/gm)].find((x) => x[2].startsWith(starts));
      if (!m) throw new Error(`journey model: the posting has no sentence starting "${starts}"`);
      return Number(m[1]);
    };
    const kLabels = [...user.matchAll(/^(K\d+): (.*?) \/ /gm)].map((m) => [m[1], m[2]] as const);
    const k = (label: string) => {
      const hit = kLabels.find(([, en]) => en === label);
      if (!hit) throw new Error(`journey model: ESCO label "${label}" is not offered in the prompt`);
      return hit[0];
    };
    return {
      title: need.title,
      summary: need.summary,
      requirements: need.items.map((r) => ({
        text: r.text,
        kind: r.kind,
        category: r.category ?? "skill",
        sentence: sentenceIndex(r.sentenceStarts),
        esco: (r.esco ?? []).map(k),
        language: r.language ?? null,
        years: r.years ?? null,
        statutory: "none",
        questionType: r.question?.type ?? "none",
        question: r.question?.text ?? null,
        why: r.question?.why ?? null,
      })),
      dropped: [],
    };
  };

  const feedReasons = (opts: LlmOptions) => {
    const user = opts.messages[1]!.content;
    const phrases = new Map([...user.matchAll(/^(S\d+): (.*?)\.(?: .*)?$/gm)].map((m) => [m[1], m[2]]));
    const pairs = [...(/Allowed pairs \(signal, sentence\):\n([\s\S]*?)\n\nReturn JSON/.exec(user)?.[1] ?? "").matchAll(/^(S\d+), (P\d+)$/gm)];
    const seen = new Set<string>();
    const reasons = [];
    for (const [, signal, sentence] of pairs) {
      if (seen.has(signal) || !phrases.has(signal)) continue;
      seen.add(signal);
      reasons.push({ signal, sentence, text: `Your card describes ${phrases.get(signal)}, which this posting also asks about.` });
      if (reasons.length === 2) break;
    }
    return { reasons };
  };

  const pickReasons = (opts: LlmOptions) => {
    const user = opts.messages[1]!.content;
    const phrases = new Map([...user.matchAll(/^(S\d+): (.*?)\.(?: .*)?$/gm)].map((m) => [m[1], m[2]]));
    const requirements = new Map([...user.matchAll(/^(R\d+) \((?:must|nice)\): (.*)$/gm)].map((m) => [m[1], m[2]]));
    const pairs = [...(/Allowed pairs \(requirement, signal\):\n([\s\S]*?)\n\nReturn JSON/.exec(user)?.[1] ?? "").matchAll(/^(R\d+), (S\d+)$/gm)];
    const seen = new Set<string>();
    const reasons = [];
    for (const [, req, signal] of pairs) {
      if (seen.has(req) || !phrases.has(signal)) continue;
      seen.add(req);
      reasons.push({ req, signal, text: `The card describes ${phrases.get(signal)}, which relates to ${requirements.get(req)}.`.slice(0, 160) });
      if (reasons.length === 3) break;
    }
    return { reasons };
  };

  const fake: LlmFake = (opts) => {
    calls.push({ purpose: opts.purpose, role: opts.role });
    switch (opts.purpose) {
      case "interview.live": {
        const target = /TARGET\n([^\n]*)/.exec(opts.messages[0]!.content)?.[1] ?? "";
        return LIVE_BY_TARGET.find(([re]) => re.test(target))?.[1] ?? "Okay. What did you do?";
      }
      case "interview.extract":
        return extract(opts);
      case "card.synthesis":
        return synthesise(opts);
      case "needs.draft":
        return draftNeed(opts);
      case "matching.feed_reasons":
        return feedReasons(opts);
      case "picks.reasons":
        return pickReasons(opts);
      default:
        throw new Error(`journey model: no scripted answer for purpose "${opts.purpose}"`);
    }
  };
  return { fake, calls };
}
