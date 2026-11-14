// Records the demo as a few short clips, paced for a viewer, against a real deployment with the
// real model. `e2e/make-video.mjs` joins them into one captioned film (the silent backup video of
// docs/specs/demo-script.md).
//
//   E2E_ORGANISER_PASSCODE=... node e2e/record-demo.mjs [--journey pitch|golden] <base url> <output folder>
//
// --journey pitch (the default) is the three-minute pitch with the job interview; --journey golden
// is the earlier journey with Daily Picks. It resets the demo first and last. Each clip is one
// browser window of one role; sign-ins are kept between clips. `captions.json` in the output
// folder says which caption belongs to which seconds of which clip; `speedups.json` lists the
// waiting stretches that make-video.mjs plays faster (their captions say so).
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
let journey = "pitch";
const jAt = args.indexOf("--journey");
if (jAt >= 0) {
  journey = args[jAt + 1] ?? "";
  args.splice(jAt, 2);
}
if (journey !== "pitch" && journey !== "golden") {
  console.error('--journey must be "pitch" or "golden"');
  process.exit(2);
}
const [base, outArg] = args;
const PASSCODE = process.env.E2E_ORGANISER_PASSCODE ?? "";
if (!base || !outArg || !PASSCODE) {
  console.error("usage: E2E_ORGANISER_PASSCODE=... node e2e/record-demo.mjs [--journey pitch|golden] <base url> <output folder>");
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

const JOB_ANSWERS = [
  { about: /finnish|suomi/i, first: "I have not used Finnish at work yet. I am taking an evening course, and at the shop everything I do is in English.", then: "No, I have not done that at work." },
  { about: /english/i, first: "All the vendor documentation for our ERP and for the label printers is in English, and so are the support tickets. Last year I wrote the integration notes for the printer interface in English and the vendor's engineers worked from them.", then: "The vendor used my notes to fix a mapping error on their side, and the labels have printed correctly since March." },
  { about: /problem|self-directed|independent/i, first: "Last spring the stock numbers in the ERP kept drifting from the shelves. Nobody asked me to look, I traced it myself to a scanner integration that dropped lines when two people scanned at once, rewrote the import with a queue and added a morning check in SQL.", then: "After the rewrite the morning check showed no differences for eight weeks, and the planners stopped counting stock by hand on Mondays." },
  { about: /overall|whole|process|grasp/i, first: "When we changed how work orders move through the shop I mapped the whole chain first, from the sales order in the ERP to the machine programs and the label printers. I drew it on one page with the planners, found two places where the same data was typed twice, and changed the work order flow so it is entered once.", then: "The double entry went away and a work order now reaches the machine about half a day sooner than before." },
  { about: /motivat|concrete results|daily work|production/i, first: "I sit next to the production planners, so I see the next morning whether a change helped. When I moved the nightly import to a queue I stood at the scanners for two shifts to watch it work, and I fixed the one screen the operators found slow the same week.", then: "The operators' scan errors dropped from a few every shift to none in the weeks I checked." },
  { about: /erp|software|technical systems|system/i, first: "For four years I have looked after the ERP at a machine shop. I set up items and work orders, and I wrote the Python scripts that move production data from the machines into the ERP every night.", then: "I wrote and ran those scripts myself, and the nightly import has not missed a night since I added the retry in January." },
];
const DEFAULT_ANSWER = {
  first: "At the machine shop I did this as part of looking after the ERP: I set it up myself, wrote the scripts for it and trained the people who use it.",
  then: "I did that part myself and it has been in daily use on the shop floor since.",
};
const CARD_ANSWERS = [
  ...ANSWERS,
  "I train the production staff when we change a process. Last year I wrote the instructions for the new work order flow and ran six short sessions on the shop floor.",
  "I'd like a role developing ERP and production systems, close to the people who use them. I work in English and I'm learning Finnish.",
  "No, I think that covers it.",
];

const browser = await chromium.launch(process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {});
const states = {}; // role -> storage state, so a role stays signed in from clip to clip
const captions = [];
const speedups = [];
let clipNo = 0;
const tid = (scope, id) => scope.locator(`[data-testid="${id}"]`);
const pause = (page, ms) => page.waitForTimeout(ms);

/** One recorded clip of one role. `fn` gets the page, `say(text)` (starts a caption at that moment) and `fast(factor)` (marks a waiting stretch to speed up). */
async function clip(name, role, fn) {
  clipNo += 1;
  const file = `${String(clipNo).padStart(2, "0")}-${name}.webm`;
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: out, size: SIZE }, storageState: states[role] });
  const page = await context.newPage();
  const started = Date.now();
  const mine = [];
  const now = () => (Date.now() - started) / 1000;
  /** Starts a waiting stretch that the film plays `factor` times faster; call the result when it ends. */
  const fast = (factor) => {
    const from = now();
    return () => speedups.push({ clip: file, from, to: now(), factor });
  };
  const say = (text) => {
    const at = (Date.now() - started) / 1000;
    if (mine.length) mine[mine.length - 1].to = at;
    mine.push({ clip: file, from: at, to: null, text });
  };
  try {
    await fn(page, say, fast);
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

/** The earlier journey: conversation, card, Daily Picks, Need Card, mutual yes, audit log. */
async function golden() {
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
}

/** The three-minute pitch: general interview, card, job interview, organiser's ranked list, company's list, own result. */
async function pitch() {
  let applicationPath = "";
  let companyPath = "";
  let handle = "";
  /** The ad's requirement marked "Now" decides which prepared answer is given. */
  const answerFor = (requirement, times) => {
    const hit = JOB_ANSWERS.find((a) => a.about.test(requirement)) ?? DEFAULT_ANSWER;
    return times === 0 ? hit.first : hit.then;
  };
  /** Sends one answer (pasted) and waits for the interviewer's next line, or for `doneId`. */
  const sendAndWait = async (page, text, doneId) => {
    const before = (await tid(page, "interviewer-text").innerText()).trim();
    await tid(page, "answer-input").fill(text);
    await pause(page, 900);
    await tid(page, "send-answer").click();
    for (let k = 0; k < 180; k++) {
      await pause(page, 250);
      if (await tid(page, doneId).count()) return;
      const now = (await tid(page, "interviewer-text").innerText()).trim();
      if (now !== before && (await tid(page, "answer-input").isEnabled().catch(() => false))) return;
    }
    throw new Error("the interviewer did not answer within 45 seconds");
  };

  await clip("start", "person", async (page, say) => {
    await page.goto(`${base}/`, { waitUntil: "load" });
    say("WorkEspoo, a prototype for Espoo's matchmaking events. A short conversation replaces the CV form.");
    await pause(page, 5500);
    await tid(page, "start-link").first().click();
    await page.waitForURL(/\/interview$/);
    say("The interviewer is an AI and says so. This first conversation is not scored: it takes notes.");
    await pause(page, 6000);
    await tid(page, "consent-interview").check();
    await tid(page, "consent-live-demo").check();
    await tid(page, "mode-express").check();
    await pause(page, 2500);
    await tid(page, "start-interview").click();
    await page.waitForURL(/\/interview\/[^/]+$/, { timeout: 30_000 });
    await tid(page, "interviewer-text").waitFor({ timeout: 30_000 });
    await pause(page, 1500);
    say("Each answer becomes notes tied to the person's own words. Answers are pasted here to save time.");
    for (let i = 0; i < 12; i++) {
      if (await tid(page, "interview-done").count()) break;
      await sendAndWait(page, CARD_ANSWERS[Math.min(i, CARD_ANSWERS.length - 1)], "interview-done");
      await pause(page, 2500);
    }
    await tid(page, "interview-done").waitFor({ timeout: 30_000 });
    await pause(page, 1500);
  });

  await clip("card", "person", async (page, say, fast) => {
    await page.goto(`${base}/card`, { waitUntil: "load" });
    say("The notes are being prepared: about 20 seconds in the product, shortened here.");
    const end = fast(8);
    await tid(page, "card-signal").first().waitFor({ timeout: 120_000 });
    end();
    say("The person checks every note against their own words. Nothing is used until they approve the card.");
    await pause(page, 4500);
    await tid(page, "signal-quote").first().scrollIntoViewIfNeeded();
    await pause(page, 5000);
    await tid(page, "approve-card").scrollIntoViewIfNeeded();
    await pause(page, 1000);
    await tid(page, "approve-card").click();
    await tid(page, "card-approved").waitFor({ timeout: 30_000 });
    await pause(page, 2500);
    const card = await (await page.context().request.get(`${base}/api/card`)).json();
    handle = card.handle ?? "";
  });

  await clip("apply", "person", async (page, say, fast) => {
    await page.goto(`${base}/apply`, { waitUntil: "load" });
    say("Now one job. The person chooses a job of the event; the questions will come from its ad.");
    const job = tid(page, "apply-job").filter({ hasText: PITCH });
    await job.waitFor({ timeout: 30_000 });
    await job.scrollIntoViewIfNeeded();
    await pause(page, 5000);
    await tid(job, "apply-start").click();
    await page.waitForURL(/\/apply\/new\?job=/, { timeout: 30_000 });
    await tid(page, "apply-start-form").waitFor({ timeout: 20_000 });
    say("One thing is rated: a job application. The person is told first, and the button stays off until they agree.");
    await pause(page, 11_000);
    await tid(page, "apply-consent").check();
    await pause(page, 1500);
    await tid(page, "apply-begin").click();
    await page.waitForURL(/\/apply\/app_[^/]+$/, { timeout: 60_000 });
    applicationPath = new URL(page.url()).pathname;
    await tid(page, "interviewer-text").waitFor({ timeout: 30_000 });
    say("The questions come from the job ad, and every applicant is asked about the same requirements.");
    await pause(page, 6000);
    const covered = await tid(page, "apply-requirement").count();
    const asked = new Map();
    for (let i = 0; i < 2 * covered + 3; i++) {
      if (await tid(page, "apply-ended").count()) break;
      const now = page.locator('[data-testid="apply-requirement"][data-now="true"]');
      const id = (await now.getAttribute("data-requirement-id").catch(() => null)) ?? "";
      const requirement = id ? await now.innerText() : "";
      const times = asked.get(id) ?? 0;
      asked.set(id, times + 1);
      await sendAndWait(page, answerFor(requirement, times), "apply-ended");
      await pause(page, 1200);
    }
    await tid(page, "apply-ended").waitFor({ timeout: 30_000 });
    await pause(page, 1500);
    await tid(page, "apply-to-review").click();
    await tid(page, "apply-review").waitFor({ timeout: 30_000 });
    say("The person reads everything through. Nothing is rated until they send it.");
    await pause(page, 5000);
    await tid(page, "apply-send").scrollIntoViewIfNeeded();
    await tid(page, "apply-send").click();
    say("An AI rates the evidence in the answers, with a reason for each. About 20 seconds, shortened here.");
    await pause(page, 2500);
    const end = fast(8);
    await tid(page, "apply-result").waitFor({ timeout: 180_000 });
    end();
    await pause(page, 1000);
  });

  await clip("organiser", "organiser", async (page, say) => {
    await page.goto(`${base}/organiser/applicants`, { waitUntil: "load" });
    const job = tid(page, "applicants-job").filter({ hasText: PITCH });
    await job.waitFor({ timeout: 30_000 });
    say("The organiser's view of the job's applicants. Code computes the order from the levels.");
    await pause(page, 3500);
    await job.getByRole("link").click();
    await page.waitForURL(/\/organiser\/applicants\/[^/]+$/, { timeout: 30_000 });
    const rows = tid(page, "ranked-applicant");
    await rows.first().waitFor({ timeout: 30_000 });
    say("Four simulated applicants and the new one, each requirement with a level. A rating removes nobody from the list.");
    await pause(page, 9000);
    const other = rows.filter({ hasNotText: handle }).first();
    await other.scrollIntoViewIfNeeded();
    await tid(other, "ranked-read-answers").click();
    await tid(other, "ranked-evidence").waitFor({ timeout: 20_000 });
    say("The organiser can read the answers behind every rating, and can move a person with a written reason.");
    await pause(page, 9000);
    await tid(page, "ranked-approve").scrollIntoViewIfNeeded();
    await pause(page, 1500);
    say("The company sees nothing until the organiser has approved the list.");
    await tid(page, "ranked-approve").click();
    await page.locator('[data-testid="ranked-status"][data-state="approved"]').waitFor({ timeout: 30_000 });
    companyPath = (await tid(page, "ranked-company-link").getAttribute("href")) ?? "";
    await pause(page, 4000);
  });

  await clip("company", "company", async (page, say) => {
    await page.goto(`${base}${companyPath}`, { waitUntil: "load" });
    say("The company sees the approved order, with levels and reasons. No name, and none of the person's own words.");
    await tid(page, "company-applicant").first().waitFor({ timeout: 30_000 });
    await pause(page, 10_000);
    await tid(page, "company-applicant").nth(2).scrollIntoViewIfNeeded();
    say("Names and the person's own words appear only when both sides agree to meet.");
    await pause(page, 7000);
  });

  await clip("result", "person", async (page, say) => {
    await page.goto(`${base}${applicationPath}`, { waitUntil: "load" });
    say("The person sees their own levels and a reason that points at their own sentences.");
    await tid(page, "apply-position").waitFor({ timeout: 30_000 });
    await tid(page, "apply-rating").first().scrollIntoViewIfNeeded();
    await pause(page, 10_000);
    say("And their place on the list the company sees.");
    await tid(page, "apply-position").scrollIntoViewIfNeeded();
    await pause(page, 7000);
  });
}

await organiserSetup();
if (journey === "golden") await golden();
else await pitch();
writeFileSync(path.join(out, "speedups.json"), `${JSON.stringify(speedups, null, 2)}\n`);
writeFileSync(path.join(out, "captions.json"), `${JSON.stringify(captions, null, 2)}\n`);
await organiserSetup(); // leave the demo as it was found
await browser.close();
console.log(`clips and captions.json are in ${out}`);
