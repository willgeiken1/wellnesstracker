import { test as base, expect } from "@playwright/test";
import { guardNetwork } from "./network-guard.mjs";
import { E2E_EMAIL, E2E_PASSWORD } from "./seed.mjs";
import { installSupabaseStub } from "./supabase-stub.mjs";

function ignoredConsole(text) {
  // Icon files are not in the repo. A missing script still fails the boot wait.
  return /Failed to load resource/i.test(text) && /icon-|apple-touch-icon|favicon/i.test(text);
}

export function trackPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err && err.message ? err.message : err}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (ignoredConsole(text)) return;
    errors.push(`console: ${text}`);
  });
  return () => {
    if (!errors.length) return;
    throw new Error("Unexpected browser errors:\n" + errors.join("\n"));
  };
}

export async function openApp(page) {
  const assertQuiet = trackPageErrors(page);
  await page.goto("/index.html");
  await page.waitForFunction(() => window.app && window.app.PH && window.app.PH.ready && typeof window.app.render === "function");
  return assertQuiet;
}

export async function signIn(page) {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator('[data-action="auth-open"]').click();
  await expect(page.locator("#authEmail")).toBeVisible();
  await page.locator("#authEmail").fill(E2E_EMAIL);
  await page.locator("#authPw").fill(E2E_PASSWORD);
  await page.locator('[data-action="auth-go"]').click();
  await expect(page.locator("#toast")).toContainText("Signed in");
  await expect(page.getByText(E2E_EMAIL)).toBeVisible();
}

export const test = base.extend({
  context: async ({ context }, use) => {
    const guard = await guardNetwork(context);
    await installSupabaseStub(context, guard);
    await use(context);
    guard.assertClean();
  },
});

export { expect };
