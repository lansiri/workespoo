/**
 * The demo as a test: one person's interview becomes a card, an organiser approves picks one by
 * one, a company asks to meet, the person accepts, and both sides see each other
 * (docs/specs/demo-script.md). It runs against a real deployment with the real model.
 *
 *   E2E_BASE_URL=https://workespoo.aichat.fi E2E_ORGANISER_PASSCODE=... npx playwright test golden-path
 *
 * It needs the seeded demo world and its snapshot (the test resets the demo first and last), so it
 * is skipped when no organiser passcode is given. Every element is found by the test ids of
 * docs/ROUTES.md; the pitch company is "Demo company 03".
 */
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

const PASSCODE = process.env.E2E_ORGANISER_PASSCODE ?? "";
const PITCH_COMPANY = "Demo company 03";
/** Leave the world as the journey made it (for looking at it afterwards) instead of resetting. */
const KEEP = process.env.E2E_KEEP === "1";

/** What the presenter says, in order. The last one repeats when the interviewer asks more. */
const ANSWERS = [
  "For the last four years I've worked at a machine shop as the person who looks after our ERP system. I set up new items and work orders, and I wrote Python scripts that move production data from the machines into the ERP every night.",
  "Last spring the stock numbers in the ERP kept drifting from what was on the shelves. I traced it to a scanner integration that dropped lines when two people scanned at once, rewrote the import with a queue, and added a SQL check that compares the counts every morning.",
  "Python and SQL every day, the ERP's own report builder, and Excel when the production planners want a quick view. I also keep the integration between the ERP and the label printers running.",
  "I train the production staff when we change a process. Last year I wrote the instructions for the new work order flow and ran six short sessions on the shop floor.",
  "I'd like a role developing ERP and production systems, close to the people who use them. I work in English and I'm learning Finnish.",
  "No, I think that covers it.",
];

/** How long the test "reads" each question before answering. */
const THINK_MS = 4_000;

const tid = (scope: Page | Locator, id: string) => scope.locator(`[data-testid="${id}"]`);

async function signInOrganiser(page: Page): Promise<void> {
  await page.goto("/organiser", { waitUntil: "domcontentloaded" });
  if (await tid(page, "passcode-input").count()) {
    // Typing before the page is interactive is lost: type until the button takes it.
    await expect(async () => {
      await tid(page, "passcode-input").fill(PASSCODE);
      await expect(tid(page, "passcode-submit")).toBeEnabled({ timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
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

/** The pitch company's section of the review queue. */
function pitchDigest(page: Page): Locator {
  return tid(page, "review-digest").filter({ hasText: PITCH_COMPANY });
}

test.describe("golden path", () => {
  test.skip(!PASSCODE, "set E2E_ORGANISER_PASSCODE to run the golden path");
  // No click or page load may wait silently until the whole test times out.
  test.use({ actionTimeout: 30_000, navigationTimeout: 60_000 });
  test.describe.configure({ mode: "serial" });

  test("interview, card, picks, ask to meet, mutual yes, audit trail", async ({ browser }) => {
    test.setTimeout(12 * 60_000);
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
    let companyPath = "";

    await test.step("before going on stage: reset the demo; the pitch company has no picks yet", async () => {
      await signInOrganiser(organiser);
      await resetDemo(organiser);
      await organiser.goto("/organiser/review", { waitUntil: "domcontentloaded" });
      await expect(tid(organiser, "run-daily")).toBeVisible({ timeout: 20_000 });
      await expect(tid(organiser, "review-company").filter({ hasText: PITCH_COMPANY })).toHaveCount(0);
    });

    await test.step("1. consent and start: the person is told it is an AI and what happens to the notes", async () => {
      await talent.goto("/interview", { waitUntil: "domcontentloaded" });
      // Ticks made before the page is interactive are lost: tick until Start is offered.
      await expect(async () => {
        await tid(talent, "consent-interview").check();
        await tid(talent, "consent-live-demo").check();
        await tid(talent, "mode-express").check();
        await expect(tid(talent, "start-interview")).toBeEnabled({ timeout: 1_000 });
      }).toPass({ timeout: 30_000 });
      await tid(talent, "start-interview").click();
      await talent.waitForURL(/\/interview\/[^/]+$/, { timeout: 30_000 });
      await expect(tid(talent, "interviewer-text")).toBeVisible({ timeout: 30_000 });
    });

    await test.step("2. the interview: notes appear while the person talks", async () => {
      for (let i = 0; i < 12; i++) {
        if (await tid(talent, "interview-done").count()) break;
        const before = (await tid(talent, "interviewer-text").innerText()).trim();
        // A person reads the question before answering; the notes of the last answer land meanwhile.
        await talent.waitForTimeout(THINK_MS);
        await tid(talent, "answer-input").fill(ANSWERS[Math.min(i, ANSWERS.length - 1)]);
        await tid(talent, "send-answer").click();
        // The next question, or the end of the interview.
        await expect
          .poll(
            async () => {
              if (await tid(talent, "interview-done").count()) return "done";
              // The next question has arrived when the interviewer's line has changed and the answer box takes text again.
              const now = (await tid(talent, "interviewer-text").innerText()).trim();
              const open = await tid(talent, "answer-input").isEnabled().catch(() => false);
              return now === before || !open ? "waiting" : "next";
            },
            { timeout: 45_000, intervals: [300] },
          )
          .not.toBe("waiting");
      }
      await expect(tid(talent, "interview-done")).toBeVisible({ timeout: 30_000 });
      // Notes are taken in the background after each answer: wait for them, do not race them.
      await expect.poll(() => tid(talent, "signal-chip").count(), { timeout: 45_000 }).toBeGreaterThan(0);
    });

    await test.step("3. the card: every note shows the person's own words; declare a language, approve, join the pool", async () => {
      await tid(talent, "go-to-card").click({ timeout: 120_000 });
      await talent.waitForURL(/\/card/, { timeout: 30_000 });
      await expect(tid(talent, "card-signal").first()).toBeVisible({ timeout: 120_000 });
      expect(await tid(talent, "card-signal").count()).toBeGreaterThanOrEqual(3);
      await expect(tid(talent, "signal-quote").first()).toBeVisible();
      // The person says which languages they work in; the interview never infers that.
      await tid(talent, "looking-for-languages").fill("English");
      await tid(talent, "looking-for-save").click();
      await expect(tid(talent, "looking-for-save")).toBeEnabled({ timeout: 20_000 });
      await tid(talent, "approve-card").click();
      await expect(tid(talent, "card-approved")).toBeVisible({ timeout: 30_000 });
      // Nothing is chosen for the person: joining the pool is their own choice, after approving.
      await expect(tid(talent, "pool-opt-in")).not.toBeChecked();
      // The choice shows as made once the server has stored it, so click and then wait for it.
      await tid(talent, "pool-opt-in").click();
      await expect(tid(talent, "pool-opt-in")).toBeChecked({ timeout: 20_000 });
      const card = (await (await talentContext.request.get("/api/card")).json()) as { handle?: string };
      handle = card.handle ?? "";
      expect(handle).not.toBe("");

      await tid(talent, "go-to-matches").click();
      await talent.waitForURL(/\/matches/, { timeout: 30_000 });
      await expect(tid(talent, "job-match").first()).toBeVisible({ timeout: 60_000 });
      await expect(tid(talent, "match-reason").first()).toBeVisible();
      await expect(tid(talent, "source-attribution").first()).toBeVisible();
    });

    await test.step("4. the organiser runs today's picks: the new person is suggested to the pitch company", async () => {
      await organiser.goto("/organiser/review", { waitUntil: "domcontentloaded" });
      const started = Date.now();
      await tid(organiser, "run-daily").click();
      // The queue shows one company at a time: the pitch company appears in the rail, and is opened from there.
      const inRail = tid(organiser, "review-company").filter({ hasText: PITCH_COMPANY });
      await expect(inRail).toBeVisible({ timeout: 90_000 });
      await inRail.click();
      await expect(pitchDigest(organiser)).toBeVisible({ timeout: 20_000 });
      await expect(tid(pitchDigest(organiser), "review-pick").filter({ hasText: handle })).toBeVisible({ timeout: 30_000 });
      await expect(tid(organiser, "order-note")).toBeVisible();
      test.info().annotations.push({ type: "picks drafted in", description: `${Math.round((Date.now() - started) / 1000)} s` });
    });

    await test.step("5. every pick is decided one by one; a removal needs a reason; then publish", async () => {
      const digest = pitchDigest(organiser);
      const picks = tid(digest, "review-pick");
      const total = await picks.count();
      expect(total).toBeGreaterThanOrEqual(1);
      // Remove one pick that is not the new person's, when there is one, with a reason.
      const others = picks.filter({ hasNotText: handle });
      if ((await others.count()) > 0) {
        const removedId = (await others.first().getAttribute("data-pick-id")) ?? "";
        const one = organiser.locator(`[data-testid="review-pick"][data-pick-id="${removedId}"]`);
        await tid(one, "pick-remove").click();
        // The reason is asked in a dialog; nothing is chosen for the organiser, and without a reason it cannot be confirmed.
        const dialog = tid(organiser, "pick-remove-panel");
        await expect(dialog).toBeVisible();
        await expect(tid(organiser, "pick-remove-confirm")).toBeDisabled();
        await tid(organiser, "pick-remove-reason").first().check();
        await tid(organiser, "pick-remove-confirm").click();
        await expect(dialog).toHaveCount(0, { timeout: 20_000 });
        // The person stays on the list, shown as removed, with the reason beside them.
        await expect(tid(one, "pick-status")).toHaveAttribute("data-status", "removed", { timeout: 20_000 });
      }
      // There is no "approve all": approve what is left, one person at a time.
      const ids = await picks.evaluateAll((els) => els.map((el) => el.getAttribute("data-pick-id") ?? ""));
      expect(ids.every((id) => id !== "")).toBe(true);
      for (const id of ids) {
        const one = organiser.locator(`[data-testid="review-pick"][data-pick-id="${id}"]`);
        if ((await tid(one, "pick-status").count()) > 0) continue; // already decided (the removed one)
        await tid(one, "pick-approve").click();
        await expect(tid(one, "pick-status")).toBeVisible({ timeout: 20_000 });
      }
      await expect(tid(digest, "pick-approve")).toHaveCount(0);
      await tid(digest, "publish-digest").click();
      const link = tid(pitchDigest(organiser), "digest-link");
      await expect(link).toBeVisible({ timeout: 30_000 });
      companyPath = (await link.getAttribute("href")) ?? "";
      expect(companyPath).toMatch(/^\/c\/[\w-]{20,}$/);
    });

    await test.step("6. the company's page: masked employer, picks with reasons and no names", async () => {
      await company.goto(companyPath, { waitUntil: "domcontentloaded" });
      await expect(tid(company, "masked-banner")).toBeVisible({ timeout: 20_000 });
      const pick = tid(company, "pick-card").filter({ hasText: handle });
      await expect(pick).toBeVisible();
      await expect(tid(pick, "pick-reason").first()).toBeVisible();
      await expect(tid(company, "revealed-name")).toHaveCount(0);
    });

    await test.step("7. the Need Card asks the employer a question; the company answers it and asks to meet", async () => {
      await tid(company, "need-link").first().click();
      await company.waitForURL(/\/c\/[^/]+\/need\/[^/]+$/, { timeout: 30_000 });
      await expect(tid(company, "need-title")).toBeVisible({ timeout: 20_000 });
      // The must-have Finnish requirement comes back to the employer as a question, with evidence from the pool.
      const asked = tid(company, "requirement").filter({ has: tid(company, "question-answer-make_nice") }).filter({ hasText: /Finnish/ });
      await expect(asked).toHaveCount(1);
      await expect(tid(asked, "requirement-question")).toContainText(/from day one/i);
      await expect(tid(asked, "pool-evidence")).toContainText(/\d+ of \d+/);
      const answeredBefore = await tid(company, "question-answered").count();
      await tid(asked, "question-answer-make_nice").click();
      await expect(tid(company, "question-answered")).toHaveCount(answeredBefore + 1, { timeout: 20_000 });

      await company.goto(companyPath, { waitUntil: "domcontentloaded" });
      const pick = tid(company, "pick-card").filter({ hasText: handle });
      await tid(pick, "ask-to-meet").click();
      await tid(pick, "ask-to-meet-send").click();
      await expect(tid(pick, "intro-status")).toBeVisible({ timeout: 20_000 });
    });

    await test.step("8. the person sees who is asking, accepts, and only then gives a name", async () => {
      await talent.goto("/matches", { waitUntil: "domcontentloaded" });
      const request = tid(talent, "intro-request").filter({ hasText: PITCH_COMPANY });
      await expect(request).toBeVisible({ timeout: 30_000 });
      await tid(request, "intro-accept").click();
      await tid(request, "intro-name").fill("Alex Demo");
      await tid(request, "intro-contact").fill("alex.demo@example.test");
      await tid(request, "intro-confirm").click();
      // Stored and shown as accepted before anyone else looks.
      await expect(tid(request, "intro-status")).toHaveAttribute("data-status", "accepted", { timeout: 20_000 });
    });

    await test.step("9. the company now sees the name and the person's own words", async () => {
      await company.goto(companyPath, { waitUntil: "domcontentloaded" });
      await expect(tid(company, "revealed-name").filter({ hasText: "Alex Demo" })).toBeVisible({ timeout: 20_000 });
      await expect(tid(company, "revealed-quote").first()).toBeVisible();
    });

    await test.step("10. the audit log holds every step", async () => {
      await organiser.goto("/organiser/audit", { waitUntil: "domcontentloaded" });
      await expect(tid(organiser, "audit-row").first()).toBeVisible({ timeout: 20_000 });
      for (const action of ["identity.revealed", "intro.accepted", "intro.requested", "needcard.question_answered", "digest.published", "pick.approved", "pick.drafted"]) {
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
