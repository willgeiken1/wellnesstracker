import { expect, openApp, signIn, test } from "./fixtures/app.mjs";

const OURA_TILES = ["readiness", "sleep-score", "sleep-duration", "hrv", "resting-hr", "steps", "last-night"];

test("Home paints non-Oura content and no empty Oura tiles", async ({ page }) => {
  const assertQuiet = await openApp(page);
  await signIn(page);
  await page.getByRole("button", { name: "Home" }).click();
  const home = page.locator("#pane-home");
  await expect(home.locator(".page-title")).toHaveText("Hi, Alex");
  await expect(home.locator(".hero-t")).toBeVisible();
  await expect(home.getByRole("heading", { name: "This week", exact: true })).toBeVisible();
  const food = home.locator('article[data-hw="food-today"]');
  await expect(food).toBeVisible();
  await expect(food).not.toContainText("Nothing logged");
  await expect(home.locator('article[data-hw="weekly-goal"]')).toContainText("0 of 3");
  const weight = home.locator('article[data-hw="weight-trend"]');
  await expect(weight).toBeVisible();
  await expect(weight).not.toContainText("No weigh-ins");
  await expect(home.locator(OURA_TILES.map((id) => `[data-hw="${id}"]`).join(", "))).toHaveCount(0);
  await expect(home).not.toContainText("Connect a ring");
  await expect(home).not.toContainText("No Oura yet");
  await expect(home).not.toContainText("Waiting for first sync");
  await expect(home).not.toContainText("Nothing to show yet");
  assertQuiet();
});
