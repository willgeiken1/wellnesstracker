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

test("logs a set after a shell update restores a blank note", async ({ page }) => {
  const assertQuiet = await openApp(page);
  await page.getByRole("button", { name: "Workouts" }).click();
  await page.locator('[data-action="open-w"][data-id="push"]').click();
  await page.getByRole("button", { name: "Start Push" }).click();
  await expect(page.locator("#workout")).toBeVisible();
  await page.locator("#w-0").fill("100");
  await page.locator("#r-0").fill("8");
  const restored = await page.evaluate(() => {
    const app = window.app;
    app.rememberWorkoutReload(document);
    app.ui.drafts = {};
    app.ui.workoutOpen = false;
    app.ui.open = null;
    const ok = app.restoreWorkoutReload();
    const session = app.activeSession();
    const name = app.liveExercises(session)[0].name;
    const draft = app.ui.drafts[name];
    const keys = draft ? Object.keys(draft) : [];
    app.render();
    return { ok, keys };
  });
  expect(restored.ok).toBe(true);
  expect(restored.keys).not.toContain("note");
  await page.locator('[data-action="log"]').click();
  await expect(page.locator("#workout .set-v").first()).toContainText("100");
  const saved = await page.evaluate(() => {
    const session = window.app.activeSession();
    const entry = session && session.entries.find((e) => e.sets && e.sets.length);
    const set = entry && entry.sets[0];
    return set ? { w: set.w, r: set.r, noted: set.note != null } : null;
  });
  expect(saved).toEqual({ w: 100, r: 8, noted: false });
  assertQuiet();
});
