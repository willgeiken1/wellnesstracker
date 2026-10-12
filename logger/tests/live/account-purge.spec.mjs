import { assertAccountPurged, deleteThrowawayAccount, ensureThrowawayUser, seedPurgeTargets } from "./account.mjs";
import { assertConfigured, liveGate, PROBE_NAME, purgeSkippedOnSchedule, redactText } from "./gate.mjs";
import { expect, test } from "./fixtures.mjs";

const gate = liveGate(process.env);
const secrets = [gate.email, gate.password, gate.serviceRole];

function rethrowRedacted(err, fallback) {
  const wrapped = new Error(redactText(err && err.message ? err.message : fallback, secrets));
  if (err && err.stack) wrapped.stack = redactText(err.stack, secrets);
  throw wrapped;
}

async function signInThrowaway(page) {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator('[data-action="auth-open"]').click();
  await expect(page.locator("#authEmail")).toBeVisible();
  await page.locator("#authEmail").fill(gate.email);
  await page.locator("#authPw").fill(gate.password);
  await page.locator('[data-action="auth-go"]').click();
  try {
    const phase = await page.waitForFunction(() => {
      if (document.body.classList.contains("locked")) return "locked";
      if (window.app.session && window.app.session.user && window.app.cloudPullOk) return "in";
      return "";
    }, null, { timeout: 30_000 });
    return await phase.jsonValue();
  } catch (err) {
    await page.locator("#authPw").fill("").catch(() => {});
    let toast = "";
    try { toast = await page.locator("#toast").innerText(); } catch { toast = ""; }
    const detail = redactText(toast, secrets).trim();
    throw new Error(detail
      ? `Throwaway sign-in did not finish (${detail}). Not deleting.`
      : "Throwaway sign-in did not finish. Not deleting.");
  }
}

async function fillProbeProfile(page) {
  const root = page.locator("#onboard:not([hidden]), #sheet:not([hidden])").first();
  await root.locator("#pf-name").fill(PROBE_NAME);
  await root.locator("#pf-dob").fill("1990-06-15");
  await root.locator('[data-action="pf-pick"][data-field="sex"][data-val="male"]').click();
  await root.locator('[data-action="pf-pick"][data-field="units"][data-val="metric"]').click();
  await root.locator("#pf-cm").fill("180");
  await root.locator("#pf-w").fill("80");
  await root.locator('[data-action="pf-pick"][data-field="activity"][data-val="light"]').click();
  await root.locator('[data-action="pf-save"]').click();
}

async function openSettings(page) {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.waitForFunction(() => window.app.ui && window.app.ui.tab === "settings");
}

async function ensureProbeProfile(page) {
  const phase = await page.waitForFunction(() => {
    const onboard = document.getElementById("onboard");
    if (onboard && !onboard.hidden) return "onboard";
    if (window.app.cloudPullOk && window.app.profileComplete && window.app.profileComplete()) return "complete";
    if (window.app.cloudPullOk) return "incomplete";
    return "";
  });
  const which = await phase.jsonValue();
  if (which === "onboard" || which === "incomplete") {
    if (which === "incomplete") {
      await openSettings(page);
      await page.locator('[data-action="pf-edit"]').click();
      await page.locator("#pf-name").waitFor();
    }
    await fillProbeProfile(page);
  } else {
    const name = await page.evaluate(() => (window.app.state.profile && window.app.state.profile.name) || "");
    if (name !== PROBE_NAME) {
      await openSettings(page);
      await page.locator('[data-action="pf-edit"]').click();
      await page.locator("#pf-name").fill(PROBE_NAME);
      await page.locator('[data-action="pf-save"]').click();
    }
  }
  await page.waitForFunction((probe) => {
    const profile = window.app.state.profile;
    return !!(profile && profile.name === probe && window.app.profileComplete && window.app.profileComplete());
  }, PROBE_NAME);
}

async function logProbeWeighIn(page) {
  if ((await page.evaluate(() => window.app.ui && window.app.ui.tab)) !== "settings") await openSettings(page);
  await page.locator('[data-action="weigh-open"]').click();
  await page.locator("#wi-v").fill("180");
  await page.locator('[data-action="weigh-save"]').click();
  await page.waitForFunction(() => {
    const list = (window.app.state.profile && window.app.state.profile.weighIns) || [];
    return list.some((row) => row && typeof row.kg === "number" && row.kg > 0);
  });
}

async function flushCloudPush(page) {
  await page.evaluate(async () => {
    if (!window.app || typeof window.app.cloudPush !== "function") {
      throw new Error("The page did not expose cloudPush. Not deleting.");
    }
    await window.app.cloudPush();
  });
}

test.describe("throwaway account purge", () => {
  test.skip(gate.skip, gate.reason);
  test.skip(!gate.skip && !gate.serviceRole, "INSIGHT_TEST_SERVICE_ROLE_KEY is not set. Skipping account delete.");
  test.skip(
    purgeSkippedOnSchedule(process.env.GITHUB_EVENT_NAME),
    "Scheduled live checks run the page boot only. Account delete runs from workflow_dispatch."
  );
  test.describe.configure({ mode: "serial" });

  test("deletes the throwaway account and purges its data", async ({ page }) => {
    test.setTimeout(120_000);
    assertConfigured(gate);
    let userId = "";
    try {
      try {
        ({ userId } = await ensureThrowawayUser({
          email: gate.email,
          password: gate.password,
          serviceRole: gate.serviceRole,
        }));
      } catch (err) {
        rethrowRedacted(err, "Could not prepare the throwaway account. Not deleting.");
      }

      await page.goto("index.html");
      await page.waitForFunction(() => window.app && typeof window.app.render === "function" && window.app.sb);
      const phase = await signInThrowaway(page);
      if (phase === "locked") throw new Error("Refusing to run: the throwaway account has app lock on. Not deleting.");

      const signedInEmail = await page.evaluate(() => (window.app.session && window.app.session.user && window.app.session.user.email) || "");
      if (signedInEmail.toLowerCase() !== gate.email.toLowerCase()) {
        throw new Error("Refusing to delete: the signed-in account is not the throwaway account.");
      }

      await ensureProbeProfile(page);
      await logProbeWeighIn(page);
      await flushCloudPush(page);

      try {
        await seedPurgeTargets({ userId, serviceRole: gate.serviceRole });
      } catch (err) {
        rethrowRedacted(err, "Could not seed the throwaway rows. Not deleting.");
      }

      const capturedId = await page.evaluate(() => (window.app.session && window.app.session.user && window.app.session.user.id) || "");
      if (capturedId !== userId) throw new Error("Refusing to delete: the signed-in user did not match the throwaway account.");
      const probeName = await page.evaluate(() => (window.app.state.profile && window.app.state.profile.name) || "");
      if (probeName !== PROBE_NAME) throw new Error("Refusing to delete: profile was not saved as the live probe.");

      if ((await page.evaluate(() => window.app.ui && window.app.ui.tab)) !== "settings") await openSettings(page);
      const pending = page.waitForResponse((res) => {
        try {
          const url = new URL(res.url());
          return res.request().method() === "POST" && /\/functions\/v1\/delete-account\/?$/.test(url.pathname);
        } catch { return false; }
      });
      const deletedToast = page.waitForFunction(() => {
        const toast = document.getElementById("toast");
        return !!(toast && (toast.textContent || "").includes("Your account was deleted."));
      });
      await page.locator('[data-action="priv-delete"]').click();
      await expect(page.locator("#del-go")).toHaveText("Delete my account");
      await page.locator("#del-confirm").fill("DELETE");
      await expect(page.locator("#del-go")).toBeEnabled();
      await page.locator("#del-go").click();
      const response = await pending;
      let ok = false;
      try {
        const body = await response.json();
        ok = !!body && body.ok === true && Object.keys(body).length === 1;
      } catch { ok = false; }
      if (response.status() !== 200 || !ok) {
        throw new Error(`delete-account did not report ok (status ${response.status()}).`);
      }
      await deletedToast;
      await page.waitForFunction(() => !window.app.session);

      try {
        await assertAccountPurged({
          userId,
          email: gate.email,
          password: gate.password,
          serviceRole: gate.serviceRole,
        });
      } catch (err) {
        rethrowRedacted(err, "Account purge check failed.");
      }
    } catch (err) {
      if (userId) {
        try {
          await deleteThrowawayAccount({ userId, email: gate.email, serviceRole: gate.serviceRole });
        } catch (cleanupErr) {
          const detail = redactText(cleanupErr && cleanupErr.message ? cleanupErr.message : "Could not delete the throwaway account.", secrets);
          const message = redactText(err && err.message ? err.message : "Account purge failed.", secrets);
          const wrapped = new Error(`${message} ${detail}`);
          wrapped.stack = redactText(err && err.stack ? err.stack : "", secrets);
          throw wrapped;
        }
      }
      throw err;
    }
  });
});
