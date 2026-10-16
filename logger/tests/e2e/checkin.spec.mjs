import { expect, openApp, signIn, test } from "./fixtures/app.mjs";

test("check-in sheet shows 988 without a diagnosis, and the strip says where a check-in is saved", async ({ page }) => {
  const assertQuiet = await openApp(page);
  const strip = page.locator(".checkin-open");
  await expect(strip).toContainText("Check in");
  await expect(strip).toContainText("Stays on this phone until you sign in");
  await signIn(page);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("Syncs to your account, including the note");
  if (process.env.TEAM_SHOTS) {
    await strip.screenshot({ path: `${process.env.TEAM_SHOTS}/checkin-strip.png` });
  }
  await strip.click();
  await expect(page.locator(".checkin-advice")).toHaveText("This check-in is not medical advice and it is not a diagnosis.");
  await expect(page.locator("#checkin-card")).toBeHidden();
  await page.locator('[data-action="checkin-pick"][data-k="mood"][data-v="3"]').click();
  await page.locator("#checkin-note").fill("great workout");
  await expect(page.locator("#checkin-card")).toBeHidden();
  await page.locator('[data-action="checkin-pick"][data-k="mood"][data-v="1"]').click();
  const card = page.locator("#checkin-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("call or text 988");
  await expect(card).toContainText("call 911");
  await expect(page.locator("#sheet")).not.toContainText(/depression|anxiety|disorder|you are|you have/i);
  await page.locator("#checkin-note").fill("kill myself");
  await expect(card).toBeVisible();
  await expect(card.getByRole("link", { name: "Call 988" })).toHaveAttribute("href", "tel:988");
  if (process.env.TEAM_SHOTS) {
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${process.env.TEAM_SHOTS}/checkin-sheet.png` });
  }
  await page.locator('[data-action="checkin-save"]').click();
  await expect(page.locator("#toast")).toContainText("Check-in saved");
  await expect(strip).toContainText("Checked in");
  await expect(strip).toContainText("Update today's check-in");
  await expect(page.locator("#pane-home")).not.toContainText("kill myself");
  await expect(page.locator("#pane-home")).not.toContainText("Rough");
  const saved = await page.evaluate(() => {
    const rows = window.app.state.checkins;
    return Array.isArray(rows) ? rows[0] : null;
  });
  expect(saved && saved.mood).toBe(1);
  expect(saved.note).toBe("kill myself");
  assertQuiet();
});
