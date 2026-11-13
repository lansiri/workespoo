// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n/client";
import type { UiLang } from "@/contracts";
import { ConsentForm, canStartInterview, voiceServiceName } from "./ConsentForm";
import { interviewMessages } from "./messages";
import { consentCopy } from "@/lib/i18n/content";
import { fmt } from "@/lib/i18n";
import { InterviewRoom } from "./InterviewRoom";
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

  it("11. the start page has the CV text area with its note, in three languages", () => {
    const en = render(createElement(ConsentForm), "en");
    expect(en).toContain('data-testid="cv-text"');
    expect(en).toContain("Paste your CV if you like.");
    expect(en).toContain("It is only used to choose questions and is not kept.");
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
    for (const id of ["interviewer-text", "transcript", "answer-input", "send-answer", "signal-chip", "jobs-lit-count"]) {
      expect(html).toContain(`data-testid="${id}"`);
    }
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
