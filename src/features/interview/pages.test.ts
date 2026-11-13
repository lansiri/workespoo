// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n/client";
import type { UiLang } from "@/contracts";
import { ConsentForm } from "./ConsentForm";
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
