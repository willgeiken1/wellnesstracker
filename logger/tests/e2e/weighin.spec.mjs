import { expect, openApp, test } from "./fixtures/app.mjs";

test("logs a weigh-in and shows it on Progress", async ({ page }) => {
  const assertQuiet = await openApp(page);
  await page.getByRole("button", { name: "Progress" }).click();
  await expect(page.locator("#pane-progress")).toContainText("Progress");
  await expect(page.locator("#pane-progress")).not.toContainText("Loading…");
  await page.locator('[data-action="weigh-open"]').first().click();
  await page.locator("#wi-v").fill("150");
  await page.locator('[data-action="weigh-save"]').click();
  await expect(page.locator("#toast")).toContainText("Logged 150 lb");
  await expect(page.locator("#pane-progress")).toContainText("150 lb");
  await expect(page.locator("#pane-progress")).toContainText("First weigh-in");
  const stored = await page.evaluate(() => {
    const rows = (window.app.state.profile && window.app.state.profile.weighIns) || [];
    return rows.some((row) => row && row.kg > 60 && row.kg < 80);
  });
  expect(stored).toBe(true);
  assertQuiet();
});
