// Screenshots of the final prototypes. Usage: node shoot.mjs [name-filter]
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const require = createRequire("/home/lansiri/junction26/duuniespoo/.claude/worktrees/design-1/package.json");
const { chromium } = require("@playwright/test");
const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, "shots");
fs.mkdirSync(out, { recursive: true });
const u = (f, q = "") => "file://" + path.join(dir, f) + "?shot" + (q ? "&" + q : "");

const D = { width: 1440, height: 900 };
const M = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

const shots = [
  // interview
  ["interview-start-desktop", u("interview.html", "step=0&state=speaking&arrive=0"), D],
  ["interview-later-desktop", u("interview.html", "step=4&state=thinking&arrive=0"), D],
  ["interview-arrival-desktop", u("interview.html", "step=2&state=thinking"), D, { wait: 1500 }],
  ["interview-listening-desktop", u("interview.html", "step=3&state=listening&arrive=0"), D],
  ["interview-done-desktop", u("interview.html", "step=5&state=idle&arrive=0"), D],
  ["interview-presenter-1280", u("interview.html", "step=4&state=speaking&arrive=0&presenter=1"), { width: 1280, height: 720 }],
  ["interview-presenter-1920", u("interview.html", "step=4&state=thinking&arrive=0&presenter=1"), { width: 1920, height: 1080 }],
  ["interview-reduced-motion", u("interview.html", "step=3&state=thinking&motion=off"), D, { wait: 800 }],
  ["interview-mobile", u("interview.html", "step=3&state=thinking&arrive=0"), M],
  ["interview-mobile-start", u("interview.html", "step=0&state=idle&arrive=0"), M],
  ["interview-mobile-fi", u("interview.html", "step=4&state=listening&arrive=0&lang=fi"), M],
  ["interview-desktop-fi", u("interview.html", "step=4&state=thinking&arrive=0&lang=fi"), D],
  // card
  ["card-desktop", u("card.html"), D],
  ["card-desktop-approved", u("card.html", "approved=1"), D],
  ["card-desktop-company", u("card.html", "view=company"), D],
  ["card-mobile", u("card.html"), M],
  ["card-mobile-fi", u("card.html", "lang=fi"), M],
  // review
  ["review-desktop", u("review.html"), D],
  ["review-remove-dialog", u("review.html", "dialog=1"), D],
  ["review-keys", u("review.html", "keys=1"), D],
  ["review-ready-fi", u("review.html", "all=1&lang=fi"), D],
  // matches
  ["matches-desktop", u("matches.html"), D],
  ["matches-desktop-accepted", u("matches.html", "intro=accepted"), D],
  ["matches-mobile", u("matches.html"), M],
  ["matches-mobile-accept-form", u("matches.html", "intro=form"), M],
  ["matches-mobile-sv", u("matches.html", "lang=sv"), M, { full: true }],
  // company
  ["company-desktop", u("company.html"), D],
  ["company-desktop-full", u("company.html"), D, { full: true }],
  ["company-mobile", u("company.html"), M, { full: true }],
];

const filter = process.argv[2];
const browser = await chromium.launch({ executablePath: "/home/lansiri/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome" });
for (const [name, url, vp, opt = {}] of shots) {
  if (filter && !name.includes(filter)) continue;
  const { isMobile, hasTouch, deviceScaleFactor, ...viewport } = vp;
  const ctx = await browser.newContext({ viewport, isMobile: !!isMobile, hasTouch: !!hasTouch, deviceScaleFactor: deviceScaleFactor || 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(opt.wait ?? 1000);
  await page.screenshot({ path: path.join(out, name + ".png"), fullPage: !!opt.full });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(name, overflow > 0 ? `OVERFLOW ${overflow}px` : "ok", errors.length ? "ERRORS " + errors.join(" | ") : "");
  await ctx.close();
}
await browser.close();
