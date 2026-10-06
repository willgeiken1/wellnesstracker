import { expect, openApp, test } from "./fixtures/app.mjs";

test("logs a workout set and finishes it", async ({ page }) => {
  const assertQuiet = await openApp(page);
  await page.getByRole("button", { name: "Workouts" }).click();
  await page.locator('[data-action="open-w"][data-id="push"]').click();
  await page.getByRole("button", { name: "Start Push" }).click();
  await expect(page.locator("#workout")).toBeVisible();
  await page.locator("#w-0").fill("100");
  await page.locator("#r-0").fill("8");
  await page.locator('[data-action="log"]').click();
  await expect(page.locator("#workout .set-v").first()).toContainText("100");
  await page.locator('[data-action="finish"]').click();
  await expect(page.locator("#dialog")).toContainText("Finish Push?");
  await page.locator('[data-action="dlg-ok"]').click();
  await expect(page.locator("#sheet")).toContainText("Push done");
  const saved = await page.evaluate(() => {
    const s = window.app.state.sessions.find((x) => x.finishedAt && x.name === "Push");
    return !!(s && s.entries.some((e) => e.sets && e.sets.length));
  });
  expect(saved).toBe(true);
  assertQuiet();
});
