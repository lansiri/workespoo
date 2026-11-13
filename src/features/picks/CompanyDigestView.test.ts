import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n/client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

import { CompanyDigestView, ExpiredLink } from "./CompanyDigestView";
import type { CompanyPageData, CompanyPick } from "./company-view";
import { companyCard } from "./card-mock";

const basePick = (over: Partial<CompanyPick> = {}): CompanyPick => ({
  id: "pick_1",
  card: companyCard("tal_001"),
  askedByPerson: false,
  reasons: [
    {
      text: "The card describes Python data pipelines, which relates to Python programming.",
      requirementText: "Python programming",
      signalId: "s1",
      rendering: "Built nightly pipelines in Python (English rendering).",
      postingSentence: "You write Python every day.",
    },
  ],
  requirements: [
    { id: "req_1", text: "Python programming", mentioned: true },
    { id: "req_3", text: "Fluent Finnish", mentioned: false },
  ],
  notMentioned: [{ text: "Fluent Finnish", statutory: true }],
  canAsk: true,
  intro: null,
  revealed: null,
  ...over,
});

const data = (picks: CompanyPick[]): CompanyPageData => ({
  demo: true,
  company: { displayName: "Demo company 07" },
  needs: [{ id: "nc_1", title: "Data engineer", summary: "Builds data pipelines.", status: "draft" }],
  digest: { date: "2026-11-20", groups: [{ needCardId: "nc_1", title: "Data engineer", nobodyRelates: false, picks }] },
});

const render = (d: CompanyPageData, lang: "en" | "fi" | "sv" = "en") =>
  renderToStaticMarkup(
    // eslint-disable-next-line react/no-children-prop
    createElement(I18nProvider, { lang, children: createElement(CompanyDigestView, { data: d, token: "tok-1", lang }) }),
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;|&#x27;/g, "'").replace(/\s+/g, " ");

describe("CompanyDigestView", () => {
  it("always carries the masked banner and the test ids of the golden path (CV3)", () => {
    const html = render(data([basePick()]));
    for (const id of ["masked-banner", "need-link", "pick-card", "pick-reason", "pick-not-mentioned", "ask-to-meet"]) {
      expect(html, id).toContain(`data-testid="${id}"`);
    }
    expect(html).toContain("Demo company 07.");
    expect(html).toContain("The employer&#x27;s name is hidden");
    expect(html).toContain('href="/c/tok-1/need/nc_1"');
  });

  it("says that not mentioned does not mean missing, and flags statutory requirements", () => {
    const t = text(render(data([basePick()])));
    expect(t).toContain("Not mentioned does not mean missing. Ask about it when you meet.");
    expect(t).toContain("Fluent Finnish (you check this at hiring)");
  });

  it("shows no percentage and no digits besides the handle, the company number, dates and requirement texts (CV4)", () => {
    let t = text(render(data([basePick()])));
    expect(t).not.toContain("%");
    t = t.replace(/\d{4}-\d{2}-\d{2}/g, "").replace(/Maple-\d+/g, "").replace(/Demo company \d+/g, "");
    expect(t).not.toMatch(/\d/);
  });

  it("before acceptance shows no name, quote or reveal block; after it, shows them labelled (CV6)", () => {
    const before = render(data([basePick({ intro: { id: "i1", status: "awaiting_talent", expiresAt: "2026-11-23T08:00:00.000Z" }, canAsk: false })]));
    expect(before).not.toContain("revealed-name");
    expect(before).not.toContain("revealed-quote");
    expect(text(before)).toContain("Request sent. Waiting for the person to answer (until 2026-11-23).");
    expect(before).not.toContain('data-testid="ask-to-meet"');

    const after = render(
      data([
        basePick({
          canAsk: false,
          intro: { id: "i1", status: "accepted", expiresAt: null },
          revealed: {
            name: "Aino Testi",
            contact: "aino@example.invalid",
            signals: [{ id: "s1", phrase: "Python data pipelines", phraseOwn: null, quotes: ["I built the nightly load myself."] }],
          },
        }),
      ]),
    );
    expect(after).toContain('data-testid="revealed-name"');
    expect(text(after)).toContain("Aino Testi");
    expect(text(after)).toContain("I built the nightly load myself.");
    expect(text(after)).toContain("Shown to you after you both agreed");
    expect(text(after)).toContain("You both agreed to meet.");
  });

  it("marks a request the person made", () => {
    expect(text(render(data([basePick({ askedByPerson: true })])))).toContain("This person asked to meet you");
  });

  it("shows the empty states", () => {
    const none = data([]);
    none.digest!.groups[0].nobodyRelates = true;
    expect(text(render(none))).toContain("Nobody in the pool relates to Data engineer yet.");
    const unpublished: CompanyPageData = { ...none, digest: null };
    expect(render(unpublished)).toContain('data-testid="not-published"');
  });

  it("speaks Finnish and Swedish", () => {
    expect(text(render(data([basePick()]), "fi"))).toContain("Ei mainittu ei tarkoita, että puuttuu.");
    expect(text(render(data([basePick()]), "sv"))).toContain("Inte nämnt betyder inte att det saknas.");
    expect(text(render(data([basePick()]), "fi"))).toContain("Alla olevat henkilöt ovat synteettisiä.");
  });

  it("renders a neutral expiry page that says nothing about why", () => {
    const html = renderToStaticMarkup(createElement(ExpiredLink, { lang: "en" }));
    expect(text(html)).toContain("This link has expired");
    expect(text(html)).toContain("Ask the organiser for a new one.");
  });
});
