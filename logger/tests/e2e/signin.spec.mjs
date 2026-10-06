import { expect, openApp, signIn, test } from "./fixtures/app.mjs";
import { E2E_EMAIL } from "./fixtures/seed.mjs";

test("signs in with email and password through the faked Supabase", async ({ page }) => {
  const assertQuiet = await openApp(page);
  await signIn(page);
  await expect(page.locator("#view")).toContainText("Signed in");
  await expect(page.locator("#view")).toContainText(E2E_EMAIL);
  const session = await page.evaluate(() => !!(window.app.session && window.app.session.user && window.app.session.user.email));
  expect(session).toBe(true);
  assertQuiet();
});
