import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // One at a time: the journeys share one demo world and two of them reset it, so two running
  // side by side wipe each other's person in the middle of the run.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://workespoo.aichat.fi",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
          // A machine whose Playwright browser download does not match the installed package can point at its own Chromium.
          ...(process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {}),
        },
      },
    },
  ],
});
