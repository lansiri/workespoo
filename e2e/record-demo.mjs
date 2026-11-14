// Records the demo as six short clips, paced for a viewer, against a real deployment with the
// real model. `e2e/make-video.sh` joins them into one captioned film (the silent backup video of
// docs/specs/demo-script.md).
//
//   E2E_ORGANISER_PASSCODE=... node e2e/record-demo.mjs https://workespoo.aichat.fi out/demo-video
//
// It resets the demo first and last. Each clip is one browser window of one role; sign-ins are
// kept between clips. `captions.json` in the output folder says which caption belongs to which
// seconds of which clip.
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const [base, outArg] = process.argv.slice(2);
const PASSCODE = process.env.E2E_ORGANISER_PASSCODE ?? "";
if (!base || !outArg || !PASSCODE) {
  console.error("usage: E2E_ORGANISER_PASSCODE=... node e2e/record-demo.mjs <base url> <output folder>");
  process.exit(2);
}
const out = path.resolve(outArg);
mkdirSync(out, { recursive: true });
// 1600x808 by default: make-video.mjs adds a 92 px caption bar underneath, which gives a 1600x900 film
// (16:9) in which the interview room has the height it was designed for. E2E_VIDEO_SIZE=1280x628 gives 1280x720.
const [videoWidth, videoHeight] = (process.env.E2E_VIDEO_SIZE ?? "1600x808").split("x").map(Number);
const SIZE = { width: videoWidth, height: videoHeight };
const PITCH = "Demo company 03";
const ANSWERS = [
  "For the last four years I've worked at a machine shop as the person who looks after our ERP system. I set up new items and work orders, and I wrote Python scripts that move production data from the machines into the ERP every night.",
  "Last spring the stock numbers in the ERP kept drifting from what was on the shelves. I traced it to a scanner integration that dropped lines when two people scanned at once, rewrote the import with a queue, and added a SQL check that compares the counts every morning.",
  "Python and SQL every day, the ERP's own report builder, and Excel when the production planners want a quick view.",
];

const browser = await chromium.launch(process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {});
const states = {}; // role -> storage state, so a role stays signed in from clip to clip
const captions = [];
let clipNo = 0;
const tid = (scope, id) => scope.locator(`[data-testid="${id}"]`);
const pause = (page, ms) => page.waitForTimeout(ms);

/** One recorded clip of one role. `fn` gets the page and `say(text)`, which starts a caption at that moment. */
async function clip(name, role, fn) {
  clipNo += 1;
  const file = `${String(clipNo).padStart(2, "0")}-${name}.webm`;
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: out, size: SIZE }, storageState: states[role] });
  const page = await context.newPage();
  const started = Date.now();
  const mine = [];
  const say = (text) => {
    const at = (Date.now() - started) / 1000;
    if (mine.length) mine[mine.length - 1].to = at;
    mine.push({ clip: file, from: at, to: null, text });
  };
  try {
    await fn(page, say);
  } finally {
    states[role] = await context.storageState();
    const video = page.video();
    await context.close();
    const length = (Date.now() - started) / 1000;
    if (mine.length) mine[mine.length - 1].to = length;
    captions.push(...mine);
    if (video) renameSync(await video.path(), path.join(out, file));
    console.log(`${file}: ${length.toFixed(0)} s`);
  }
}

/** Not recorded: sign the organiser in and reset the demo. */
async function organiserSetup() {
  const context = await browser.newContext({ viewport: SIZE, storageState: states.organiser });
  const page = await context.newPage();
  await page.goto(`${base}/organiser`, { waitUntil: "load" });
  await pause(page, 1500);
  if (await tid(page, "passcode-input").count()) {
    await tid(page, "passcode-input").fill(PASSCODE);
    await tid(page, "passcode-submit").click();
  }
  await tid(page, "reset-demo").click({ timeout: 30_000 });
  await tid(page, "reset-demo-confirm").click();
  await tid(page, "reset-demo-result").waitFor({ timeout: 120_000 });
  states.organiser = await context.storageState();
  await context.close();
}

let handle = "";
let companyPath = "";

await organiserSetup();

await clip("conversation", "person", async (page, say) => {
  await page.goto(`${base}/`, { waitUntil: "load" });
  say("WorkEspoo, a prototype for Espoo's matchmaking events. A short conversation replaces the CV form.");
  await pause(page, 3500);
  await tid(page, "start-link").first().click();
  await page.waitForURL(/\/interview$/);
  await pause(page, 1500);
  say("The interviewer is an AI and says so. It takes notes; it does not score or judge.");
  await tid(page, "consent-interview").check();
  await tid(page, "consent-live-demo").check();
  await tid(page, "mode-express").check();
  await pause(page, 2500);
  await tid(page, "start-interview").click();
  await page.waitForURL(/\/interview\/[^/]+$/, { timeout: 30_000 });
  await tid(page, "interviewer-text").waitFor({ timeout: 30_000 });
  await pause(page, 2500);
  say("Each answer becomes notes tied to the person's own words, and real open jobs in Espoo light up.");
  for (let i = 0; i < ANSWERS.length; i++) {
    if (await tid(page, "interview-done").count()) break;
    const before = (await tid(page, "interviewer-text").innerText()).trim();
    await tid(page, "answer-input").pressSequentially(ANSWERS[i], { delay: 9 });
    await pause(page, 500);
    await tid(page, "send-answer").click();
    // The next question (or the end), then time to watch the notes and the jobs arrive.
    for (let k = 0; k < 120; k++) {
      await pause(page, 250);
      if (await tid(page, "interview-done").count()) break;
      const now = (await tid(page, "interviewer-text").innerText()).trim();
      if (now !== before && (await tid(page, "answer-input").isEnabled().catch(() => false))) break;
    }
    await pause(page, i === 0 ? 9000 : 6500);
  }
  await tid(page, "interview-done").waitFor({ timeout: 30_000 });
  await pause(page, 2000);
});

await clip("card", "person", async (page, say) => {
  await page.goto(`${base}/card`, { waitUntil: "load" });
  say("The person checks every note: their own words beside the wording companies will see.");
  await tid(page, "card-signal").first().waitFor({ timeout: 120_000 });
  await pause(page, 3500);
  await tid(page, "signal-quote").first().scrollIntoViewIfNeeded();
  await pause(page, 4000);
  await tid(page, "looking-for-languages").scrollIntoViewIfNeeded();
  await tid(page, "looking-for-languages").pressSequentially("English", { delay: 60 });
  await tid(page, "looking-for-save").click();
  await pause(page, 1500);
  say("Nothing is used until the person approves the card, and joining the pool is their own choice.");
  await tid(page, "approve-card").scrollIntoViewIfNeeded();
  await pause(page, 1200);
  await tid(page, "approve-card").click();
  await tid(page, "card-approved").waitFor({ timeout: 30_000 });
  await pause(page, 1200);
  await tid(page, "pool-opt-in").click();
  await pause(page, 2500);
  const card = await (await page.context().request.get(`${base}/api/card`)).json();
  handle = card.handle ?? "";
});

await clip("organiser", "organiser", async (page, say) => {
  await page.goto(`${base}/organiser/review`, { waitUntil: "load" });
  say("Each morning the agent drafts a short list per company. An Espoo organiser decides every suggestion.");
  await pause(page, 3000);
  await tid(page, "run-daily").click();
  const inRail = tid(page, "review-company").filter({ hasText: PITCH });
  await inRail.waitFor({ timeout: 90_000 });
  await inRail.click();
  await tid(page, "review-pick").first().waitFor({ timeout: 20_000 });
  await pause(page, 5000);
  say("One person at a time. There is no approve-all, and a removal needs a reason.");
  const picks = tid(page, "review-pick");
  const other = picks.filter({ hasNotText: handle }).first();
  const otherId = await other.getAttribute("data-pick-id");
  await tid(other, "pick-remove").click();
  await pause(page, 1800);
  await tid(page, "pick-remove-reason").first().check();
  await pause(page, 1200);
  await tid(page, "pick-remove-confirm").click();
  await tid(page.locator(`[data-testid="review-pick"][data-pick-id="${otherId}"]`), "pick-status").waitFor({ timeout: 20_000 });
  await pause(page, 1200);
  const ids = await picks.evaluateAll((els) => els.map((el) => el.getAttribute("data-pick-id")));
  for (const id of ids) {
    const one = page.locator(`[data-testid="review-pick"][data-pick-id="${id}"]`);
    if (await tid(one, "pick-status").count()) continue;
    await tid(one, "pick-approve").scrollIntoViewIfNeeded();
    await tid(one, "pick-approve").click();
    await tid(one, "pick-status").waitFor({ timeout: 20_000 });
    await pause(page, 900);
  }
  await tid(page, "publish-digest").scrollIntoViewIfNeeded();
  await pause(page, 1000);
  await tid(page, "publish-digest").click();
  const link = tid(page, "digest-link");
  await link.waitFor({ timeout: 30_000 });
  companyPath = (await link.getAttribute("href")) ?? "";
  await pause(page, 3000);
});

await clip("company", "company", async (page, say) => {
  await page.goto(`${base}${companyPath}`, { waitUntil: "load" });
  say("The company sees what people did, not who they are. No names, no scores, no ranking.");
  await pause(page, 6000);
  await tid(page, "need-link").first().click();
  await page.waitForURL(/\/need\//, { timeout: 30_000 });
  const finnish = tid(page, "requirement").filter({ has: tid(page, "question-answer-make_nice") }).filter({ hasText: /Finnish/ });
  await finnish.scrollIntoViewIfNeeded();
  say("A must-have comes back to the employer as a question, with evidence from the pool. No filter is applied.");
  await pause(page, 7500);
  await tid(finnish, "question-answer-make_nice").click();
  await pause(page, 3000);
  await page.goto(`${base}${companyPath}`, { waitUntil: "load" });
  const mine = tid(page, "pick-card").filter({ hasText: handle });
  await mine.scrollIntoViewIfNeeded();
  await pause(page, 1500);
  say("The company asks to meet. The person's name stays hidden unless they accept.");
  await tid(mine, "ask-to-meet").scrollIntoViewIfNeeded();
  await tid(mine, "ask-to-meet").click();
  await pause(page, 1500);
  await tid(mine, "ask-to-meet-send").click();
  await pause(page, 3500);
});

await clip("accept", "person", async (page, say) => {
  await page.goto(`${base}/matches`, { waitUntil: "load" });
  const request = tid(page, "intro-request").filter({ hasText: PITCH });
  await request.waitFor({ timeout: 30_000 });
  say("The person sees who is asking and decides. Only now is a name asked for.");
  await pause(page, 3500);
  await tid(request, "intro-accept").click();
  await tid(request, "intro-name").pressSequentially("Alex Demo", { delay: 50 });
  await tid(request, "intro-contact").pressSequentially("alex.demo@example.test", { delay: 30 });
  await pause(page, 800);
  await tid(request, "intro-confirm").click();
  await page.locator('[data-testid="intro-status"][data-status="accepted"]').first().waitFor({ timeout: 20_000 });
  await pause(page, 3500);
});

await clip("reveal", "company", async (page, say) => {
  await page.goto(`${base}${companyPath}`, { waitUntil: "load" });
  say("Both said yes: now the company sees the name and the person's own words.");
  await tid(page, "revealed-name").first().waitFor({ timeout: 20_000 });
  await tid(page, "revealed-name").first().scrollIntoViewIfNeeded();
  await pause(page, 6000);
});

await clip("audit", "organiser", async (page, say) => {
  await page.goto(`${base}/organiser/audit`, { waitUntil: "load" });
  say("Every step is in the audit log. Open-weight model served from Finland; every person but the presenter is synthetic.");
  await tid(page, "audit-row").first().waitFor({ timeout: 20_000 });
  await pause(page, 7000);
});

writeFileSync(path.join(out, "captions.json"), `${JSON.stringify(captions, null, 2)}\n`);
await organiserSetup(); // leave the demo as it was found
await browser.close();
console.log(`clips and captions.json are in ${out}`);
