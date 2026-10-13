import { expect, openApp, test } from "./fixtures/app.mjs";

test("a saved routine still shows add weight until Settings hides progression", async ({ page }) => {
  const assertQuiet = await openApp(page);
  await page.evaluate(() => {
    const app = window.app;
    app.state.workouts.push({
      id: "prog-e2e",
      name: "Progression Upper",
      exercises: [{ name: "Bench Press", muscles: ["chest"], sets: [{ w: 90, r: 5 }, { w: 90, r: 5 }, { w: 90, r: 5 }] }],
    });
    app.state.sessions.push({
      id: "prog-hist",
      date: "2026-01-01",
      workoutId: "prog-e2e",
      name: "Progression Upper",
      startedAt: "2026-01-01T11:00:00",
      finishedAt: "2026-01-01T12:00:00",
      entries: [{ exercise: "Bench Press", muscles: ["chest"], sets: [{ w: 100, r: 8 }, { w: 100, r: 8 }] }],
    });
    app.save();
    app.render();
  });

  await page.getByRole("button", { name: "Workouts", exact: true }).click();
  await page.locator('[data-action="open-w"][data-id="prog-e2e"]').click();
  await page.getByRole("button", { name: "Start Progression Upper" }).click();
  await expect(page.locator(".sugg")).toContainText("Add weight");
  await expect(page.locator(".sugg")).not.toContainText("Target from this routine");

  await page.locator('[data-action="minimize"]').click();
  await expect(page.locator("#workout")).toBeHidden();
  await page.locator(".avatar").dispatchEvent("click");
  const toggle = page.getByRole("switch", { name: "Show progression suggestions" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Resume workout" }).click();
  await expect(page.locator("#w-0")).toHaveAttribute("placeholder", "90");
  await expect(page.locator(".sugg")).toHaveCount(0);

  await page.reload();
  await page.waitForFunction(() => window.app && window.app.PH && window.app.PH.ready && typeof window.app.render === "function");
  await page.locator(".avatar").dispatchEvent("click");
  await expect(page.getByRole("switch", { name: "Show progression suggestions" })).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Resume workout" }).click();
  await page.locator(".ex-head").click();
  await expect(page.locator("#w-0")).toHaveAttribute("placeholder", "90");
  await expect(page.locator(".sugg")).toHaveCount(0);
  assertQuiet();
});
