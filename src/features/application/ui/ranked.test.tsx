import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { UiLang } from "@/contracts";
import { I18nProvider } from "@/lib/i18n/client";

const session = vi.hoisted(() => ({ organiser: false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
vi.mock("next/link", () => ({
  default: (p: { href: string; children?: unknown; className?: string }) => createElement("a", { href: p.href, className: p.className }, p.children as never),
}));
vi.mock("@/lib/session", () => ({ getSession: async () => session }));
vi.mock("@/lib/i18n/server", () => ({ getUiLang: async () => "en" }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/features/application", () => ({ listJobsWithApplicants: async () => [] }));

import OrganiserApplicantsPage from "@/app/(organiser)/organiser/applicants/page";
import OrganiserRankedListPage from "@/app/(organiser)/organiser/applicants/[jobId]/page";
import { LEVEL_NAMES } from "../levels";
import { moveProblem, rankedMessages } from "../messages-organiser";
import type { CompanyApplicants, RankedList } from "../rank";
import { CompanyApplicantsView } from "./CompanyApplicantsView";
import { RankedListView, sameRankedList } from "./RankedListView";

const wrap = (el: React.ReactElement, lang: UiLang = "en") =>
  // eslint-disable-next-line react/no-children-prop
  renderToStaticMarkup(createElement(I18nProvider, { lang, children: el }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;|&#x27;/g, "'").replace(/\s+/g, " ");

const loc = (en: string) => ({ en, fi: `${en} (fi)`, sv: `${en} (sv)` });
const reqs = [
  { requirementId: "r1", text: "Forklift licence", kind: "must" as const },
  { requirementId: "r2", text: "Inventory systems", kind: "nice" as const },
];

const list = (over: Partial<RankedList> = {}): RankedList => ({
  jobId: "job_1",
  companyId: "co_1",
  companyName: "Demo company 03",
  masked: true,
  title: "Warehouse worker",
  needCardVersion: 1,
  requirements: reqs,
  applicants: [
    {
      applicationId: "app_1",
      talentId: "tal_1",
      handle: "Birch-27",
      synthetic: true,
      liveDemo: false,
      position: 1,
      computedPosition: 1,
      points: 7,
      maxPoints: 9,
      pin: null,
      ratings: [
        { requirementId: "r1", level: 3, evidence: [], reason: loc("Described driving a forklift in a distribution centre."), wording: "model" },
        { requirementId: "r2", level: 1, evidence: [], reason: loc("Says systems are familiar."), wording: "model" },
      ],
      summary: loc("Gave examples for one requirement."),
      submittedAt: "2026-11-14T10:00:00.000Z",
    },
    {
      applicationId: "app_2",
      talentId: "tal_2",
      handle: "Alder-04",
      synthetic: false,
      liveDemo: true,
      position: 2,
      computedPosition: 1,
      points: 7,
      maxPoints: 9,
      pin: { applicationId: "app_2", position: 2, reason: "Relevant shift pattern", at: "2026-11-14T11:00:00.000Z" },
      ratings: [{ requirementId: "r1", level: 2, evidence: [], reason: loc("Gave an example."), wording: "model" }],
      summary: loc("Short answers."),
      submittedAt: "2026-11-14T10:30:00.000Z",
    },
  ],
  pendingAssessment: 2,
  published: null,
  changedSincePublished: false,
  companyPath: null,
  ...over,
});

describe("organiser pages without a session", () => {
  it("show the sign-in card", async () => {
    session.organiser = false;
    const overview = wrap(await OrganiserApplicantsPage());
    expect(overview).toContain("signin-title");
    const detail = wrap(await OrganiserRankedListPage({ params: Promise.resolve({ jobId: "job_1" }) } as never));
    expect(detail).toContain("signin-title");
  });
});

describe("sameRankedList", () => {
  it("notices a changed order, a new person or a changed requirement kind", () => {
    const a = list();
    expect(sameRankedList(a, list())).toBe(true);
    expect(sameRankedList(a, { ...a, applicants: [...a.applicants].reverse() })).toBe(false);
    expect(sameRankedList(a, { ...a, applicants: a.applicants.slice(1) })).toBe(false);
    expect(sameRankedList(a, { ...a, pendingAssessment: a.pendingAssessment + 1 })).toBe(false);
    expect(sameRankedList(a, { ...a, requirements: a.requirements.map((r, i) => (i === 0 ? { ...r, kind: r.kind === "must" ? "nice" : "must" } : r)) })).toBe(false);
  });
});

describe("RankedListView", () => {
  const html = wrap(createElement(RankedListView, { jobId: "job_1", initial: list() }));

  it("renders positions, points, levels, reasons and test ids", () => {
    expect(html).toContain('data-testid="ranked-applicant"');
    expect(html).toContain('data-position="2"');
    expect(html).toContain('data-application-id="app_1"');
    expect(html).toContain("7 of 9 points");
    expect(html).toContain(LEVEL_NAMES.en[3]);
    expect(html).toContain("Described driving a forklift");
    expect(html).toContain("Position set by you");
    expect(html).toContain("Relevant shift pattern");
    expect(html).toContain('data-testid="ranked-approve"');
    expect(html).toContain("Not approved yet");
    expect(html).toContain("2 sent and still being rated");
    expect(html).toContain("Must-have");
    expect(html).toContain("Synthetic person");
    expect(html).toContain("Live demo: a real person");
    // The person's own words are not loaded until asked for.
    expect(html).not.toContain('data-testid="ranked-evidence"');
    expect(html).toContain("Read their answers");
  });

  it("shows the state of the approved list", () => {
    const published = { needCardVersion: 1, requirements: reqs, applicants: [], publishedAt: "2026-11-14T10:40:00.000Z" };
    expect(text(wrap(createElement(RankedListView, { jobId: "j", initial: list({ published }) })))).toContain("Approved 14 Nov");
    expect(text(wrap(createElement(RankedListView, { jobId: "j", initial: list({ published, changedSincePublished: true }) })))).toContain(
      "Changed since it was approved",
    );
  });

  it("links to the company's page once a list is approved, and says when it is behind", () => {
    const published = { needCardVersion: 1, requirements: reqs, applicants: [], publishedAt: "2026-11-14T10:40:00.000Z" };
    expect(wrap(createElement(RankedListView, { jobId: "j", initial: list() }))).not.toContain("ranked-company-link");
    const approved = wrap(createElement(RankedListView, { jobId: "j", initial: list({ published, companyPath: "/c/tok/applicants" }) }));
    expect(approved).toMatch(/<a href="\/c\/tok\/applicants"[^>]*data-testid="ranked-company-link"/);
    expect(text(approved)).not.toContain(rankedMessages.en.companyPageStale);
    const behind = wrap(createElement(RankedListView, { jobId: "j", initial: list({ published, companyPath: "/c/tok/applicants", changedSincePublished: true }) }));
    expect(text(behind)).toContain(rankedMessages.en.companyPageStale);
  });

  it("cannot send a move without a reason", () => {
    const m = rankedMessages.en;
    expect(moveProblem(m, "1", "")).toBe(m.moveNeedReason);
    expect(moveProblem(m, "1", "  ab ")).toBe(m.moveNeedReason);
    expect(moveProblem(m, "", "Good reason")).toBe(m.moveNeedPosition);
    expect(moveProblem(m, "0", "Good reason")).toBe(m.moveNeedPosition);
    expect(moveProblem(m, "2", "Good reason")).toBeNull();
    const open = wrap(createElement(RankedListView, { jobId: "j", initial: list(), initialMoveOpenFor: "app_1" }));
    expect(open).toContain('data-testid="ranked-move-reason"');
    expect(open).toMatch(/<button[^>]*data-testid="ranked-move-confirm"[^>]*disabled/);
  });

  it("never says whether the person spoke or typed", () => {
    expect(text(html).toLowerCase()).not.toMatch(/spoke|typed|voice|input mode|language they/);
  });
});

const company = (over: Partial<CompanyApplicants["jobs"][number]> = {}): CompanyApplicants => ({
  companyName: "Demo company 03",
  masked: true,
  jobs: [
    {
      jobId: "job_1",
      title: "Warehouse worker",
      approvedAt: "2026-11-14T10:40:00.000Z",
      requirements: reqs,
      applicants: [
        {
          applicationId: "app_1",
          talentId: "tal_1",
          handle: "Birch-27",
          position: 1,
          points: 7,
          maxPoints: 9,
          moved: true,
          ratings: [{ requirementId: "r1", level: 3, reason: loc("Described driving a forklift.") }],
          summary: loc("Gave examples."),
          intro: null,
          canAsk: true,
          revealed: null,
        },
      ],
      ...over,
    },
  ],
});

describe("CompanyApplicantsView", () => {
  const render = (d: CompanyApplicants, lang: UiLang = "en") => wrap(createElement(CompanyApplicantsView, { data: d, token: "tok" }), lang);

  it("shows nothing before an approval", () => {
    const html = render(company({ approvedAt: null }));
    expect(text(html)).toContain("The organiser has not approved a list yet.");
    expect(html).not.toContain('data-testid="company-applicant"');
    expect(html).not.toContain("Birch-27");
  });

  it("shows no own words and no name before the reveal", () => {
    const html = render(company());
    expect(html).toContain('data-testid="company-applicant"');
    expect(html).toContain('data-position="1"');
    expect(html).toContain('data-testid="ask-to-meet"');
    expect(text(html)).toContain("Position set by the organiser");
    expect(text(html)).toContain("not a quote");
    expect(html).not.toContain('data-testid="ranked-evidence"');
    expect(html).not.toContain("Shown to you after you both agreed");
    expect(text(html)).toContain("Nobody is left off the list because of a rating");
  });

  it("shows name, contact and the person's own answers after both agreed", () => {
    const d = company();
    d.jobs[0].applicants[0].revealed = {
      displayName: "Aino Virtanen",
      contact: "aino@example.org",
      evidence: [{ requirementId: "r1", text: "Forklift licence", questions: ["Tell me about it."], answers: [{ index: 2, sentences: ["I drove a forklift.", "Every day."] }], cited: [{ turnIndex: 2, sentence: 1 }] }],
    };
    d.jobs[0].applicants[0].canAsk = false;
    const html = render(d);
    expect(html).toContain("Shown to you after you both agreed");
    expect(html).toContain("Aino Virtanen");
    expect(html).toContain("aino@example.org");
    expect(html).toContain("I drove a forklift.");
    expect(html).not.toContain('data-testid="ask-to-meet"');
  });
});

describe("messages", () => {
  const keys = Object.keys(rankedMessages.en).sort();
  it("are complete in three languages and non-empty", () => {
    for (const lang of ["fi", "sv"] as const) {
      expect(Object.keys(rankedMessages[lang]).sort()).toEqual(keys);
      for (const v of Object.values(rankedMessages[lang])) expect(v.trim()).not.toBe("");
    }
  });

  it("do not judge a person", () => {
    const banned: Record<UiLang, RegExp> = {
      en: /\b(best|top|weak|strong|score|scores|scored)\b/i,
      fi: /\b(paras|parhaat|huippu|heikko|vahva|pistemäärä)/i,
      sv: /\b(bäst|bästa|topp|svag|stark|starkt)\b/i,
    };
    for (const lang of ["en", "fi", "sv"] as const) {
      for (const [k, v] of Object.entries(rankedMessages[lang])) expect(v, `${lang}.${k}`).not.toMatch(banned[lang]);
    }
  });
});
