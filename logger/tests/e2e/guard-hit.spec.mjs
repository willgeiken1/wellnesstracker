import { test } from "./fixtures/app.mjs";

// Expected to fail in teardown: assertClean() throws because the guard recorded
// the probe. If the hit is missed, this test passes and test.fail() turns the
// run red. The host is reserved (.invalid) and is not a real service.
test.fail("a guard hit fails the test", async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(async () => {
    try { await fetch("https://leak-probe.invalid/must-not-leave"); } catch (e) { /* aborted or unreachable */ }
  });
});
