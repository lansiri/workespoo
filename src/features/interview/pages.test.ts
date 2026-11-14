// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n/client";
import type { UiLang } from "@/contracts";
import { ConsentForm, canStartInterview, voiceConsentRequest, voiceConsentText, voiceServiceName } from "./ConsentForm";
import { interviewMessages } from "./messages";
import { consentCopy } from "@/lib/i18n/content";
import { fmt } from "@/lib/i18n";
import { InterviewRoom, citedSentences, mascotStateOf } from "./InterviewRoom";
import { RoomChromeProvider, RoomProgress, RoomStopButton, progressDashes } from "./RoomChrome";
import { SessionEnded } from "./SessionEnded";
import { initialUiState, reduce } from "./useInterview";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock("next/link", () => ({
  default: (props: { href: string; children: React.ReactNode } & Record<string, unknown>) => {
    const { href, children, ...rest } = props;
    return createElement("a", { href, ...rest }, children);
  },
}));

const render = (node: React.ReactElement, lang: UiLang = "en") =>
  renderToStaticMarkup(createElement(I18nProvider as unknown as React.FC<{ lang: UiLang; children?: React.ReactNode }>, { lang }, node));

describe("interview pages (server render)", () => {
  it("consent page has the golden-path test ids and no name field", () => {
    const html = render(createElement(ConsentForm));
    for (const id of ["consent-interview", "mode-express", "mode-full", "start-interview"]) {
      expect(html).toContain(`data-testid="${id}"`);
    }
    expect(html).not.toMatch(/type="text"|name="name"|type="email"/);
    expect(html).toContain("Before we start");
  });

  it("7. start stays disabled until both consent boxes are ticked; the live-demo box has its test id", () => {
    const html = render(createElement(ConsentForm));
    expect(html).toContain('data-testid="consent-live-demo"');
    expect(html).toMatch(/<button[^>]*data-testid="start-interview"[^>]*disabled|<button[^>]*disabled[^>]*data-testid="start-interview"/);
    expect(canStartInterview({ interview: true, liveDemo: false, busy: false })).toBe(false);
    expect(canStartInterview({ interview: false, liveDemo: true, busy: false })).toBe(false);
    expect(canStartInterview({ interview: true, liveDemo: true, busy: true })).toBe(false);
    expect(canStartInterview({ interview: true, liveDemo: true, busy: false })).toBe(true);
  });

  it("9. the model line says what runs, in all three languages", () => {
    expect(render(createElement(ConsentForm), "en")).toContain("an open-weight AI model (Kimi K3.1) run by Verda on servers in Finland");
    expect(render(createElement(ConsentForm), "fi")).toContain("Kimi K3.1");
    expect(render(createElement(ConsentForm), "sv")).toContain("Kimi K3.1");
    for (const lang of ["en", "fi", "sv"] as const) {
      const html = render(createElement(ConsentForm), lang);
      expect(html).not.toMatch(/NVIDIA|DeepSeek/);
    }
  });

  it("9. the voice line names the service in the page's language, with no English fragment", () => {
    const browser = { adapter: "browser", processor: "your browser's speech service" } as const;
    for (const lang of ["fi", "sv"] as const) {
      const name = voiceServiceName(browser, interviewMessages[lang].voiceProcessorBrowser);
      expect(name).not.toMatch(/your browser|speech service/i);
      expect(fmt(consentCopy[lang].checkVoice, { processor: name })).not.toMatch(/your browser|speech service/i);
    }
    expect(voiceServiceName(browser, interviewMessages.en.voiceProcessorBrowser)).toBe("your browser's speech service");
    expect(voiceServiceName({ adapter: "elevenlabs", processor: "ElevenLabs" }, "x")).toBe("ElevenLabs");
    expect(voiceServiceName(null, "x")).toBe("");
  });

  it("9. the voice consent uses the own-server text for the server adapter and the old one otherwise", () => {
    for (const lang of ["en", "fi", "sv"] as const) {
      const copy = consentCopy[lang];
      const browserName = interviewMessages[lang].voiceProcessorBrowser;
      expect(voiceConsentText({ adapter: "server", processor: "WorkEspoo's own server" }, copy, browserName)).toBe(copy.checkVoiceServer);
      expect(voiceConsentText({ adapter: "browser", processor: "x" }, copy, browserName)).toBe(
        fmt(copy.checkVoice, { processor: browserName }),
      );
      expect(voiceConsentText({ adapter: "elevenlabs", processor: "ElevenLabs" }, copy, browserName)).toContain("ElevenLabs");
      expect(voiceConsentText(null, copy, browserName)).toBe(fmt(copy.checkVoice, { processor: "" }));
    }
  });

  it("10. the start request says which voice wording was agreed to", () => {
    const server = { adapter: "server", processor: "WorkEspoo's own server" } as const;
    expect(voiceConsentRequest(server, true)).toEqual({ voiceVendor: true, voiceOwnServer: true });
    expect(voiceConsentRequest({ adapter: "browser", processor: "x" }, true)).toEqual({ voiceVendor: true });
    expect(voiceConsentRequest({ adapter: "elevenlabs", processor: "ElevenLabs" }, true)).toEqual({ voiceVendor: true });
    // Not ticked, voice off, or the configuration not loaded: no voice consent at all.
    expect(voiceConsentRequest(server, false)).toEqual({ voiceVendor: false });
    expect(voiceConsentRequest({ adapter: "none", processor: "none" }, true)).toEqual({ voiceVendor: false });
    expect(voiceConsentRequest(null, true)).toEqual({ voiceVendor: false });
  });

  it("11. the start page has the CV text area with its note, in three languages", () => {
    const en = render(createElement(ConsentForm), "en");
    expect(en).toContain('data-testid="cv-text"');
    expect(en).toContain("Paste your CV or upload a PDF, if you like.");
    expect(en).toContain("removes your name, contact details, dates and personal details by fixed rules, not by AI");
    expect(en).toContain("It is only used to choose questions and is not kept.");
    // The PDF upload is there, and waits for the interview consent before it can be used.
    expect(en).toContain('data-testid="cv-upload"');
    expect(en).toMatch(/data-testid="cv-upload-button"[^>]*disabled|disabled[^>]*data-testid="cv-upload-button"/);
    expect(en).toContain("Tick the first box above to upload a file.");
    expect(render(createElement(ConsentForm), "fi")).toContain("Liitä CV tähän");
    expect(render(createElement(ConsentForm), "sv")).toContain("Klistra in ditt CV");
  });

  it.each([
    ["fi", "Ennen kuin aloitetaan", "Aloita keskustelu"],
    ["sv", "Innan vi börjar", "Starta samtalet"],
  ] as const)("consent page renders in %s", (lang, title, start) => {
    const html = render(createElement(ConsentForm), lang);
    expect(html).toContain(title);
    expect(html).toContain(start);
  });

  it("interview page shows the transcript, chips, jobs count and the answer box", () => {
    const html = render(
      createElement(InterviewRoom, {
        mode: "express",
        voiceConsented: false,
        initial: {
          interviewId: "int_x",
          ended: false,
          transcript: [{ index: 0, role: "interviewer", text: "What kind of work have you done?" }],
          signals: [
            { id: "s1", phrase: "Receiving goods", phraseOwn: null, kind: "skill", esco: null, evidence: [], status: "proposed", addedBy: "agent" },
          ],
          coverage: { recent_work: "asked" },
        },
      }),
    );
    // The jobs count has no element before the first jobs.lit event (the board says so in words instead).
    for (const id of ["interviewer-text", "transcript", "answer-input", "send-answer", "signal-chip", "coverage-hint", "ai-disclosure", "interviewer-mascot"]) {
      expect(html).toContain(`data-testid="${id}"`);
    }
    expect(html).toContain("Real open jobs light up here as you talk.");
    expect(html).toContain('data-signal-id="s1"');
    expect(html).toContain("What kind of work have you done?");
    expect(html).not.toContain('data-testid="talk-button"');
    expect(html).not.toContain('data-testid="interview-done"');
  });

  it("12. each of the person's own answers has a turn-remove control while the interview runs, interviewer lines and ended interviews have none", () => {
    const transcript = [
      { index: 0, role: "interviewer" as const, text: "What kind of work have you done?" },
      { index: 1, role: "participant" as const, text: "Warehouse work." },
      { index: 3, role: "participant" as const, text: "Receiving goods." },
    ];
    const open = render(createElement(InterviewRoom, { mode: "full", voiceConsented: false, initial: { interviewId: "int_x", ended: false, transcript, signals: [], coverage: {} } }));
    expect(open.match(/data-testid="turn-remove"/g)).toHaveLength(2);
    expect(open).toContain('data-turn-index="1"');
    expect(open).toContain("Remove this answer");
    const ended = render(createElement(InterviewRoom, { mode: "full", voiceConsented: false, initial: { interviewId: "int_x", ended: true, transcript, signals: [], coverage: {} } }));
    expect(ended).not.toContain('data-testid="turn-remove"');
  });

  it("an ended interview shows the done state instead of the answer box", () => {
    const html = render(
      createElement(InterviewRoom, {
        mode: "full",
        voiceConsented: false,
        initial: { interviewId: "int_x", ended: true, transcript: [], signals: [], coverage: {} },
      }),
      "sv",
    );
    expect(html).toContain('data-testid="interview-done"');
    expect(html).not.toContain('data-testid="answer-input"');
    expect(html).toContain("Förbereder dina anteckningar");
  });
});

describe("interview room, the person's own words and the notes", () => {
  const transcript = [
    { index: 0, role: "interviewer" as const, text: "What kind of work have you done?" },
    { index: 1, role: "participant" as const, text: "I work in a warehouse. I check deliveries. My cat is called Pete." },
    { index: 2, role: "interviewer" as const, text: "Which tools do you use?" },
  ];
  const note = (id: string, phrase: string, from: number, to: number) => ({
    id, phrase, phraseOwn: null, kind: "skill" as const, esco: null, status: "proposed" as const, addedBy: "agent" as const,
    evidence: [{ turnIndex: 1, sentenceFrom: from, sentenceTo: to }],
  });
  const html = () =>
    render(createElement(InterviewRoom, { mode: "express", voiceConsented: false, initial: { interviewId: "int_x", ended: false, transcript, signals: [note("s1", "Checking deliveries", 2, 2), note("s2", "Warehouse work", 1, 1)], coverage: {} } }));

  it("marks, in the words box and the transcript, exactly the sentences the notes cite, from the stored text", () => {
    const out = html();
    const marked = (cls: string) => [...out.matchAll(new RegExp(`<span class="${cls}" data-turn="\\d+" data-sentence="(\\d+)"[^>]*>([^<]*)</span>`, "g"))].map((m) => `${m[1]}:${m[2]}`);
    // the words box (marks that sweep) and the transcript each mark sentences 0 and 1, never sentence 2
    expect(marked("we-mk we-sweep")).toEqual(["0:I work in a warehouse.", "1:I check deliveries."]);
    expect(marked("we-mk")).toEqual(["0:I work in a warehouse.", "1:I check deliveries."]);
    expect(out).not.toMatch(/<span class="we-mk[^"]*"[^>]*>[^<]*My cat/);
    expect(out).toContain("You said · answer 1");
    expect(out).toContain("answer 1");
  });

  it("each note names the answer it came from and no note carries a score", () => {
    const out = html();
    expect(out.match(/data-testid="signal-chip"/g)).toHaveLength(2);
    expect(out).toContain("Checking deliveries");
    const chips = [...out.matchAll(/<button[^>]*data-testid="signal-chip"[^>]*>.*?<\/button>/g)].map((m) => m[0]).join(" ");
    expect(chips).not.toMatch(/%|star|level|score|rank|top/i);
  });

  it("citedSentences turns 1-based sentence references into 0-based positions, ranges included", () => {
    const cited = citedSentences([
      { evidence: [{ turnIndex: 3, sentenceFrom: 2, sentenceTo: 3 }] },
      { evidence: [{ turnIndex: 3, sentenceFrom: 1, sentenceTo: 1 }, { turnIndex: 5, sentenceFrom: 4, sentenceTo: 4 }] },
      { evidence: [] },
    ]);
    expect(cited.get(3)).toEqual([0, 1, 2]);
    expect(cited.get(5)).toEqual([3]);
    expect(cited.size).toBe(2);
  });

  it("the interviewer looks the way it is working: finished, listening, speaking or thinking, never a feeling", () => {
    const base = { ended: false, listening: false, speaking: false, waiting: false };
    expect(mascotStateOf(base)).toBe("idle");
    expect(mascotStateOf({ ...base, waiting: true })).toBe("thinking");
    expect(mascotStateOf({ ...base, waiting: true, speaking: true })).toBe("speaking");
    expect(mascotStateOf({ ...base, speaking: true, listening: true })).toBe("listening");
    expect(mascotStateOf({ ...base, ended: true, listening: true })).toBe("idle");
  });

  it("with no voice the type box is the only input: no talk button, no 'or', no type-instead button", () => {
    const out = html();
    expect(out).toContain('data-testid="answer-input"');
    expect(out).not.toContain('data-testid="talk-button"');
    expect(out).not.toContain('data-testid="type-instead"');
    expect(out).toContain("we-text-only");
    expect(out).toContain('data-testid="skip-question"');
  });

  it("a finished interview with the card ready offers one 'Check my notes' link and no hints", () => {
    const out = render(createElement(InterviewRoom, { mode: "express", voiceConsented: false, initial: { interviewId: "int_x", ended: true, transcript, signals: [], coverage: {} } }));
    expect(out).toContain("Interview finished");
    expect(out).not.toContain('data-testid="skip-question"');
    expect(out).not.toContain('data-testid="answer-input"');
  });
});

describe("the room's top bar", () => {
  const bar = (mode: "express" | "full", asked: number, finished: boolean, lang: UiLang = "en") =>
    render(
      createElement(RoomChromeProvider as unknown as React.FC<{ mode: "express" | "full"; initialAsked: number; initialFinished: boolean; children?: React.ReactNode }>, { mode, initialAsked: asked, initialFinished: finished },
        createElement("div", null, createElement(RoomProgress), createElement(RoomStopButton))),
      lang,
    );

  it("shows 'Question N of 3' with three dashes for the short interview and the Stop button", () => {
    const html = bar("express", 2, false);
    expect(html).toContain("Question 2 of 3");
    expect(html.match(/<i class="/g) ?? []).toHaveLength(3);
    expect(html).toContain('data-testid="stop-interview"');
  });

  it("the full interview has no fixed length: five dashes, more once it runs longer", () => {
    expect(progressDashes("full", 1)).toBe(5);
    expect(progressDashes("full", 7)).toBe(7);
    expect(progressDashes("express", 9)).toBe(3);
    expect(bar("full", 1, false)).toContain("Question 1 of 5–7");
  });

  it("when finished it says so, in the page's language, and Stop is gone", () => {
    const sv = bar("express", 4, true, "sv");
    expect(sv).toContain("Intervjun är klar");
    expect(sv).not.toContain('data-testid="stop-interview"');
    expect(bar("express", 4, true, "fi")).toContain("Haastattelu päättyi");
  });

  it("the Stop dialog and the gone-session page use words from the message tables in all three languages", () => {
    for (const lang of ["en", "fi", "sv"] as const) {
      expect(interviewMessages[lang].stopTitle.length).toBeGreaterThan(5);
      const html = render(createElement(SessionEnded), lang);
      expect(html).toContain('data-testid="session-ended"');
      expect(html).toContain('href="/interview"');
      expect(html).toContain(interviewMessages[lang].startNew);
    }
  });
});

describe("useInterview reducer", () => {
  const initial = initialUiState({ interviewId: "int_x", ended: false, transcript: [], signals: [], coverage: {} });
  const signal = { id: "s1", phrase: "Receiving goods", phraseOwn: null, kind: "skill" as const, esco: null, evidence: [], status: "proposed" as const, addedBy: "agent" as const };

  it("joins streamed sentences and finalises the line on turn.done, once", () => {
    let s = reduce(initial, { type: "event", event: { type: "turn.delta", text: "Thanks." } });
    s = reduce(s, { type: "event", event: { type: "turn.delta", text: "Which tools?" } });
    expect(s.streaming).toBe("Thanks. Which tools?");
    const done = { type: "turn.done" as const, turnIndex: 2, text: "Thanks. Which tools?", kind: "question" as const, closing: false };
    s = reduce(s, { type: "event", event: done });
    s = reduce(s, { type: "event", event: done });
    expect(s.streaming).toBeNull();
    expect(s.transcript).toEqual([{ index: 2, role: "interviewer", text: "Thanks. Which tools?" }]);
  });

  it("replaying the events stream after a reconnect changes nothing", () => {
    const events = [
      { type: "signal.proposed" as const, signal },
      { type: "jobs.lit" as const, count: 4, sample: [] },
      { type: "coverage.updated" as const, areas: { recent_work: "covered" as const } },
      { type: "signal.updated" as const, signal },
    ];
    const once = events.reduce((s, event) => reduce(s, { type: "event", event }), initial);
    const twice = events.reduce((s, event) => reduce(s, { type: "event", event }), once);
    expect(twice).toEqual(once);
    expect(once.signals).toHaveLength(1);
    expect(once.jobsLit.count).toBe(4);
  });

  it("12. numbers the answer just sent from the reply's index, and removes an answer by index or by the spoken command", () => {
    let s = reduce(initial, { type: "participant", text: "Warehouse work." });
    s = reduce(s, { type: "event", event: { type: "turn.done", turnIndex: 2, text: "Which tools?", kind: "question", closing: false } });
    s = reduce(s, { type: "participant", text: "A scanner." });
    s = reduce(s, { type: "event", event: { type: "turn.done", turnIndex: 4, text: "Who with?", kind: "question", closing: false } });
    expect(s.transcript.filter((l) => l.role === "participant").map((l) => l.index)).toEqual([1, 3]);
    const byIndex = reduce(s, { type: "redacted", index: 1 });
    expect(byIndex.transcript.filter((l) => l.role === "participant").map((l) => l.text)).toEqual(["A scanner."]);
    let spoken = reduce(s, { type: "participant", text: "delete this" });
    spoken = reduce(spoken, { type: "event", event: { type: "turn.done", turnIndex: 6, text: "Done. Who with?", kind: "question", closing: false } });
    spoken = reduce(spoken, { type: "redactedPrevious" });
    expect(spoken.transcript.filter((l) => l.role === "participant").map((l) => l.text)).toEqual(["Warehouse work.", "delete this"]);
  });

  it("a retry after a failed send replaces the failed answer's line instead of repeating it", () => {
    let s = reduce(initial, { type: "participant", text: "Warehouse work." });
    s = reduce(s, { type: "sendFailed", value: true });
    s = reduce(s, { type: "participant", text: "Warehouse work." });
    expect(s.transcript).toEqual([{ index: -1, role: "participant", text: "Warehouse work." }]);
    expect(s.sendFailed).toBe(false);
    // without a failure, two answers in a row both stay
    let t = reduce(initial, { type: "participant", text: "One." });
    t = reduce(t, { type: "participant", text: "Two." });
    expect(t.transcript).toHaveLength(2);
  });

  it("drops a removed signal, marks the end, and shows card problems only after the end", () => {
    let s = reduce(initial, { type: "event", event: { type: "signal.proposed", signal } });
    s = reduce(s, { type: "event", event: { type: "signal.updated", signal: { ...signal, status: "removed" } } });
    expect(s.signals).toEqual([]);
    const early = reduce(initial, { type: "event", event: { type: "error", message: "x", retryable: true } });
    expect(early.cardProblem).toBeNull();
    s = reduce(s, { type: "event", event: { type: "turn.done", turnIndex: 6, text: "bye", kind: "closing", closing: true } });
    expect(s.ended).toBe(true);
    expect(reduce(s, { type: "event", event: { type: "error", message: "x", retryable: false } }).cardProblem).toBe("none");
    expect(reduce(s, { type: "event", event: { type: "card.ready", talentId: "t" } }).cardReady).toBe(true);
  });
});
