import { assertConfigured, liveGate } from "./gate.mjs";
import { expect, test } from "./fixtures.mjs";
import { LIVE_BASE_URL, SB_URL } from "./project.mjs";

const gate = liveGate(process.env);

test.describe("deployed Insight", () => {
  test.skip(gate.skip, gate.reason);

  test("GitHub Pages serves the Insight app", async ({ page }) => {
    assertConfigured(gate);
    await page.goto("index.html");
    await page.waitForFunction(() => window.app && window.app.SB_URL && typeof window.app.render === "function");
    await expect(page).toHaveTitle("Insight");
    const loaded = await page.evaluate(() => window.app.SB_URL);
    if (loaded !== SB_URL) throw new Error("Deployed app is pointed at an unexpected Supabase project.");
    await expect(page).toHaveURL(new RegExp("^" + LIVE_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await expect(page.getByRole("button", { name: "Home" })).toBeVisible();
    await page.getByRole("button", { name: "Settings" }).click();
    await page.waitForFunction(() => window.app.ui && window.app.ui.tab === "settings");
    await expect(page.getByRole("button", { name: "Sign in or create an account" })).toBeVisible();
  });
});
