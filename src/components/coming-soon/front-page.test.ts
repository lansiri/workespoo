// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { siteMessages } from "@/components/site/messages";
import { FrontPage } from "./FrontPage";
import { frontMessages } from "./front-messages";

describe("front page", () => {
  it("has the same non-empty strings in every language", () => {
    const keys = Object.keys(frontMessages.en).sort();
    for (const lang of ["fi", "sv"] as const) {
      expect(Object.keys(frontMessages[lang]).sort()).toEqual(keys);
      for (const k of keys) expect((frontMessages[lang] as Record<string, string>)[k].trim().length, `${lang}.${k}`).toBeGreaterThan(0);
    }
  });

  it.each(["en", "fi", "sv"] as const)("keeps the headline, links to the interview and has three sections in %s", (lang) => {
    const html = renderToStaticMarkup(createElement(FrontPage, { lang }));
    expect(html).toContain('data-testid="coming-soon-headline"');
    expect(html).toContain('data-testid="start-link"');
    expect(html).toContain('href="/interview"');
    for (const id of ["front-steps", "front-gain", "front-not"]) expect(html).toContain(`data-testid="${id}"`);
    expect(html.match(/class="sp-step"/g)).toHaveLength(3);
    expect(html).not.toMatch(/%|stars?\b/i);
  });

  it("no longer says coming soon", () => {
    for (const lang of ["en", "fi", "sv"] as const) {
      expect(renderToStaticMarkup(createElement(FrontPage, { lang }))).not.toMatch(/coming soon|tulossa pian|kommer snart/i);
    }
  });
});

describe("not found messages", () => {
  it("exist in every language", () => {
    for (const lang of ["en", "fi", "sv"] as const) {
      const m = siteMessages[lang];
      for (const v of [m.notFoundTitle, m.notFoundBody, m.notFoundHome, m.notFoundHow]) expect(v.trim().length).toBeGreaterThan(0);
    }
  });
});
