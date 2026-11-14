/**
 * The job interview as a test: a person with an approved card chooses a job of the event, is
 * told that the answers will be rated and ranked, answers questions made from that job's ad,
 * sends the application and reads their own ratings; an organiser reads the answers behind the
 * ratings, moves one person with a reason and approves the order; the company sees that order
 * with reasons and no names, asks to meet, and the person agrees
 * (docs/specs/job-interview.md). It runs against a real deployment with the real model.
 *
 *   E2E_BASE_URL=https://workespoo.aichat.fi E2E_ORGANISER_PASSCODE=... npx playwright test job-interview
 *
 * It needs the seeded demo world with its simulated applications (the test resets the demo
 * first and last), so it is skipped when no organiser passcode is given. The pitch company is
 * "Demo company 03".
 */
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

const PASSCODE = process.env.E2E_ORGANISER_PASSCODE ?? "";
const PITCH_COMPANY = "Demo company 03";
/** Leave the world as the journey made it (for looking at it afterwards) instead of resetting. */
const KEEP = process.env.E2E_KEEP === "1";

/** The general interview: enough for a card. The last one repeats when the interviewer asks more. */
const CARD_ANSWERS = [
  "For the last four years I've worked at a machine shop as the person who looks after our ERP system. I set up new items and work orders, and I wrote Python scripts that move production data from the machines into the ERP every night.",
  "Last spring the stock numbers in the ERP kept drifting from what was on the shelves. I traced it to a scanner integration that dropped lines when two people scanned at once, rewrote the import with a queue, and added a SQL check that compares the counts every morning.",
  "Python and SQL every day, the ERP's own report builder, and Excel when the production planners want a quick view. I also keep the integration between the ERP and the label printers running.",
  "I train the production staff when we change a process. Last year I wrote the instructions for the new work order flow and ran six short sessions on the shop floor.",
  "I'd like a role developing ERP and production systems, close to the people who use them. I work in English and I'm learning Finnish.",
  "No, I think that covers it.",
];

/**
 * The job interview: what the person says about each thing the ad asks for, found by a word
 * of the requirement on screen. The second text is for a follow-up question. Finnish is the
 * honest gap: the person says plainly that they have not used it at work.
 */
const JOB_ANSWERS: Array<{ about: RegExp; first: string; then: string }> = [
  {
    about: /finnish|suomi/i,
    first: "I have not used Finnish at work yet. I am taking an evening course, and at the shop everything I do is in English.",
    then: "No, I have not done that at work.",
  },
  {
    about: /english/i,
    first: "All the vendor documentation for our ERP and for the label printers is in English, and so are the support tickets. Last year I wrote the integration notes for the printer interface in English and the vendor's engineers worked from them.",
    then: "The vendor used my notes to fix a mapping error on their side, and the labels have printed correctly since March.",
  },
  {
    about: /problem|self-directed|independent/i,
    first: "Last spring the stock numbers in the ERP kept drifting from the shelves. Nobody asked me to look, I traced it myself to a scanner integration that dropped lines when two people scanned at once, rewrote the import with a queue and added a morning check in SQL.",
    then: "After the rewrite the morning check showed no differences for eight weeks, and the planners stopped counting stock by hand on Mondays.",
  },
  {
    about: /overall|whole|process|grasp/i,
    first: "When we changed how work orders move through the shop I mapped the whole chain first, from the sales order in the ERP to the machine programs and the label printers. I drew it on one page with the planners, found two places where the same data was typed twice, and changed the work order flow so it is entered once.",
    then: "The double entry went away and a work order now reaches the machine about half a day sooner than before.",
  },
  {
    about: /motivat|concrete results|daily work|production/i,
    first: "I sit next to the production planners, so I see the next morning whether a change helped. When I moved the nightly import to a queue I stood at the scanners for two shifts to watch it work, and I fixed the one screen the operators found slow the same week.",
    then: "The operators' scan errors dropped from a few every shift to none in the weeks I checked.",
  },
  {
    about: /erp|software|technical systems|system/i,
    first: "For four years I have looked after the ERP at a machine shop. I set up items and work orders, and I wrote the Python scripts that move production data from the machines into the ERP every night.",
    then: "I wrote and ran those scripts myself, and the nightly import has not missed a night since I added the retry in January.",
  },
];
const DEFAULT_ANSWER = {
  first: "At the machine shop I did this as part of looking after the ERP: I set it up myself, wrote the scripts for it and trained the people who use it.",
  then: "I did that part myself and it has been in daily use on the shop floor since.",
};

/** How long the test "reads" each question before answering. */
const THINK_MS = 2_000;

const tid = (scope: Page | Locator, id: string) => scope.locator(`[data-testid="${id}"]`);

async function signInOrganiser(page: Page): Promise<void> {
  await page.goto("/organiser", { waitUntil: "domcontentloaded" });
  if (await tid(page, "passcode-input").count()) {
    await expect(async () => {
      await tid(page, "passcode-input").fill("");
      await tid(page, "passcode-input").fill(PASSCODE);
      await expect(tid(page, "passcode-submit")).toBeEnabled({ timeout: 1_000 });
    }).toPass({ timeout: 90_000 });
    await tid(page, "passcode-submit").click();
  }
  await expect(tid(page, "reset-demo")).toBeVisible({ timeout: 20_000 });
}

async function resetDemo(page: Page): Promise<void> {
  await page.goto("/organiser", { waitUntil: "domcontentloaded" });
  await tid(page, "reset-demo").click();
  await tid(page, "reset-demo-confirm").click();
  await expect(tid(page, "reset-demo-result")).toBeVisible({ timeout: 120_000 });
}

/** Sends one answer and waits for the interviewer's next line, or for `doneId` to appear. */
async function answerAndWait(page: Page, text: string, doneId: string): Promise<void> {
  const before = (await tid(page, "interviewer-text").innerText()).trim();
  await page.waitForTimeout(THINK_MS);
  await tid(page, "answer-input").fill(text);
  await tid(page, "send-answer").click();
  await expect
    .poll(
      async () => {
        if (await tid(page, doneId).count()) return "done";
        const now = (await tid(page, "interviewer-text").innerText()).trim();
        const open = await tid(page, "answer-input").isEnabled().catch(() => false);
        return now === before || !open ? "waiting" : "next";
      },
      { timeout: 45_000, intervals: [300] },
    )
    .not.toBe("waiting");
}

test.describe("job interview", () => {
  test.skip(!PASSCODE, "set E2E_ORGANISER_PASSCODE to run the job interview");
  test.use({ actionTimeout: 30_000, navigationTimeout: 60_000 });
  test.describe.configure({ mode: "serial" });

  test("apply, job interview, own ratings, organiser checks the order, company sees it, both agree to meet", async ({ browser }) => {
    test.setTimeout(15 * 60_000);
    const problems: string[] = [];
    const watch = (context: BrowserContext, who: string) =>
      context.on("response", (r) => {
        if (r.status() >= 500) problems.push(`${who}: ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
      });

    const organiserContext = await browser.newContext();
    const talentContext = await browser.newContext();
    const companyContext = await browser.newContext();
    watch(organiserContext, "organiser");
    watch(talentContext, "talent");
    watch(companyContext, "company");
    const organiser = await organiserContext.newPage();
    const talent = await talentContext.newPage();
    const company = await companyContext.newPage();
    let handle = "";
    let applicationPath = "";
    let companyPath = "";
    let simulated = 0;
    let covered = 0;

    await test.step("before: reset the demo; the pitch company's job has simulated applicants and no approved list", async () => {
      await signInOrganiser(organiser);
      await resetDemo(organiser);
      await organiser.goto("/organiser/applicants", { waitUntil: "domcontentloaded" });
      const job = tid(organiser, "applicants-job").filter({ hasText: PITCH_COMPANY });
      await expect(job).toHaveCount(1, { timeout: 20_000 });
      await job.getByRole("link").click();
      await organiser.waitForURL(/\/organiser\/applicants\/[^/]+$/, { timeout: 30_000 });
      await expect(tid(organiser, "ranked-applicant").first()).toBeVisible({ timeout: 30_000 });
      simulated = await tid(organiser, "ranked-applicant").count();
      expect(simulated).toBeGreaterThanOrEqual(2);
      await expect(tid(organiser, "ranked-status")).toHaveAttribute("data-state", "none");
      await expect(tid(organiser, "ranked-company-link")).toHaveCount(0);
    });

    await test.step("1. the general interview and an approved card: without a card nobody can apply", async () => {
      await talent.goto("/interview", { waitUntil: "domcontentloaded" });
      await expect(async () => {
        await tid(talent, "consent-interview").check();
        await tid(talent, "consent-live-demo").check();
        await tid(talent, "mode-express").check();
        await expect(tid(talent, "start-interview")).toBeEnabled({ timeout: 1_000 });
      }).toPass({ timeout: 90_000 });
      await tid(talent, "start-interview").click();
      await talent.waitForURL(/\/interview\/[^/]+$/, { timeout: 30_000 });
      await expect(tid(talent, "interviewer-text")).toBeVisible({ timeout: 30_000 });
      for (let i = 0; i < 12; i++) {
        if (await tid(talent, "interview-done").count()) break;
        await answerAndWait(talent, CARD_ANSWERS[Math.min(i, CARD_ANSWERS.length - 1)], "interview-done");
      }
      await expect(tid(talent, "interview-done")).toBeVisible({ timeout: 30_000 });
      await tid(talent, "go-to-card").click({ timeout: 120_000 });
      await talent.waitForURL(/\/card/, { timeout: 30_000 });
      await expect(tid(talent, "card-signal").first()).toBeVisible({ timeout: 120_000 });
      await tid(talent, "approve-card").click();
      await expect(tid(talent, "card-approved")).toBeVisible({ timeout: 30_000 });
      const card = (await (await talentContext.request.get("/api/card")).json()) as { handle?: string };
      handle = card.handle ?? "";
      expect(handle).not.toBe("");
    });

    await test.step("2. choose a job: the event's jobs, each with what its ad asks for", async () => {
      await talent.goto("/apply", { waitUntil: "domcontentloaded" });
      const job = tid(talent, "apply-job").filter({ hasText: PITCH_COMPANY });
      await expect(job).toHaveCount(1, { timeout: 30_000 });
      expect(await tid(talent, "apply-job").count()).toBeGreaterThanOrEqual(2);
      await tid(job, "apply-start").click();
      await talent.waitForURL(/\/apply\/new\?job=/, { timeout: 30_000 });
    });

    await test.step("3. told beforehand: rated by an AI against the ad, ranked, checked by an organiser; nothing starts without a yes", async () => {
      await expect(tid(talent, "apply-start-form")).toBeVisible({ timeout: 20_000 });
      await expect(tid(talent, "apply-points-list")).toContainText(/rated|rates/i);
      await expect(tid(talent, "apply-points-list")).toContainText(/organiser/i);
      await expect(tid(talent, "apply-begin")).toBeDisabled();
      await expect(async () => {
        await tid(talent, "apply-consent").check();
        await expect(tid(talent, "apply-begin")).toBeEnabled({ timeout: 1_000 });
      }).toPass({ timeout: 60_000 });
      await tid(talent, "apply-begin").click();
      await talent.waitForURL(/\/apply\/app_[^/]+$/, { timeout: 60_000 });
      applicationPath = new URL(talent.url()).pathname;
      await expect(tid(talent, "interviewer-text")).toBeVisible({ timeout: 30_000 });
    });

    await test.step("4. the job interview: one question per thing the ad asks for, at most one follow-up each", async () => {
      covered = await tid(talent, "apply-requirement").count();
      expect(covered).toBeGreaterThanOrEqual(1);
      expect(covered).toBeLessThanOrEqual(6);
      const asked = new Map<string, number>();
      for (let i = 0; i < 2 * covered + 3; i++) {
        if (await tid(talent, "apply-ended").count()) break;
        const now = talent.locator('[data-testid="apply-requirement"][data-now="true"]');
        const id = (await now.getAttribute("data-requirement-id").catch(() => null)) ?? "";
        const requirement = id ? await now.innerText() : "";
        const times = asked.get(id) ?? 0;
        asked.set(id, times + 1);
        // One question and at most one follow-up for each thing the ad asks for.
        expect(times, `questions about "${requirement.slice(0, 60)}"`).toBeLessThan(2);
        const say = JOB_ANSWERS.find((a) => a.about.test(requirement)) ?? DEFAULT_ANSWER;
        await answerAndWait(talent, times === 0 ? say.first : say.then, "apply-ended");
      }
      await expect(tid(talent, "apply-ended")).toBeVisible({ timeout: 30_000 });
      // Everything asked was answered: nothing is left waiting.
      await expect(talent.locator('[data-testid="apply-requirement"][data-progress="waiting"]')).toHaveCount(0);
    });

    await test.step("5. read it through, then send: nothing is rated before the person sends it", async () => {
      await tid(talent, "apply-to-review").click();
      await expect(tid(talent, "apply-review")).toBeVisible({ timeout: 30_000 });
      expect(await tid(talent, "apply-answer").count()).toBeGreaterThanOrEqual(covered);
      await tid(talent, "apply-send").click();
      // The rating is made in the background; the page shows it when it is there.
      await expect(tid(talent, "apply-result")).toBeVisible({ timeout: 180_000 });
    });

    await test.step("6. the person's own ratings: a level and a reason for every requirement, and their points", async () => {
      await expect(tid(talent, "apply-rating")).toHaveCount(covered);
      const levels = await tid(talent, "apply-rating").evaluateAll((els) => els.map((el) => Number(el.getAttribute("data-level"))));
      expect(levels.every((l) => l >= 0 && l <= 3)).toBe(true);
      // The concrete examples count, and the plain "not yet" about Finnish is not dressed up.
      expect(Math.max(...levels)).toBeGreaterThanOrEqual(2);
      await expect(tid(talent, "apply-points")).toBeVisible();
      await expect(tid(talent, "apply-organiser-note")).toBeVisible();
      // No place on a list yet: no organiser has approved one.
      await expect(tid(talent, "apply-position")).toHaveCount(0);
      test.info().annotations.push({ type: "own levels", description: levels.join(" ") });
    });

    await test.step("7. the organiser: everyone is on the list, the answers behind a rating can be read", async () => {
      await organiser.reload({ waitUntil: "domcontentloaded" });
      await expect(tid(organiser, "ranked-applicant")).toHaveCount(simulated + 1, { timeout: 30_000 });
      const mine = tid(organiser, "ranked-applicant").filter({ hasText: handle });
      await expect(mine).toHaveCount(1);
      await expect(tid(mine, "ranked-points")).toBeVisible();
      await expect(tid(mine, "ranked-rating")).toHaveCount(covered);
      await tid(mine, "ranked-read-answers").click();
      await expect(tid(mine, "ranked-evidence")).toBeVisible({ timeout: 20_000 });
      // The person's own words, as they said them.
      await expect(tid(mine, "ranked-evidence")).toContainText("machine shop");
    });

    await test.step("8. the organiser moves one person, which needs a reason, and approves the order", async () => {
      const mine = tid(organiser, "ranked-applicant").filter({ hasText: handle });
      const from = Number(await mine.getAttribute("data-position"));
      const to = from === 1 ? 2 : 1;
      await tid(mine, "ranked-move").click();
      await tid(mine, "ranked-move-position").fill(String(to));
      await expect(tid(mine, "ranked-move-confirm")).toBeDisabled();
      await tid(mine, "ranked-move-reason").fill("Spoke with the person at the event: the ERP work is the same kind as this job's.");
      await tid(mine, "ranked-move-confirm").click();
      await expect(tid(organiser, "ranked-applicant").filter({ hasText: handle })).toHaveAttribute("data-position", String(to), { timeout: 20_000 });
      await expect(tid(tid(organiser, "ranked-applicant").filter({ hasText: handle }), "ranked-pinned")).toBeVisible();

      await tid(organiser, "ranked-approve").click();
      await expect(tid(organiser, "ranked-status")).toHaveAttribute("data-state", "approved", { timeout: 30_000 });
      const link = tid(organiser, "ranked-company-link");
      await expect(link).toBeVisible();
      companyPath = (await link.getAttribute("href")) ?? "";
      expect(companyPath).toMatch(/^\/c\/[\w-]{20,}\/applicants$/);
    });

    await test.step("9. the company sees the approved order with reasons, and no name or own words", async () => {
      await company.goto(companyPath, { waitUntil: "domcontentloaded" });
      await expect(tid(company, "company-applicant")).toHaveCount(simulated + 1, { timeout: 30_000 });
      const positions = await tid(company, "company-applicant").evaluateAll((els) => els.map((el) => Number(el.getAttribute("data-position"))));
      expect(positions).toEqual(positions.map((_, i) => i + 1));
      const mine = tid(company, "company-applicant").filter({ hasText: handle });
      await expect(tid(mine, "company-rating").first()).toBeVisible();
      await expect(tid(company, "revealed-name")).toHaveCount(0);
      await expect(company.locator("body")).not.toContainText("machine shop");
      await tid(mine, "ask-to-meet").click();
      await tid(company, "ask-to-meet-send").click();
      await expect(tid(tid(company, "company-applicant").filter({ hasText: handle }), "intro-status")).toBeVisible({ timeout: 20_000 });
    });

    await test.step("10. the person sees their place on the approved list, and agrees to meet", async () => {
      await talent.goto(applicationPath, { waitUntil: "domcontentloaded" });
      await expect(tid(talent, "apply-position")).toBeVisible({ timeout: 30_000 });
      await talent.goto("/matches", { waitUntil: "domcontentloaded" });
      const request = tid(talent, "intro-request").filter({ hasText: PITCH_COMPANY });
      await expect(request).toBeVisible({ timeout: 30_000 });
      await tid(request, "intro-accept").click();
      await tid(request, "intro-name").fill("Alex Demo");
      await tid(request, "intro-contact").fill("alex.demo@example.test");
      await tid(request, "intro-confirm").click();
      await expect(tid(request, "intro-status")).toHaveAttribute("data-status", "accepted", { timeout: 20_000 });
    });

    await test.step("11. only now the company sees the name and the person's own answers", async () => {
      await company.goto(companyPath, { waitUntil: "domcontentloaded" });
      const mine = tid(company, "company-applicant").filter({ hasText: handle });
      await expect(tid(mine, "revealed-name")).toContainText("Alex Demo", { timeout: 20_000 });
      await expect(tid(mine, "ranked-evidence")).toContainText("machine shop");
    });

    await test.step("12. the audit log holds every step", async () => {
      await organiser.goto("/organiser/audit", { waitUntil: "domcontentloaded" });
      await expect(tid(organiser, "audit-row").first()).toBeVisible({ timeout: 20_000 });
      for (const action of ["ranking.approved", "ranking.moved", "application.assessed", "application.submitted", "application.started"]) {
        await expect(organiser.locator(`[data-testid="audit-row"][data-action="${action}"]`).first(), `audit row ${action}`).toBeVisible();
      }
    });

    if (!KEEP) {
      await test.step("afterwards: reset the demo", async () => {
        await resetDemo(organiser);
      });
    }
    expect(problems, "no request on the path may answer with a server error").toEqual([]);
    await organiserContext.close();
    await talentContext.close();
    await companyContext.close();
  });
});
