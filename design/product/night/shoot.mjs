// Usage: node shoot.mjs name=page?query@WxH[:full] ...
import { createRequire } from "node:module";
const require = createRequire("/home/lansiri/junction26/duuniespoo/.claude/worktrees/design-1/package.json");
const { chromium } = require("@playwright/test");
const dir = "/home/lansiri/junction26/duuniespoo/.claude/worktrees/design-1/design/product/night";
const browser = await chromium.launch({ executablePath: "/home/lansiri/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome" });
for (const arg of process.argv.slice(2)) {
  const name = arg.slice(0, arg.indexOf("=")), rest = arg.slice(arg.indexOf("=") + 1);
  const [urlPart, sizePart] = rest.split("@");
  const [wh, full] = sizePart.split(":");
  const [w, h] = wh.split("x").map(Number);
  const mobile = w < 600;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, reducedMotion: arg.includes("rm=1") ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(e.message));
  await page.goto(`file://${dir}/${urlPart}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${dir}/shots/${name}.png`, fullPage: full === "full" });
  if (errs.length) console.log(name, "ERRORS", errs);
  await ctx.close();
  console.log("shot", name);
}
await browser.close();
