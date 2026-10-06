import { MUST_FAIL_WITH, test } from "./fixtures/app.mjs";

// The fixture teardown calls assertClean() and throws. test.fail() would treat
// any error as success; the annotation requires the guard's message. If the
// teardown check is removed, this test passes and the witness fails the run.
// The host is reserved (.invalid) and is not a real service.
test.fail("a guard hit fails the test", {
  annotation: {
    type: MUST_FAIL_WITH,
    description: "Network guard blocked requests that must not leave the runner",
  },
}, async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(async () => {
    try { await fetch("https://leak-probe.invalid/must-not-leave"); } catch (e) { /* aborted or unreachable */ }
  });
});
