import { test as base, expect } from "@playwright/test";
import { assertLoopbackOnly } from "./loopback-only.mjs";
import { guardNetwork } from "./network-guard.mjs";
import { E2E_EMAIL, E2E_PASSWORD } from "./seed.mjs";
import { installSupabaseStub } from "./supabase-stub.mjs";

// test.fail() counts any thrown error as the expected failure. Specs that must
// fail for a specific reason add this annotation; the auto fixture below turns
// a pass, or a failure with a different message, into an unexpected failure.
export const MUST_FAIL_WITH = "insight-must-fail-with";

export function enforceExpectedFailure(testInfo) {
  const needles = (testInfo.annotations || [])
    .filter((ann) => ann.type === MUST_FAIL_WITH && ann.description)
    .map((ann) => ann.description);
  if (!needles.length) return;
  const text = (testInfo.errors || []).map((err) => `${err.message || ""}\n${err.stack || ""}`).join("\n");
  const failed = testInfo.status === "failed" || testInfo.status === "timedOut";
  if (failed && needles.every((needle) => text.includes(needle))) return;
  testInfo.expectedStatus = "passed";
  testInfo.status = "failed";
  const detail = text.trim() || "(the test passed)";
  const message =
    `Expected this test to fail with ${needles.map((needle) => JSON.stringify(needle)).join(" and ")} ` +
    `but got: ${detail}`;
  if (Array.isArray(testInfo.errors)) testInfo.errors.splice(0, testInfo.errors.length, { message });
  else testInfo.errors = [{ message }];
}

export function selfTestExpectedFailure() {
  const passed = {
    status: "passed",
    expectedStatus: "failed",
    annotations: [{ type: MUST_FAIL_WITH, description: "Refusing to run" }],
    errors: [],
  };
  enforceExpectedFailure(passed);
  if (passed.expectedStatus !== "passed" || passed.status !== "failed" || !String(passed.errors[0].message).includes("Refusing to run")) {
    throw new Error("expected-failure witness did not reject a test that passed");
  }
  const wrong = {
    status: "failed",
    expectedStatus: "failed",
    annotations: [{ type: MUST_FAIL_WITH, description: "Refusing to run" }],
    errors: [{ message: "Timed out" }],
  };
  enforceExpectedFailure(wrong);
  if (wrong.expectedStatus !== "passed" || wrong.errors.length !== 1 || !String(wrong.errors[0].message).includes("Timed out")) {
    throw new Error("expected-failure witness accepted the wrong error");
  }
  const right = {
    status: "failed",
    expectedStatus: "failed",
    annotations: [{ type: MUST_FAIL_WITH, description: "Refusing to run" }],
    errors: [{ message: 'Error: Refusing to run: serviceWorkers must be "block"' }],
  };
  enforceExpectedFailure(right);
  if (right.status !== "failed" || right.expectedStatus !== "failed" || right.errors.length !== 1) {
    throw new Error("expected-failure witness rewrote a matching failure");
  }
}

function ignoredConsole(text) {
  // Icon files are not in the repo. A missing script still fails the boot wait.
  if (/Failed to load resource/i.test(text) && /icon-|apple-touch-icon|favicon/i.test(text)) return true;
  // index.html preconnects fonts.googleapis.com and fonts.gstatic.com. On WebKit
  // those connections skip route(). Only the OS lock (INSIGHT_NETNS=1) makes
  // them fail this way. Do not edit index.html to remove the hints, and do not
  // hide the same console error when the lock is off.
  if (process.env.INSIGHT_NETNS === "1" && /fonts\.(googleapis|gstatic)\.com/i.test(text) && /preconnect|Failed to load resource|Name or service not known|network connection/i.test(text)) return true;
  return false;
}

export function assertServiceWorkersBlocked(serviceWorkers, context) {
  // Playwright stores the options it actually applied on context._options.
  // That field is private: there is no public getter for the serviceWorkers
  // mode of an existing context. A missing or unexpected value fails closed
  // (anything other than "block" is refused). The public inputs we do check
  // are the serviceWorkers fixture option and the object passed to newContext.
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

async function armContext(context) {
  assertServiceWorkersBlocked("block", context);
  const guard = await guardNetwork(context);
  await installSupabaseStub(context, guard);
  context.__insightGuard = guard;
  return guard;
}

function refuseNewContext(requested) {
  throw new Error(
    `Refusing to run: serviceWorkers must be "block" ` +
    `(newContext option is ${JSON.stringify(requested)}). ` +
    "WebKit sends service-worker fetches outside route(), which leaks to live Supabase. " +
    "browser.newContext({ serviceWorkers: 'allow' }) is not allowed."
  );
}

// Every context from this browser gets the service-worker check and the
// network guard, including contexts a test opens itself.
// An explicit serviceWorkers value other than "block" is refused before the
// context exists. An omitted value is filled in by Playwright from the test's
// context options (the config sets "block") inside the original newContext.
// Forcing "block" here would hide test.use({ serviceWorkers: "allow" }).
function installGuardedNewContext(browser) {
  if (browser.__insightNewContext) return;
  const originalNewContext = browser.newContext.bind(browser);
  browser.newContext = async function guardedNewContext(options = {}) {
    if (Object.prototype.hasOwnProperty.call(options, "serviceWorkers") && options.serviceWorkers !== "block") {
      refuseNewContext(options.serviceWorkers);
    }
    const context = await originalNewContext(options);
    try {
      await armContext(context);
    } catch (err) {
      await context.close().catch(() => {});
      throw err;
    }
    const originalClose = context.close.bind(context);
    let closed = false;
    context.close = async (closeOptions) => {
      if (closed) return;
      closed = true;
      try {
        await assertNoServiceWorkerController(context);
        if (context.__insightGuard) context.__insightGuard.assertClean();
      } finally {
        await originalClose(closeOptions);
      }
    };
    return context;
  };
  browser.__insightNewContext = true;
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
  // Set up before the context fixture so this tears down after it and can see
  // a setup or teardown error. A wrong message must not satisfy test.fail().
  _insightFailureReason: [async ({}, use, testInfo) => {
    await use();
    enforceExpectedFailure(testInfo);
  }, { auto: true, title: "expected failure reason" }],
  browser: [async ({ browser, browserName }, use) => {
    if (browserName === "webkit") await assertLoopbackOnly();
    installGuardedNewContext(browser);
    await use(browser);
  }, { scope: "worker" }],
  context: async ({ context, serviceWorkers }, use) => {
    assertServiceWorkersBlocked(serviceWorkers, context);
    const guard = context.__insightGuard;
    if (!guard) {
      throw new Error("Refusing to run: this context has no network guard. Contexts must be opened through the app fixture.");
    }
    try {
      await use(context);
    } finally {
      await assertNoServiceWorkerController(context);
    }
    guard.assertClean();
  },
});

export { expect };
