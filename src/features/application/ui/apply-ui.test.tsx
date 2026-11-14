// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ApplicationTurn, UiLang } from "@/contracts";
import { I18nProvider } from "@/lib/i18n/client";
import type { OwnApplication } from "../engine";
import type { ApplyJob } from "../requirements";
import { LEVEL_ANCHORS_OWN, LEVEL_NAMES } from "../levels";
import { applyMessages } from "../messages-talent";
import { ApplicationGone, ApplyJobsList, jobAction } from "./ApplyJobsView";
import { ApplyStart, canStartApplication, startRequest } from "./ApplyStart";
import { ApplicationReview, ApplicationSent, reviewEntries, standingAnswers } from "./ApplicationReview";
import { ApplicationResult, levelText, ownPassages, ownSentences } from "./ApplicationResult";
import { JobInterviewRoom, JobRoomChromeProvider, JobRoomProgress, JobRoomStopButton, jobMascotState, notedSentences, questionNumber } from "./JobInterviewRoom";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock("next/link", () => ({
  default: (props: { href: string; children: React.ReactNode } & Record<string, unknown>) => {
    const { href, children, ...rest } = props;
    return createElement("a", { href, ...rest }, children);
  },
}));
vi.mock("@/features/voice/useVoice", () => ({
  useVoice: () => ({
    status: "unavailable",
    partial: "",
    finalTranscript: "",
    error: null,
    inputLevel: 0,
    adapterId: null,
    prepare: async () => {},
    speakSentences: async () => {},
    cancelSpeech: () => {},
    clearError: () => {},
    pressTalk: async () => {},
    releaseTalk: async () => "",
  }),
}));

const render = (node: React.ReactElement, lang: UiLang = "en") =>
  renderToStaticMarkup(createElement(I18nProvider as unknown as React.FC<{ lang: UiLang; children?: React.ReactNode }>, { lang }, node));

function turn(over: Partial<ApplicationTurn> & Pick<ApplicationTurn, "index" | "role">): ApplicationTurn {
  return {
    id: `turn-${over.index}`,
    applicationId: "app-1",
    kind: over.role === "participant" ? "answer" : "question",
    requirementId: null,
    text: "",
    sentences: [],
    inputMode: null,
    removedAt: null,
    at: "2026-11-14T10:00:00Z",
    ...over,
  };
}

const job = (over: Partial<ApplyJob> = {}): ApplyJob => ({
  jobId: "job-1",
  companyName: "Demo company 03",
  masked: true,
  title: "Warehouse worker",
  summary: "Pick and pack orders.",
  requirements: [
    { requirementId: "r1", text: "Forklift driving", kind: "must" },
    { requirementId: "r2", text: "Teamwork", kind: "nice" },
  ],
  application: null,
  ...over,
});

function application(over: Partial<OwnApplication> = {}): OwnApplication {
  return {
    id: "app-1",
    jobId: "job-1",
    companyName: "Demo company 03",
    masked: true,
    title: "Warehouse worker",
    status: "interviewing",
    plan: {
      needCardId: "nc-1",
      needCardVersion: 1,
      lang: "en",
      requirements: [
        { requirementId: "r1", text: "Forklift driving", kind: "must", category: "skill", postingSentence: 0, question: "Tell me about a time you drove a forklift.", wording: "model" },
        { requirementId: "r2", text: "Teamwork", kind: "nice", category: "skill", postingSentence: null, question: "Tell me about working in a team.", wording: "code" },
      ],
    },
    state: { cursor: 0, followUps: {}, progress: { r1: "asked", r2: "waiting" }, noted: { r1: [{ turnIndex: 1, sentenceFrom: 2, sentenceTo: 2 }] } },
    turns: [
      turn({ index: 0, role: "interviewer", kind: "opening", requirementId: "r1", text: "Hello. Tell me about a time you drove a forklift.", sentences: ["Hello.", "Tell me about a time you drove a forklift."] }),
      turn({ index: 1, role: "participant", requirementId: "r1", text: "I worked in a warehouse. I drove the forklift every day.", sentences: ["I worked in a warehouse.", "I drove the forklift every day."], inputMode: "text" }),
    ],
    assessment: null,
    points: null,
    position: null,
    createdAt: "2026-11-14T10:00:00Z",
    submittedAt: null,
    ...over,
  };
}

const assessed = (): OwnApplication =>
  application({
    status: "assessed",
    assessment: {
      rubricVersion: "2026-11-14",
      assessedAt: "2026-11-14T11:00:00Z",
      summary: { en: "One example was given.", fi: "Yksi esimerkki annettiin.", sv: "Ett exempel gavs." },
      ratings: [
        {
          requirementId: "r1",
          level: 2,
          evidence: [{ turnIndex: 1, sentenceFrom: 2, sentenceTo: 2 }],
          reason: { en: "The answer describes daily forklift work.", fi: "Vastaus kuvaa päivittäistä trukkityötä.", sv: "Svaret beskriver dagligt truckarbete." },
          wording: "model",
        },
        {
          requirementId: "r2",
          level: 0,
          evidence: [],
          reason: { en: "The question was not answered.", fi: "Kysymykseen ei vastattu.", sv: "Frågan besvarades inte." },
          wording: "code",
        },
      ],
    },
    points: { points: 4, maxPoints: 9 },
    position: { position: 2, of: 5, approvedAt: "2026-11-14T12:00:00Z", levelWith: null },
    submittedAt: "2026-11-14T10:30:00Z",
  });

describe("the list of jobs", () => {
  it("chooses one action by the state of the person's own application", () => {
    expect(jobAction(job())).toMatchObject({ kind: "start", href: "/apply/new?job=job-1", testId: "apply-start" });
    expect(jobAction(job({ application: { id: "a1", status: "interviewing" } }))).toMatchObject({ href: "/apply/a1", label: "actionContinue", testId: "apply-continue" });
    expect(jobAction(job({ application: { id: "a1", status: "review" } }))).toMatchObject({ label: "actionReview", testId: "apply-continue" });
    for (const status of ["submitted", "assessed"] as const) {
      expect(jobAction(job({ application: { id: "a1", status } }))).toMatchObject({ label: "actionOpen", testId: "apply-open" });
    }
  });

  it("shows company, title, summary, requirements with must-haves marked, and the masked banner", () => {
    const html = render(createElement(ApplyJobsList, { jobs: [job(), job({ jobId: "job-2", masked: false, application: { id: "a2", status: "assessed" } })] }));
    expect(html).toContain('data-testid="apply-job"');
    expect(html).toContain('data-job-id="job-1"');
    expect(html).toContain("Demo company 03");
    expect(html).toContain("Warehouse worker");
    expect(html).toContain("Pick and pack orders.");
    expect(html).toContain(applyMessages.en.adAsks);
    expect(html).toContain(applyMessages.en.tagMust);
    expect(html).toContain(applyMessages.en.tagNice);
    expect(html.match(/data-testid="masked-banner"/g)).toHaveLength(1);
    expect(html).toContain('data-testid="apply-start"');
    expect(html).toContain('data-testid="apply-open"');
  });

  it("the gone page is neutral and leads back to the jobs", () => {
    const html = render(createElement(ApplicationGone));
    expect(html).toContain('data-testid="apply-gone"');
    expect(html).toContain('href="/apply"');
  });
});

describe("the start screen", () => {
  const startJob = { jobId: "job-1", title: "Warehouse worker", companyName: "Demo company 03", masked: true, requirements: job().requirements };

  it("nothing starts without the tick", () => {
    expect(canStartApplication({ ticked: false, busy: false })).toBe(false);
    expect(canStartApplication({ ticked: true, busy: true })).toBe(false);
    expect(canStartApplication({ ticked: true, busy: false })).toBe(true);
    const html = render(createElement(ApplyStart, { job: startJob }));
    expect(html).toMatch(/<button[^>]*data-testid="apply-begin"[^>]*disabled|<button[^>]*disabled[^>]*data-testid="apply-begin"/);
    // the tick is never ticked for the person
    expect(html).toMatch(/<input[^>]*data-testid="apply-consent"/);
    expect(html).not.toMatch(/<input[^>]*checked[^>]*data-testid="apply-consent"|<input[^>]*data-testid="apply-consent"[^>]*checked/);
  });

  it("the request can only carry the consent", () => {
    expect(startRequest("job-1", "fi")).toEqual({ jobId: "job-1", uiLang: "fi", consent: { assessment: true } });
  });

  it.each(["en", "fi", "sv"] as const)("%s: carries the five points, the tick, the language select and the button", (lang) => {
    const m = applyMessages[lang];
    const html = render(createElement(ApplyStart, { job: startJob }), lang);
    for (const text of [m.startPoint1, m.startPoint2, m.startPoint3, m.startPoint4, m.startPoint5, m.startTick, m.startButton]) {
      expect(html).toContain(text.replace(/'/g, "&#x27;"));
    }
    expect(html).toContain(m.startTitle.replace("{title}", "Warehouse worker"));
    for (const id of ["apply-consent", "apply-language", "apply-begin"]) expect(html).toContain(`data-testid="${id}"`);
  });
});

describe("the room", () => {
  it("numbers the question and never goes above the total", () => {
    expect(questionNumber(0, 5)).toBe(1);
    expect(questionNumber(2, 5)).toBe(3);
    expect(questionNumber(5, 5)).toBe(5);
    expect(questionNumber(0, 0)).toBe(1);
  });

  it("turns noted references into the 0-based sentence positions of the marks", () => {
    const marks = notedSentences({ r1: [{ turnIndex: 1, sentenceFrom: 2, sentenceTo: 3 }], r2: [{ turnIndex: 1, sentenceFrom: 1, sentenceTo: 1 }, { turnIndex: 3, sentenceFrom: 1, sentenceTo: 1 }] });
    expect(marks.get(1)).toEqual([0, 1, 2]);
    expect(marks.get(3)).toEqual([0]);
  });

  it("shows what the AI is doing, never a feeling", () => {
    expect(jobMascotState({ ended: true, listening: true, speaking: false, waiting: false })).toBe("idle");
    expect(jobMascotState({ ended: false, listening: true, speaking: false, waiting: false })).toBe("listening");
    expect(jobMascotState({ ended: false, listening: false, speaking: true, waiting: false })).toBe("speaking");
    expect(jobMascotState({ ended: false, listening: false, speaking: false, waiting: true })).toBe("thinking");
  });

  const app = application();
  const room = (a = app) =>
    render(
      <JobRoomChromeProvider total={2} initialCurrent={1} initialFinished={false}>
        <JobRoomProgress />
        <JobRoomStopButton />
        <JobInterviewRoom initial={{ id: a.id, plan: a.plan, state: a.state, turns: a.turns, status: a.status }} voiceConsented={false} />
      </JobRoomChromeProvider>,
    );

  it("carries the room's test ids, the requirements with their progress, and the noted words marked", () => {
    const html = room();
    for (const id of ["interviewer-text", "answer-input", "send-answer", "apply-skip", "apply-stop", "interview-progress"]) expect(html).toContain(`data-testid="${id}"`);
    expect(html).not.toContain('data-testid="talk-button"'); // voice is off without consent
    expect(html).toContain('data-requirement-id="r1"');
    expect(html).toContain('data-progress="asked"');
    expect(html).toContain('data-progress="waiting"');
    expect(html).toContain(applyMessages.en.roomAdTitle);
    expect(html).toContain(applyMessages.en.roomProgress.replace("{n}", "1").replace("{total}", "2"));
    // the second sentence of answer 1 was noted
    expect(html).toMatch(/own-words-mark[^>]*>I drove the forklift every day\./);
  });

  it("has no level, no points and no hint of a rating anywhere in the room", () => {
    const html = room();
    for (const names of Object.values(LEVEL_NAMES)) for (const name of names) expect(html).not.toContain(`>${name}<`);
    expect(html).not.toContain("apply-rating");
    expect(html).not.toContain("apply-points");
    const visible = html.replace(/<[^>]*>/g, " ");
    expect(visible).not.toMatch(/\bpoints?\b|\brat(?:ing|ed|es)\b|\blevels?\b|\bscore/i);
  });

  it("shows the way on to the review when the interview is over", () => {
    const html = room(application({ status: "review" }));
    expect(html).toContain('data-testid="apply-to-review"');
    expect(html).not.toContain('data-testid="apply-skip"');
  });
});

describe("review and sent", () => {
  it("finds the answers that still stand", () => {
    const a = application();
    const removed = { ...a.turns[1]!, text: "", sentences: [], removedAt: "2026-11-14T10:05:00Z" };
    expect(standingAnswers(a.turns)).toHaveLength(1);
    expect(standingAnswers([a.turns[0]!, removed])).toHaveLength(0);
  });

  it("gives the planned question, then follow-ups and answers of one requirement, from stored text", () => {
    const a = application();
    const more = [...a.turns, turn({ index: 2, role: "interviewer", kind: "follow_up", requirementId: "r1", text: "What did you do then?" })];
    const entries = reviewEntries({ plan: a.plan, turns: more }, "r1");
    expect(entries.map((e) => (e.kind === "question" ? e.text : `answer:${e.turn.index}`))).toEqual([
      "Tell me about a time you drove a forklift.",
      "answer:1",
      "What did you do then?",
    ]);
    expect(reviewEntries({ plan: a.plan, turns: a.turns }, "r2")).toEqual([{ kind: "question", text: "Tell me about working in a team." }]);
  });

  it("review lists the answers with a remove control and a send button, and shows no level", () => {
    const html = render(createElement(ApplicationReview, { application: application({ status: "review" }) }));
    for (const id of ["apply-review", "apply-answer", "apply-remove-answer", "apply-send"]) expect(html).toContain(`data-testid="${id}"`);
    expect(html).toContain("I drove the forklift every day.");
    expect(html).not.toContain("apply-rating");
    expect(html).not.toMatch(/<button[^>]*data-testid="apply-send"[^>]*disabled/);
  });

  it("sending needs one answer", () => {
    const a = application({ status: "review" });
    const none = { ...a, turns: [a.turns[0]!] };
    const html = render(createElement(ApplicationReview, { application: none }));
    expect(html).toMatch(/<button[^>]*data-testid="apply-send"[^>]*disabled|<button[^>]*disabled[^>]*data-testid="apply-send"/);
    expect(html).toContain(applyMessages.en.reviewNeedAnswer);
  });

  it("the sent page says it is on its way", () => {
    const html = render(createElement(ApplicationSent, { application: application({ status: "submitted" }) }));
    expect(html).toContain('data-testid="apply-sent"');
    expect(html).toContain(applyMessages.en.sentBody);
    expect(html).toContain('data-testid="apply-withdraw"');
  });
});

describe("the result", () => {
  it("renders the evidence from the stored turns by reference, never from model text", () => {
    const a = assessed();
    expect(ownSentences(a.turns, [{ turnIndex: 1, sentenceFrom: 2, sentenceTo: 2 }])).toEqual([{ turnIndex: 1, sentence: 1, text: "I drove the forklift every day." }]);
    // a reference that does not resolve, points at an interviewer turn, or at a removed answer is dropped
    expect(ownSentences(a.turns, [{ turnIndex: 1, sentenceFrom: 5, sentenceTo: 5 }])).toEqual([]);
    expect(ownSentences(a.turns, [{ turnIndex: 0, sentenceFrom: 1, sentenceTo: 1 }])).toEqual([]);
    expect(ownSentences(a.turns, [{ turnIndex: 9, sentenceFrom: 1, sentenceTo: 1 }])).toEqual([]);
    const removed = [a.turns[0]!, { ...a.turns[1]!, text: "", sentences: [], removedAt: "2026-11-14T10:05:00Z" }];
    expect(ownSentences(removed, [{ turnIndex: 1, sentenceFrom: 1, sentenceTo: 1 }])).toEqual([]);
  });

  it.each(["en", "fi", "sv"] as const)("%s: shows each level's name and anchor, the reason marked as AI, the points and the position", (lang) => {
    const html = render(createElement(ApplicationResult, { application: assessed() }), lang);
    const m = applyMessages[lang];
    expect(html).toContain('data-testid="apply-result"');
    expect(html).toMatch(/data-testid="apply-rating"[^>]*data-requirement-id="r1"[^>]*data-level="2"|data-testid="apply-rating"[^>]*data-level="2"/);
    expect(html).toContain(LEVEL_NAMES[lang][2]);
    // Said to the person, not about them.
    expect(html).toContain(LEVEL_ANCHORS_OWN[lang][2].replace(/'/g, "&#x27;"));
    expect(html).toContain(LEVEL_NAMES[lang][0]);
    expect(html).toContain(m.resultWrittenByAi);
    expect(html).toContain("we-ai-mini");
    expect(html).toContain(m.resultPoints.replace("{n}", "4").replace("{m}", "9"));
    expect(html).toContain(m.resultOrganiser);
    expect(html).toContain(m.resultPosition.replace("{n}", "2").replace("{m}", "5"));
    expect(html).toContain('data-testid="apply-withdraw"');
    // the person's own sentence, marked as their own words
    expect(html).toContain("I drove the forklift every day.");
    expect(html).toContain('data-testid="own-words-mark"');
  });

  it("the reason follows the page's language", () => {
    expect(render(createElement(ApplicationResult, { application: assessed() }), "fi")).toContain("Vastaus kuvaa päivittäistä trukkityötä.");
    expect(render(createElement(ApplicationResult, { application: assessed() }), "sv")).toContain("Svaret beskriver dagligt truckarbete.");
  });

  it.each([
    ["above", "resultLevelAbove"],
    ["below", "resultLevelBelow"],
    ["both", "resultLevelBoth"],
  ] as const)("says when the person's place is level with the neighbour %s", (levelWith, key) => {
    const application = { ...assessed(), position: { position: 2, of: 5, approvedAt: "2026-11-14T12:00:00Z", levelWith } };
    const html = render(createElement(ApplicationResult, { application }));
    expect(html).toContain('data-testid="apply-level-with"');
    expect(html).toContain(applyMessages.en[key]);
    expect(render(createElement(ApplicationResult, { application: assessed() }))).not.toContain("apply-level-with");
  });

  it("leaves out the position until a list has been approved", () => {
    const html = render(createElement(ApplicationResult, { application: { ...assessed(), position: null } }));
    expect(html).not.toContain('data-testid="apply-position"');
    expect(html).toContain('data-testid="apply-points"');
  });

  it("puts the pieces of one answer together again and keeps different answers apart", () => {
    const piece = (turnIndex: number, sentence: number) => ({ turnIndex, sentence, text: `t${turnIndex}s${sentence}` });
    expect(ownPassages([piece(1, 0), piece(1, 1), piece(3, 0), piece(1, 2)]).map((p) => p.map((s) => s.text))).toEqual([["t1s0", "t1s1"], ["t3s0"], ["t1s2"]]);
    expect(ownPassages([])).toEqual([]);
  });

  it("says once, above the list, that the companies are demo companies when all of them are", () => {
    const all = render(createElement(ApplyJobsList, { jobs: [job(), job({ jobId: "job-2" })] }));
    expect(all.match(/data-testid="masked-banner"/g)).toHaveLength(1);
    expect(all).toContain(applyMessages.en.maskedTextAll.replace(/'/g, "&#x27;"));
    const one = render(createElement(ApplyJobsList, { jobs: [job()] }));
    expect(one).toContain(applyMessages.en.maskedText.replace(/'/g, "&#x27;"));
  });

  it("names a level only by the written scale", () => {
    expect(levelText(3, "en")).toEqual({ name: LEVEL_NAMES.en[3], anchor: LEVEL_ANCHORS_OWN.en[3] });
    expect(LEVEL_ANCHORS_OWN.en.join(" ")).not.toMatch(/the person|their own/);
    expect(levelText(7 as never, "en").name).toBe(LEVEL_NAMES.en[3]);
  });
});
