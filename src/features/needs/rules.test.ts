import { describe, expect, it } from "vitest";
import type { Requirement } from "@/contracts";
import {
  classifyStatutory,
  companyTextProblem,
  decideQuestion,
  hasForbiddenWord,
  isWorkPermitText,
  languageQuestionText,
  protectedHits,
  yearsAsked,
  type QuestionInput,
} from "./rules";
import { visibleQuestionIds } from "./view";

const privateJob = { source: "tmt", sector: "private", employerName: "Testiyhtiö Oy" } as const;
const publicJob = { source: "tmt", sector: "public", employerName: "Espoon kaupunki" } as const;

function stat(over: Partial<Parameters<typeof classifyStatutory>[0]>) {
  return classifyStatutory({
    category: "skill",
    text: "Python",
    sentence: null,
    modelLaw: false,
    job: privateJob,
    ...over,
  });
}

describe("statutory class", () => {
  it("recognises public-sector language rules (N4), and leaves private-sector language alone (N3)", () => {
    const sentence = "Edellytämme erinomaista suomen kielen taitoa.";
    expect(stat({ category: "language", text: "Excellent Finnish", sentence, job: publicJob })).toBe("language_act");
    expect(stat({ category: "language", text: "Excellent Finnish", sentence, job: { ...privateJob, source: "kuntarekry" } })).toBe(
      "language_act",
    );
    expect(stat({ category: "language", text: "Excellent Finnish", sentence, job: privateJob })).toBe("none");
    expect(
      stat({ category: "language", text: "Satisfactory Swedish", sentence: "Tehtävässä edellytetään ruotsia (laki 424/2003).", job: privateJob }),
    ).toBe("language_act");
    expect(stat({ category: "language", text: "Finnish", sentence: "Kielitaitovaatimus: suomi", job: privateJob })).toBe("language_act");
    // The language act only concerns languages.
    expect(stat({ category: "skill", text: "Python", sentence: "Python", job: publicJob })).toBe("none");
  });

  it("recognises clearance, licence and work permit from the sentence (N5)", () => {
    const s = (sentence: string, category: Requirement["category"] = "authorisation") =>
      stat({ category, text: "Something", sentence });
    expect(s("Valmius turvallisuusselvitykseen")).toBe("clearance");
    expect(s("A criminal record check is required")).toBe("clearance");
    expect(s("Kelpoisuusvaatimus: laillistettu sairaanhoitaja")).toBe("licence");
    expect(s("B-ajokortti")).toBe("licence");
    expect(s("Hygieniapassi vaaditaan")).toBe("licence");
    expect(s("Voimassa oleva työlupa")).toBe("other_law");
    expect(s("Right to work in Finland")).toBe("other_law");
    expect(s("Valid driving licence", "authorisation")).toBe("licence");
  });

  it("checks the sentence only for authorisation, language and education, but always the text", () => {
    expect(stat({ category: "skill", text: "Forklift operation", sentence: "Ajokortti ja trukinkäyttötaito" })).toBe("none");
    expect(stat({ category: "skill", text: "Valid driving licence", sentence: null })).toBe("licence");
    expect(stat({ category: "education", text: "Degree", sentence: "Kelpoisuusvaatimus: korkeakoulututkinto" })).toBe("licence");
  });

  it("turns a model cue with no keyword hit into other_law, and never invents statutory without a cue", () => {
    expect(stat({ category: "authorisation", text: "Vaccination cover", sentence: "Rokotussuoja", modelLaw: true })).toBe("other_law");
    expect(stat({ category: "authorisation", text: "Vaccination cover", sentence: "Rokotussuoja", modelLaw: false })).toBe("none");
  });

  it("knows a work-permit text", () => {
    expect(isWorkPermitText("Right to work in Finland")).toBe(true);
    expect(isWorkPermitText("Python")).toBe(false);
  });
});

describe("protected attributes", () => {
  it("flags personal characteristics but not language names", () => {
    expect(protectedHits("Aged 25-35")).not.toEqual([]);
    expect(protectedHits("30 years old")).not.toEqual([]);
    expect(protectedHits("Native Finnish speaker")).not.toEqual([]);
    expect(protectedHits("Fluent Swedish")).toEqual([]);
    expect(protectedHits("English-speaking team")).toEqual([]);
    expect(protectedHits("Python programming")).toEqual([]);
  });

  it("lints company-written text with the hint for 'native'", () => {
    expect(companyTextProblem("native Finnish speaker")).toEqual({ hint: "Try 'fluent working Finnish'." });
    expect(companyTextProblem("Young and energetic")).toEqual({ hint: null });
    expect(companyTextProblem("terveys")).toEqual({ hint: null });
    expect(companyTextProblem("Fluent working Finnish")).toBeNull();
    expect(companyTextProblem("Python programming")).toBeNull();
  });
});

function q(over: Partial<Omit<QuestionInput, "model">> & { model?: Partial<QuestionInput["model"]> }): ReturnType<typeof decideQuestion> {
  const { model, ...rest } = over;
  return decideQuestion({
    category: "skill",
    kind: "must",
    statutory: "none",
    text: "Python",
    sentence: "Python",
    languageCode: null,
    jobLang: "en",
    ...rest,
    model: { years: null, questionType: "none", question: null, why: null, ...model },
  });
}

describe("questions", () => {
  it("language: written by code from the pattern, for a must-have, non-statutory, non-English language", () => {
    const question = q({ category: "language", languageCode: "fi", text: "Fluent Finnish", model: { questionType: "language", question: "whatever the model wrote" } });
    expect(question?.text).toBe(
      "Is Finnish needed from day one, or could someone start in English and build up Finnish on the job?",
    );
    expect(question?.type).toBe("language");
    expect(question?.answer).toBeNull();
    expect(languageQuestionText("sv")).toContain("Swedish");
    // dropped: nice, statutory, English requirement, no code
    expect(q({ category: "language", kind: "nice", languageCode: "fi", model: { questionType: "language" } })).toBeNull();
    expect(q({ category: "language", statutory: "language_act", languageCode: "fi", model: { questionType: "language" } })).toBeNull();
    expect(q({ category: "language", languageCode: "en", jobLang: "en", model: { questionType: "language" } })).toBeNull();
    expect(q({ category: "language", languageCode: null, model: { questionType: "language" } })).toBeNull();
    expect(q({ category: "skill", languageCode: "fi", model: { questionType: "language" } })).toBeNull();
  });

  it("years: needs a must-have experience of at least 3 years; the model's wording is kept only if it fits the pattern", () => {
    const good = "Would someone who has done Java development, with fewer than 5 years, be worth a conversation?";
    expect(
      q({ category: "experience", text: "5 years of Java development", model: { questionType: "years", years: 5, question: good } })?.text,
    ).toBe(good);
    // wording off pattern: rebuilt from the requirement
    expect(
      q({ category: "experience", text: "5 years of Java development", model: { questionType: "years", years: 5, question: "Do you really need 5 years?" } })?.text,
    ).toBe(good);
    // year count from the text when the model gave none
    expect(q({ category: "experience", text: "4 years of data engineering", model: { questionType: "years" } })?.text).toContain("fewer than 4 years");
    expect(q({ category: "experience", text: "2 years of data engineering", model: { questionType: "years", years: 2 } })).toBeNull();
    expect(q({ category: "experience", kind: "nice", text: "5 years of Java", model: { questionType: "years", years: 5 } })).toBeNull();
    expect(q({ category: "skill", text: "5 years of Java", model: { questionType: "years", years: 5 } })).toBeNull();
    expect(yearsAsked(null, "Java", "Vähintään 6 vuoden kokemus")).toBe(6);
  });

  it("degree and tool: only the exact pattern, only for must-haves of the right category", () => {
    const degree = "Would hands-on experience in software development work instead of the degree?";
    expect(q({ category: "education", text: "Degree", model: { questionType: "degree", question: degree } })?.text).toBe(degree);
    expect(q({ category: "education", text: "Degree", model: { questionType: "degree", question: "Is a degree needed?" } })).toBeNull();
    expect(q({ category: "education", kind: "nice", text: "Degree", model: { questionType: "degree", question: degree } })).toBeNull();
    expect(q({ category: "education", statutory: "licence", text: "Degree", model: { questionType: "degree", question: degree } })).toBeNull();
    const tool = "Would experience with a comparable tool be enough, if the person learns Jira on the job?";
    expect(q({ category: "skill", text: "Jira", model: { questionType: "tool", question: tool } })?.text).toBe(tool);
    expect(q({ category: "skill", text: "Jira", model: { questionType: "tool", question: "Is Jira needed?" } })).toBeNull();
    expect(q({ category: "other", text: "Jira", model: { questionType: "tool", question: tool } })).toBeNull();
  });

  it("vague: any kind, category other, with the pattern", () => {
    const text = "Excellent communication skills";
    const question = q({ category: "other", kind: "nice", text, model: { questionType: "vague" } });
    expect(question?.text).toBe(
      "What does 'Excellent communication skills' look like in this job? One concrete example helps us find people who have done it.",
    );
    expect(q({ category: "skill", text, model: { questionType: "vague" } })).toBeNull();
  });

  it("never asks about a statutory requirement, whatever the model proposed", () => {
    for (const statutory of ["language_act", "licence", "clearance", "other_law"] as const) {
      expect(
        q({
          category: "experience",
          statutory,
          text: "5 years of Java",
          model: { questionType: "years", years: 5, question: "Would someone who has done Java, with fewer than 5 years, be worth a conversation?" },
        }),
      ).toBeNull();
    }
  });

  it("drops a question containing a forbidden word, and replaces an unusable why", () => {
    expect(hasForbiddenWord("Is this requirement unnecessary?")).toBe(true);
    expect(hasForbiddenWord("This is too much")).toBe(true);
    expect(hasForbiddenWord("Would experience with a comparable tool be enough")).toBe(false); // "tool" is not "too"
    expect(q({ category: "other", text: "Too many hats", model: { questionType: "vague" } })).toBeNull();
    expect(q({ category: "other", text: "Team player", model: { questionType: "vague", question: "Is this requirement unnecessary?" } })?.text).toContain(
      "What does 'Team player' look like",
    );
    const noisy = q({ category: "other", text: "Team player", model: { questionType: "vague", why: "The posting says it 3 times." } });
    expect(noisy?.why).toBe("The posting does not say what this means in practice.");
    const bad = q({ category: "other", text: "Team player", model: { questionType: "vague", why: "This ask is wrong and outdated." } });
    expect(bad?.why).toBe("The posting does not say what this means in practice.");
    const ok = q({ category: "other", text: "Team player", model: { questionType: "vague", why: "The posting is vague about it." } });
    expect(ok?.why).toBe("The posting is vague about it.");
  });

  it("returns nothing when the model proposed no question", () => {
    expect(q({ category: "other", text: "Team player", model: { questionType: "none" } })).toBeNull();
  });
});

describe("which questions are shown", () => {
  function req(id: string, exclude: number | null, over: Partial<Requirement> = {}): Requirement {
    return {
      id,
      text: id,
      kind: "must",
      category: "other",
      escoSkillUris: [],
      postingSentence: 0,
      source: "agent",
      languageCode: null,
      statutory: "none",
      question: { type: "vague", text: "What does 'x' look like in this job? One concrete example helps us find people who have done it.", why: "w", answer: null },
      pool: { scope: "relevant", relevant: 10, speakTo: 10 - (exclude ?? 0), hardFilterWouldExclude: exclude, selfDeclaredOnly: null, computedAt: "2026-11-14T06:00:00Z" },
      ...over,
    };
  }

  it("shows exactly the three with the largest exclusion count (N14)", () => {
    const shown = visibleQuestionIds({ requirements: [req("a", 1), req("b", 5), req("c", 3), req("d", 4), req("e", 2)] });
    expect([...shown].sort()).toEqual(["b", "c", "d"]);
  });

  it("hides when nothing would be excluded, the pool is small, the count is whole-pool or the pool is not computed", () => {
    expect(visibleQuestionIds({ requirements: [req("a", 0)] }).size).toBe(0);
    expect(
      visibleQuestionIds({
        requirements: [req("a", 2, { pool: { scope: "relevant", relevant: 2, speakTo: 0, hardFilterWouldExclude: 2, selfDeclaredOnly: null, computedAt: "x" } })],
      }).size,
    ).toBe(0);
    expect(
      visibleQuestionIds({
        requirements: [req("a", null, { pool: { scope: "whole_pool", relevant: 20, speakTo: 3, hardFilterWouldExclude: null, selfDeclaredOnly: null, computedAt: "x" } })],
      }).size,
    ).toBe(0);
    expect(visibleQuestionIds({ requirements: [req("a", 3, { pool: null })] }).size).toBe(0);
  });

  it("keeps an answered question visible and does not count it against the three", () => {
    const answered = req("z", 0, {
      question: { type: "vague", text: "t", why: "w", answer: { choice: "keep", at: "2026-11-14T06:00:00Z" } },
    });
    const shown = visibleQuestionIds({ requirements: [answered, req("a", 1), req("b", 2), req("c", 3)] });
    expect([...shown].sort()).toEqual(["a", "b", "c", "z"]);
  });
});

describe("lint for Need Card text (needcard-F4, F9)", () => {
  it("lets language names, places and health-sector phrases through", () => {
    for (const text of [
      "Fluent Swedish",
      "Experience of the Norwegian market",
      "Work at a health centre",
      "Health care experience",
      "Experience in health services",
      "Work in Norway",
      "Chinese market sales",
      "Health and safety",
    ]) {
      expect(protectedHits(text), text).toEqual([]);
      expect(companyTextProblem(text), text).toBeNull();
    }
  });

  it("still catches origin and ethnicity asks", () => {
    for (const text of [
      "Applicants of Asian origin preferred",
      "Indian background",
      "Arab applicants preferred",
      "African applicants only",
      "Somali applicants preferred",
      "Latin American heritage",
    ]) {
      expect(protectedHits(text), text).not.toEqual([]);
      expect(companyTextProblem(text), text).not.toBeNull();
    }
  });

  it("still catches asks about the person", () => {
    for (const text of ["Native speaker of Finnish", "Mother tongue Finnish", "Good health required", "Aged 25-35", "Nationality: Finnish", "terveys"]) {
      expect(companyTextProblem(text), text).not.toBeNull();
    }
    expect(protectedHits("Native-level Finnish")).not.toEqual([]);
    expect(protectedHits("Mother tongue Swedish")).not.toEqual([]);
  });
});

describe("statutory: the keyword rules count as well as the model (needcard-F6)", () => {
  it("is statutory when only the keywords say so, and when only the model says so", () => {
    expect(stat({ category: "authorisation", text: "Hygiene passport", sentence: "Hygieniapassi vaaditaan", modelLaw: false })).toBe("licence");
    expect(stat({ category: "language", text: "Finnish", sentence: "Kielitaitovaatimus: suomi", modelLaw: false })).toBe("language_act");
    expect(stat({ category: "language", text: "Finnish", sentence: "Suomen kieli", modelLaw: false, job: { ...privateJob, source: "kuntarekry" } })).toBe("language_act");
    expect(stat({ category: "skill", text: "Something regulated", sentence: "x", modelLaw: true })).toBe("other_law");
    expect(stat({ category: "skill", text: "Python", sentence: "x", modelLaw: false })).toBe("none");
  });

  it("a statutory requirement carries no question, whatever the model returned", () => {
    const years = "Would someone who has done nursing, with fewer than 5 years, be worth a conversation?";
    const cases: Array<[QuestionInput["category"], string, string, string | null]> = [
      ["language", "language", "Is Finnish needed from day one, or could someone start in English and build up Finnish on the job?", "fi"],
      ["experience", "years", years, null],
      ["education", "degree", "Would hands-on experience in nursing work instead of the degree?", null],
      ["skill", "tool", "Would experience with a comparable tool be enough, if the person learns Jira on the job?", null],
      ["other", "vague", "What does 'x' look like in this job? One concrete example helps us find people who have done it.", null],
    ];
    for (const statutory of ["language_act", "licence", "clearance", "other_law"] as const) {
      for (const [category, type, question, languageCode] of cases) {
        expect(
          decideQuestion({
            category,
            kind: "must",
            statutory,
            text: "5 years of nursing",
            sentence: "x",
            languageCode,
            jobLang: "fi",
            model: { years: 5, questionType: type as never, question, why: "Because." },
          }),
          `${statutory} ${type}`,
        ).toBeNull();
      }
    }
  });
});

describe("trigger rules apply to every question type (needcard-F8)", () => {
  const vagueQ = "What does 'x' look like in this job? One concrete example helps us find people who have done it.";
  it("a vague question on anything but category other is dropped, a nice vague one on other stays", () => {
    for (const category of ["skill", "language", "education", "experience", "authorisation"] as const) {
      expect(
        decideQuestion({
          category,
          kind: "must",
          statutory: "none",
          text: "Something",
          sentence: "x",
          languageCode: category === "language" ? "fi" : null,
          jobLang: "fi",
          model: { years: null, questionType: "vague", question: vagueQ, why: null },
        }),
        category,
      ).toBeNull();
    }
    const kept = decideQuestion({
      category: "other", kind: "nice", statutory: "none", text: "x", sentence: "x", languageCode: null, jobLang: "en",
      model: { years: null, questionType: "vague", question: vagueQ, why: null },
    });
    expect(kept?.type).toBe("vague");
  });

  it("language, years, degree and tool never fire on a nice requirement", () => {
    const base = { statutory: "none" as const, text: "5 years of Java", sentence: "x", languageCode: "fi", jobLang: "fi" };
    const mk = (category: QuestionInput["category"], type: string, question: string) =>
      decideQuestion({ ...base, category, kind: "nice", model: { years: 5, questionType: type as never, question, why: null } });
    expect(mk("language", "language", "x")).toBeNull();
    expect(mk("experience", "years", "x")).toBeNull();
    expect(mk("education", "degree", "Would hands-on experience in Java work instead of the degree?")).toBeNull();
    expect(mk("skill", "tool", "Would experience with a comparable tool be enough, if the person learns Java on the job?")).toBeNull();
  });
});
