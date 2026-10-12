import { defineConfig, devices } from "@playwright/test";
import { LIVE_BASE_URL } from "./logger/tests/live/project.mjs";

const iphone = devices["iPhone 15 Pro"];
const liveUse = {
  ...iphone,
  browserName: "chromium",
  defaultBrowserType: "chromium",
  launchOptions: {
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  },
};

// Deployed GitHub Pages only. This config is not used by PR smoke.
// The page check runs before the account delete. Run it with: npm run pw:live
export default defineConfig({
  testDir: "logger/tests/live",
  testMatch: "*.spec.mjs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  globalSetup: "logger/tests/live/global-setup.mjs",
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: LIVE_BASE_URL,
    trace: "off",
    screenshot: "off",
    video: "off",
    serviceWorkers: "block",
    colorScheme: "dark",
    timezoneId: "UTC",
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "live-boot",
      testMatch: /boot\.spec\.mjs/,
      use: liveUse,
    },
    {
      name: "live-purge",
      testMatch: /account-purge\.spec\.mjs/,
      dependencies: ["live-boot"],
      use: liveUse,
    },
  ],
});
