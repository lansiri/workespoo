import path from "node:path";
import { existsSync } from "node:fs";
import { chromium, devices, expect, firefox, test, type BrowserContextOptions, type Page } from "@playwright/test";

/**
 * Speaking to the interviewer, end to end: a browser whose microphone is a recording, the talk
 * button held while the recording plays, and the words arriving as the person's answer.
 *
 *   E2E_BASE_URL=https://workespoo.aichat.fi npx playwright test voice
 *
 * It needs a deployment whose `/api/voice/config` says `server` (speech is turned into text on
 * our own server); elsewhere the tests are skipped. Each test starts one live demo interview,
 * which the deployment deletes after 24 hours. The recordings are synthetic (e2e/fixtures).
 */

const BASE = process.env.E2E_BASE_URL ?? "https://workespoo.aichat.fi";
const CLIP_SECONDS = 12.3;

// `pause`: the recording has a pause long enough to cut at, so its first part must be on screen
// while the button is still held. The Swedish one is spoken without such a pause.
const CLIPS = {
  en: { file: "voice-en.wav", pause: true, heard: [/four years/i, /machine shop/i, /python/i, /every night/i] },
  fi: { file: "voice-fi.wav", pause: true, heard: [/neljä vuotta/i, /järjestelmä/i, /joka yö/i] },
  sv: { file: "voice-sv.wav", pause: false, heard: [/fyra år/i, /verkstad/i, /varje natt/i] },
} as const;
type Lang = keyof typeof CLIPS;

const tid = (page: Page, id: string) => page.locator(`[data-testid="${id}"]`);

/** A browser whose microphone plays one recording, once, each time the microphone is opened. */
async function voiceBrowser(lang: Lang, options: BrowserContextOptions = {}) {
  const wav = path.resolve(__dirname, "fixtures", CLIPS[lang].file);
  const browser = await chromium.launch({
    ...(process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {}),
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}%noloop`],
  });
  const context = await browser.newContext({ baseURL: BASE, permissions: ["microphone"], ...options });
  return { browser, context, page: await context.newPage() };
}

/** Consent with voice, express mode, in the given language; resolves in the interview room. */
async function startInterview(page: Page, lang: Lang) {
  await page.goto("/interview", { waitUntil: "load" });
  await tid(page, "interview-language").selectOption(lang);
  await tid(page, "consent-interview").check();
  await tid(page, "consent-voice").check();
  await tid(page, "consent-live-demo").check();
  await tid(page, "mode-express").check();
  await tid(page, "start-interview").click();
  await page.waitForURL(/\/interview\/[^/]+$/, { timeout: 30_000 });
  await expect(tid(page, "interviewer-text")).not.toBeEmpty({ timeout: 30_000 });
  await expect(tid(page, "talk-button")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
}

/** What every variant checks once the button has been let go. */
async function expectAnswer(page: Page, lang: Lang, releasedAt: number) {
  const final = tid(page, "voice-final");
  for (const words of CLIPS[lang].heard) await expect(final).toHaveText(words, { timeout: 30_000 });
  const seconds = (Date.now() - releasedAt) / 1000;
  console.log(`[voice ${lang}] text ${seconds.toFixed(1)} s after release: ${(await final.textContent())?.trim()}`);
  // The words went in as the person's answer, and the interviewer goes on from them.
  await expect(tid(page, "transcript")).toContainText(CLIPS[lang].heard[0], { timeout: 30_000 });
}

test.describe("speaking to the interviewer", () => {
  test.describe.configure({ mode: "serial", timeout: 150_000 });

  test.beforeAll(async ({ request }) => {
    const config = await (await request.get(`${BASE}/api/voice/config`)).json();
    test.skip(config.adapter !== "server", `voice here is "${config.adapter}", not our own server`);
  });

  for (const lang of ["en", "fi", "sv"] as const) {
    test(`a spoken answer in ${lang} becomes the person's words (mouse)`, async () => {
      const { browser, page } = await voiceBrowser(lang);
      try {
        const failed: string[] = [];
        page.on("response", (r) => {
          if (r.url().includes("/api/voice/") && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
        });
        await startInterview(page, lang);
        const box = (await tid(page, "talk-button").boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        const pressedAt = Date.now();
        await expect(tid(page, "voice-status")).toHaveText("listening", { timeout: 10_000 });
        if (CLIPS[lang].pause) {
          // While the button is still held, the first part of the answer is already on screen.
          await expect(tid(page, "voice-partial")).toHaveText(CLIPS[lang].heard[0], { timeout: CLIP_SECONDS * 1000 });
          console.log(`[voice ${lang}] first words on screen ${((Date.now() - pressedAt) / 1000).toFixed(1)} s into the answer`);
        }
        await page.waitForTimeout(Math.max(0, pressedAt + (CLIP_SECONDS + 1) * 1000 - Date.now())); // to the end of the recording
        await page.mouse.up();
        await expectAnswer(page, lang, Date.now());
        expect(failed).toEqual([]);
      } finally {
        await browser.close();
      }
    });
  }

  test("a phone: the button held with a finger", async () => {
    const { browser, context, page } = await voiceBrowser("en", { ...devices["Pixel 7"] });
    try {
      await startInterview(page, "en");
      const button = tid(page, "talk-button");
      await button.scrollIntoViewIfNeeded();
      const box = (await button.boundingBox())!;
      const point = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...point, id: 1 }] });
      await expect(tid(page, "voice-status")).toHaveText("listening", { timeout: 10_000 });
      // A long press must not be taken for a scroll, a selection or a context menu: still listening at the end.
      await page.waitForTimeout((CLIP_SECONDS + 1) * 1000);
      await expect(tid(page, "voice-status")).toHaveText("listening");
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expectAnswer(page, "en", Date.now());
    } finally {
      await browser.close();
    }
  });

  test("Firefox: what is sent is the microphone's sound, at the right speed and length", async () => {
    test.skip(!existsSync(firefox.executablePath()), "Firefox for Playwright is not installed (npx playwright install firefox)");
    // Firefox's own fake microphone is a steady tone. Nothing can be recognised in it, which is the
    // point: this checks the capture, the change of sample rate and the upload in a second engine.
    // The path and the empty argument list are spelled out because Playwright Test hands every
    // launch the project's own launch options, which here are Chromium's.
    const browser = await firefox.launch({
      executablePath: firefox.executablePath(),
      args: [],
      firefoxUserPrefs: { "media.navigator.streams.fake": true, "media.navigator.permission.disabled": true },
    });
    try {
      const context = await browser.newContext({ baseURL: BASE });
      const page = await context.newPage();
      const sent: { status: number; bytes: number; hz: number }[] = [];
      page.on("requestfinished", (request) => {
        if (!request.url().endsWith("/api/voice/stt")) return;
        void (async () => {
          const body = request.postDataBuffer();
          const response = await request.response();
          let crossings = 0;
          const n = body ? Math.floor(body.length / 2) : 0;
          for (let i = 1; i < n; i += 1) if (body!.readInt16LE((i - 1) * 2) <= 0 && body!.readInt16LE(i * 2) > 0) crossings += 1;
          sent.push({ status: response?.status() ?? 0, bytes: body?.length ?? 0, hz: n ? Math.round(crossings / (n / 16000)) : 0 });
        })();
      });
      await startInterview(page, "en");
      // The tone's pitch as this browser's own audio clock hears it, to compare the upload against.
      const nativeHz = await page.evaluate(async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ctx = new AudioContext();
        const node = ctx.createScriptProcessor(4096, 1, 1);
        const mute = ctx.createGain();
        mute.gain.value = 0;
        let crossings = 0;
        let samples = 0;
        let last = 0;
        node.onaudioprocess = (e) => {
          for (const v of e.inputBuffer.getChannelData(0)) {
            if (last <= 0 && v > 0) crossings += 1;
            last = v;
            samples += 1;
          }
        };
        ctx.createMediaStreamSource(stream).connect(node);
        node.connect(mute);
        mute.connect(ctx.destination);
        await new Promise((r) => setTimeout(r, 1500));
        stream.getTracks().forEach((t) => t.stop());
        await ctx.close();
        return samples ? crossings / (samples / ctx.sampleRate) : 0;
      });
      expect(nativeHz).toBeGreaterThan(100);

      const box = (await tid(page, "talk-button").boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await expect(tid(page, "voice-status")).toHaveText("listening", { timeout: 10_000 });
      await page.waitForTimeout(4000);
      await page.mouse.up();
      await expect(tid(page, "voice-status")).toHaveText("idle", { timeout: 20_000 });
      await expect.poll(() => sent.length, { timeout: 10_000 }).toBeGreaterThan(0);

      const total = sent.reduce((a, r) => a + r.bytes, 0);
      console.log(`[voice firefox] tone ${nativeHz.toFixed(0)} Hz in the page; sent ${JSON.stringify(sent)}`);
      for (const r of sent) expect(r.status).toBe(200);
      // About four seconds of 16 kHz 16-bit audio, plus the short tail after release.
      expect(total).toBeGreaterThan(3.3 * 32000);
      expect(total).toBeLessThan(5.5 * 32000);
      // The same pitch after the change of sample rate: off by more than a few percent would mean the wrong rate.
      for (const r of sent) expect(Math.abs(r.hz - nativeHz) / nativeHz).toBeLessThan(0.04);
    } finally {
      await browser.close();
    }
  });

  test("a short tap sends nothing and leaves the button ready", async () => {
    const { browser, page } = await voiceBrowser("en");
    try {
      await startInterview(page, "en");
      const before = await tid(page, "transcript").innerText();
      const box = (await tid(page, "talk-button").boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(120);
      await page.mouse.up();
      await expect(tid(page, "voice-status")).toHaveText("idle", { timeout: 15_000 });
      await expect(tid(page, "talk-button")).toHaveAttribute("data-state", "ready");
      expect(await tid(page, "transcript").innerText()).toBe(before);
    } finally {
      await browser.close();
    }
  });
});
