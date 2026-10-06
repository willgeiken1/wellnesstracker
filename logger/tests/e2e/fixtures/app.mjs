import { test as base, expect } from "@playwright/test";
import { guardNetwork } from "./network-guard.mjs";
import { E2E_EMAIL, E2E_PASSWORD } from "./seed.mjs";
import { installSupabaseStub } from "./supabase-stub.mjs";

function ignoredConsole(text) {
  // Icon files are not in the repo. A missing script still fails the boot wait.
  if (/Failed to load resource/i.test(text) && /icon-|apple-touch-icon|favicon/i.test(text)) return true;
  // index.html preconnects fonts.googleapis.com and fonts.gstatic.com. On WebKit
  // those connections skip route(). The OS lock makes them fail. The stylesheet
  // itself is still stubbed. Do not edit index.html to remove the hints.
  if (/fonts\.(googleapis|gstatic)\.com/i.test(text) && /preconnect|Failed to load resource|Name or service not known|network connection/i.test(text)) return true;
  return false;
}

export function assertServiceWorkersBlocked(serviceWorkers, context) {
  const fromContext = context && context._options ? context._options.serviceWorkers : undefined;
  if (serviceWorkers !== "block" || fromContext !== "block") {
    throw new Error(
      `Refusing to run: serviceWorkers must be "block" ` +
      `(fixture option is ${JSON.stringify(serviceWorkers)}, context option is ${JSON.stringify(fromContext)}). ` +
      "WebKit sends service-worker fetches outside route(), which leaks to live Supabase. " +
      "test.use({ serviceWorkers: 'allow' }) is not allowed."
    );
  }
}

async function assertNoServiceWorkerController(context) {
  for (const page of context.pages()) {
    if (page.isClosed()) continue;
    let controlled = false;
    try {
      controlled = await page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
    } catch {
      continue;
    }
    if (controlled) {
      throw new Error(
        `Refusing to finish: ${page.url()} has a service worker controller. ` +
        "WebKit would send that worker's fetches outside route()."
      );
    }
  }
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
  context: async ({ context, serviceWorkers }, use) => {
    assertServiceWorkersBlocked(serviceWorkers, context);
    const guard = await guardNetwork(context);
    await installSupabaseStub(context, guard);
    try {
      await use(context);
    } finally {
      await assertNoServiceWorkerController(context);
    }
    guard.assertClean();
  },
});

export { expect };
