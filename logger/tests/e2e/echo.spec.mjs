import { expect, openApp, signIn, test } from "./fixtures/app.mjs";
import { permitFoodDescribe } from "./fixtures/network-guard.mjs";

const ITEMS = [
  { name: "Grilled chicken breast", portion: "6 oz", calories: 280, protein: 52, carbs: 0, fat: 6 },
  { name: "White rice", portion: "1 cup", calories: 200, protein: 4, carbs: 45, fat: 0 },
  { name: "Butter", portion: "1 tbsp", calories: 100, protein: 0, carbs: 0, fat: 11 },
];

test("describe-it echo keeps chicken and rice heard and marks added butter as guessed", async ({ page }) => {
  const assertQuiet = await openApp(page);
  const guard = page.context().__insightGuard;
  permitFoodDescribe(guard, ITEMS);
  await signIn(page);
  await page.getByRole("button", { name: "Food", exact: true }).click();
  await page.locator('[data-action="food-add"][data-meal="breakfast"]').click();
  await page.locator('[data-action="food-describe"]').click();
  await page.locator("#food-describe").fill("chicken and rice");
  await page.locator('[data-action="food-describe-go"]').click();
  const allow = page.locator('[data-action="ai-consent-allow"]');
  const heard = page.locator('section.echo[aria-label="What I heard"]');
  await expect(allow.or(heard)).toBeVisible();
  if (await allow.isVisible()) await allow.click();
  const guessed = page.locator('section.echo[aria-label="What I guessed"]');
  await expect(heard).toContainText("chicken and rice");
  await expect(heard.locator('input[data-k="name"]').nth(0)).toHaveValue("Grilled chicken breast");
  await expect(heard.locator('input[data-k="name"]').nth(1)).toHaveValue("White rice");
  await expect(heard).toContainText("Portion guessed");
  await expect(guessed.locator('input[data-k="name"]')).toHaveValue("Butter");
  await expect(guessed).toContainText("Guessed");
  await expect(guessed).not.toContainText("chicken breast");
  await expect(guessed).not.toContainText("White rice");
  await expect(page.locator("#sheet")).toContainText("Nothing is saved until you confirm");
  const bodies = guard.foodDescribe.bodies;
  expect(bodies).toHaveLength(1);
  expect(Object.keys(bodies[0]).sort()).toEqual(["localDate", "text", "timeZone"]);
  expect(bodies[0].text).toBe("chicken and rice");
  if (process.env.TEAM_SHOTS) {
    await page.locator(".sheet-card").evaluate((el) => { el.style.maxHeight = "none"; });
    await page.locator(".sheet-card").screenshot({ path: `${process.env.TEAM_SHOTS}/describe-echo.png` });
  }
  assertQuiet();
});
