import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

function freePort() {
  const out = execFileSync(process.execPath, [
    "-e",
    "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close();});",
  ], { encoding: "utf8" });
  const picked = Number(String(out).trim());
  if (!picked) throw new Error("Could not allocate a free port for the Playwright web server.");
  return picked;
}

// INSIGHT_TEST_PORT (or PW_PORT) pins the port. Otherwise take a free one.
// This file is loaded again in workers and globalSetup. The first load publishes
// the chosen port on the environment those processes inherit, so they share it.
function resolvePort() {
  const raw = process.env.INSIGHT_TEST_PORT || process.env.PW_PORT;
  if (raw) {
    const pinned = Number(raw);
    if (!Number.isInteger(pinned) || pinned <= 0 || pinned > 65535) {
      throw new Error(`INSIGHT_TEST_PORT must be a TCP port, got ${raw}`);
    }
    return pinned;
  }
  const picked = freePort();
  process.env.INSIGHT_TEST_PORT = String(picked);
  process.env.PW_PORT = String(picked);
  return picked;
}

const port = resolvePort();
// The service worker registers only on localhost or https, not 127.0.0.1.
const baseURL = `http://localhost:${port}`;

const iphone = {
  ...devices["iPhone 15 Pro"],
  colorScheme: "dark",
  // Seed dates are UTC. Pin the browser clock so "today" matches the stub.
  timezoneId: "UTC",
};

export default defineConfig({
  testDir: "logger/tests/e2e",
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  // A pass on retry is reported as flaky. Target stays under 2%.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  globalSetup: "logger/tests/e2e/fixtures/assert-insight.mjs",
  reporter: process.env.CI
    ? [["list"], ["github"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    colorScheme: "dark",
    timezoneId: "UTC",
    // sw.js calls skipWaiting() and clients.claim(). Once it controls the page,
    // WebKit issues its fetches outside Playwright's route layer (Chromium does
    // not). That let a password grant reach the real Supabase host. Blocking
    // registration keeps every request on the stub and the network guard.
    // The app still loads from localhost, which is where the worker would register.
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "iphone-webkit",
      use: { ...iphone, browserName: "webkit" },
    },
    {
      name: "iphone-chromium",
      use: {
        ...iphone,
        browserName: "chromium",
        launchOptions: {
          args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            // Same localhost-only DNS lock as logger/tests/browser-launch.mjs.
            // WebKit has no equivalent; guardNetwork() is the route layer there.
            "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
          ],
        },
      },
    },
    // live: PR B adds this project (deployed site, real test account,
    // launchAllowlistBrowser). It is not part of PR smoke.
  ],
  webServer: {
    command: "node logger/tests/e2e/fixtures/static-server.mjs",
    url: `http://127.0.0.1:${port}/index.html`,
    // Never attach to a server already on this port. It may be a different app.
    reuseExistingServer: false,
    timeout: 20_000,
    env: { PW_PORT: String(port), INSIGHT_TEST_PORT: String(port) },
  },
});
