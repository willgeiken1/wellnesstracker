import { expect, openApp, test } from "./fixtures/app.mjs";

test("logs food by manual entry", async ({ page }) => {
  const assertQuiet = await openApp(page);
  await page.getByRole("button", { name: "Food" }).click();
  await page.locator('[data-action="food-add"][data-meal="breakfast"]').click();
  await page.locator('[data-action="food-manual"]').click();
  await page.locator("#fm-name").fill("Synthetic oats");
  await page.locator("#fm-kcal").fill("320");
  await page.locator("#fm-p").fill("12");
  await page.locator("#fm-c").fill("54");
  await page.locator("#fm-f").fill("6");
  await page.locator('[data-action="food-manual-save"]').click();
  await expect(page.locator("#toast")).toContainText("Saved");
  await expect(page.locator("#pane-food")).toContainText("Synthetic oats");
  await expect(page.locator("#pane-food")).toContainText("320");
  const logged = await page.evaluate(() => {
    const days = window.app.state.food && window.app.state.food.days;
    return Object.values(days || {}).some((list) => list.some((e) => e.src === "manual" && e.name === "Synthetic oats"));
  });
  expect(logged).toBe(true);
  assertQuiet();
});
