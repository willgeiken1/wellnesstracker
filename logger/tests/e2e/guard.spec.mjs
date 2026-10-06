import { expect, MUST_FAIL_WITH, test } from "./fixtures/app.mjs";

const PROBES = [
  "https://o4512196136206336.ingest.us.sentry.io/api/4512196143742976/envelope/",
  "https://browser.sentry-cdn.com/10.42.0/bundle.min.js",
  "https://us.i.posthog.com/e/",
  "https://us-assets.i.posthog.com/static/array.js",
  "https://example.com/must-not-leave",
];

const REFUSE = 'Refusing to run: serviceWorkers must be "block"';

test("network guard aborts Sentry, PostHog, and any other non-local host", async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const guard = context.__insightGuard;
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
  expect(() => guard.assertClean()).toThrow(/Network guard blocked requests that must not leave the runner/);
  guard.hits.length = 0;
  await context.close();
});

// The wrapper throws in the test body. test.fail() alone would accept any
// error; the annotation requires this message.
test.fail("browser.newContext with serviceWorkers allow is refused", {
  annotation: { type: MUST_FAIL_WITH, description: REFUSE },
}, async ({ browser }) => {
  await browser.newContext({ serviceWorkers: "allow" });
});

test.describe("serviceWorkers allow is refused", () => {
  test.use({ serviceWorkers: "allow" });
  test.fail("app fixture refuses a context that allows service workers", {
    annotation: { type: MUST_FAIL_WITH, description: REFUSE },
  }, async ({ page }) => {
    await page.goto("about:blank");
  });
});
