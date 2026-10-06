import { expect, test } from "@playwright/test";
import { test as appTest } from "./fixtures/app.mjs";
import { guardNetwork } from "./fixtures/network-guard.mjs";

const PROBES = [
  "https://o4512196136206336.ingest.us.sentry.io/api/4512196143742976/envelope/",
  "https://browser.sentry-cdn.com/10.42.0/bundle.tracing.min.js",
  "https://us.i.posthog.com/e/",
  "https://us-assets.i.posthog.com/static/array.js",
  "https://example.com/must-not-leave",
];

test("network guard aborts Sentry, PostHog, and any other non-local host", async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const guard = await guardNetwork(context);
  const page = await context.newPage();
  const failed = [];
  const finished = [];
  page.on("requestfailed", (req) => failed.push(req.url()));
  page.on("requestfinished", (req) => finished.push(req.url()));
  await page.goto("about:blank");
  await page.evaluate(async (urls) => {
    await Promise.all(urls.map(async (url) => {
      try { await fetch(url, { method: "POST" }); } catch (e) { /* aborted on purpose */ }
    }));
  }, PROBES);

  const report = guard.hits.join("\n");
  expect(report).toMatch(/sentry\.io/);
  expect(report).toMatch(/sentry-cdn\.com/);
  expect(report).toMatch(/i\.posthog\.com/);
  expect(report).toMatch(/example\.com/);
  expect(guard.continued.some((url) => /sentry|posthog|example\.com/i.test(url))).toBe(false);
  expect(failed.filter((url) => PROBES.some((probe) => url.startsWith(probe))).length).toBe(PROBES.length);
  expect(finished.filter((url) => PROBES.some((probe) => url.startsWith(probe)))).toEqual([]);
  expect(() => guard.assertClean()).toThrow(/Network guard/);
  await context.close();
});

appTest.describe("serviceWorkers allow is refused", () => {
  appTest.use({ serviceWorkers: "allow" });
  // A single test.use override used to skip route() on WebKit and leak the
  // password grant. The fixture must fail this before any page loads.
  appTest.fail("app fixture refuses a context that allows service workers", async ({ page }) => {
    await page.goto("about:blank");
  });
});
