import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assertSpecsUseAppFixture } from "../logger/tests/e2e/check-imports.mjs";
import { describeDenied, liveRequestAllowed } from "../logger/tests/live/allowlist.mjs";
import {
  assertConfigured,
  liveGate,
  passwordOk,
  PURGE_TABLES,
  redactText,
  serviceRoleOk,
  throwawayEmailOk,
} from "../logger/tests/live/gate.mjs";
import { EXPECTED_SUPABASE_HOST, LIVE_BASE_URL, PAGES_HOST, SB_URL, SUPABASE_HOST } from "../logger/tests/live/project.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASSWORD = "correct-horse-battery";
const EMAIL = "owner+insight-live@example.com";

test("smoke specs still use the guarded app fixture", () => {
  assertSpecsUseAppFixture(join(root, "logger/tests/e2e"));
});

test("live specs stay outside the PR smoke directory", () => {
  const names = readdirSync(join(root, "logger/tests/e2e"));
  assert.equal(names.includes("live"), false);
  const liveFiles = readdirSync(join(root, "logger/tests/live")).filter((name) => name.endsWith(".spec.mjs"));
  assert.deepEqual(liveFiles.sort(), ["account-purge.spec.mjs", "boot.spec.mjs"]);
});

test("the throwaway address must carry the insight-live marker", () => {
  assert.equal(throwawayEmailOk("owner+insight-live@example.com"), true);
  assert.equal(throwawayEmailOk("insight-live@example.com"), true);
  assert.equal(throwawayEmailOk("a.insight-live.b@example.com"), true);
  assert.equal(throwawayEmailOk("owner+insight-live+tag@example.com"), true);
  assert.equal(throwawayEmailOk("Insight-Live@example.com"), true);
  assert.equal(throwawayEmailOk("notinsight-live@example.com"), false);
  assert.equal(throwawayEmailOk("insight-liveextra@example.com"), false);
  assert.equal(throwawayEmailOk("person@example.com"), false);
  assert.equal(throwawayEmailOk("owner+insight-live"), false);
  assert.equal(throwawayEmailOk("owner+insight-live@localhost"), false);
  assert.equal(throwawayEmailOk("a b+insight-live@example.com"), false);
  assert.equal(throwawayEmailOk(""), false);
});

test("password rules reject short and control-character values", () => {
  assert.equal(passwordOk("1234567"), false);
  assert.equal(passwordOk("12345678"), true);
  assert.equal(passwordOk("ok-password\n"), false);
});

test("missing email or password skips and drops the other value", () => {
  const neither = liveGate({});
  assert.equal(neither.skip, true);
  assert.equal(neither.email, "");
  assert.equal(neither.password, "");
  assert.equal(neither.serviceRole, "");
  assert.match(neither.reason, /INSIGHT_TEST_EMAIL or INSIGHT_TEST_PASSWORD/);

  const passwordOnly = liveGate({ INSIGHT_TEST_PASSWORD: PASSWORD });
  assert.equal(passwordOnly.skip, true);
  assert.equal(passwordOnly.password, "");
  assert.doesNotMatch(passwordOnly.reason, new RegExp(PASSWORD));

  const ready = liveGate({
    INSIGHT_TEST_EMAIL: `  ${EMAIL}  `,
    INSIGHT_TEST_PASSWORD: PASSWORD,
    INSIGHT_TEST_SERVICE_ROLE_KEY: "service-role-key-value",
  });
  assert.equal(ready.skip, false);
  assert.equal(ready.email, EMAIL);
  assert.equal(ready.serviceRole, "service-role-key-value");
});

test("a real-looking address is refused before any network call", () => {
  assert.throws(
    () => assertConfigured({ skip: false, email: "person@example.com", password: PASSWORD }),
    /insight-live/
  );
});

test("redaction removes the email, the password, and their encoded forms", () => {
  const text = `failed for ${EMAIL} with ${PASSWORD} and ${encodeURIComponent(EMAIL)}`;
  const cleaned = redactText(text, [EMAIL, PASSWORD]);
  assert.equal(cleaned.includes(EMAIL), false);
  assert.equal(cleaned.includes(PASSWORD), false);
  assert.equal(cleaned.includes(encodeURIComponent(EMAIL)), false);
  assert.match(cleaned, /\[redacted\]/);
});

test("the service role must not be the publishable key", () => {
  assert.equal(serviceRoleOk("short", "publishable-key-value"), false);
  assert.equal(serviceRoleOk("publishable-key-value-xxxx", "publishable-key-value-xxxx"), false);
  assert.equal(serviceRoleOk("service-role-key-value", "publishable-key-value"), true);
});

test("the allowlist permits Pages, static CDNs, and delete-account only", () => {
  assert.equal(SUPABASE_HOST, EXPECTED_SUPABASE_HOST);
  assert.equal(liveRequestAllowed(`${LIVE_BASE_URL}index.html`), true);
  assert.equal(liveRequestAllowed(`${SB_URL}/auth/v1/token?grant_type=password`), true);
  assert.equal(liveRequestAllowed(`${SB_URL}/rest/v1/user_data?user_id=eq.1`), true);
  assert.equal(liveRequestAllowed(`${SB_URL}/functions/v1/delete-account`), true);
  assert.equal(liveRequestAllowed("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"), true);
  assert.equal(liveRequestAllowed("https://fonts.googleapis.com/css?family=Lexend"), true);
  assert.equal(liveRequestAllowed("https://fonts.gstatic.com/s/lexend/v1.woff2"), true);
  assert.equal(liveRequestAllowed(`${SB_URL}/functions/v1/food-photo`), false);
  assert.equal(liveRequestAllowed(`${SB_URL}/functions/v1/oura-sync`), false);
  assert.equal(liveRequestAllowed(`${SB_URL}/functions/v1/purge-range`), false);
  assert.equal(liveRequestAllowed("https://o4512196136206336.ingest.us.sentry.io/api/1/envelope/"), false);
  assert.equal(liveRequestAllowed("https://us.i.posthog.com/e/"), false);
  assert.equal(liveRequestAllowed("https://example.com/"), false);
  assert.equal(liveRequestAllowed(`https://${PAGES_HOST}.evil.com/logger/`), false);
  assert.equal(liveRequestAllowed(`https://${SUPABASE_HOST}.evil.com/auth/v1/token`), false);
  assert.equal(describeDenied(`${SB_URL}/functions/v1/food-photo?token=secret`), "supabase function food-photo");
  assert.equal(describeDenied("https://example.com/path?q=secret").includes("secret"), false);
});

test("purge checks cover every table delete-account knows", () => {
  const src = readFileSync(join(root, "supabase/functions/delete-account/index.ts"), "utf8");
  const match = src.match(/const KNOWN = \[([^\]]+)\]/);
  assert.ok(match, "delete-account KNOWN list");
  const known = [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
  assert.deepEqual(PURGE_TABLES, known);
  const account = readFileSync(join(root, "logger/tests/live/account.mjs"), "utf8");
  assert.match(account, /import \{[^}]*PURGE_TABLES[^}]*\} from "\.\/gate\.mjs"/);
  assert.equal(account.includes("const PURGE_TABLES"), false);
});

test("the live workflow is manual or weekly and does not print secrets", () => {
  const src = readFileSync(join(root, ".github/workflows/live-checks.yml"), "utf8");
  assert.match(src, /workflow_dispatch:/);
  assert.match(src, /schedule:/);
  assert.match(src, /INSIGHT_TEST_EMAIL/);
  assert.match(src, /INSIGHT_TEST_PASSWORD/);
  assert.match(src, /INSIGHT_TEST_SERVICE_ROLE_KEY/);
  const lines = src.split("\n");
  for (const line of lines) {
    assert.doesNotMatch(line, /^\s*pull_request:/);
    assert.doesNotMatch(line, /^\s*push:/);
    assert.doesNotMatch(line, /^\s*cache:/);
    assert.doesNotMatch(line, /set -x/);
    assert.doesNotMatch(line, /echo .*\$(\{|\{?\{? secrets\.|INSIGHT_TEST_)/);
  }
});

test("PR smoke does not define a live project", () => {
  const src = readFileSync(join(root, "playwright.config.mjs"), "utf8");
  assert.equal(src.includes('name: "live-chromium"'), false);
  assert.match(src, /playwright\.live\.config\.mjs/);
  const live = readFileSync(join(root, "playwright.live.config.mjs"), "utf8");
  assert.match(live, /dependencies:\s*\["live-boot"\]/);
  assert.match(live, /trace: "off"/);
  assert.match(live, /screenshot: "off"/);
  assert.match(live, /video: "off"/);
  assert.match(live, /serviceWorkers: "block"/);
});

test("run-live skips without printing a provided password", () => {
  const result = spawnSync(process.execPath, [join(root, "logger/tests/live/run-live.mjs")], {
    env: {
      ...process.env,
      INSIGHT_TEST_EMAIL: "",
      INSIGHT_TEST_PASSWORD: PASSWORD,
      INSIGHT_TEST_SERVICE_ROLE_KEY: "service-role-key-value",
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert.match(output, /skipped/);
  assert.equal(output.includes(PASSWORD), false);
  assert.equal(output.includes("service-role-key-value"), false);
});

test("live source does not embed an address or a service key", () => {
  const dir = join(root, "logger/tests/live");
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (!statSync(path).isFile()) continue;
    const src = readFileSync(path, "utf8");
    assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(src), false, name);
    assert.equal(src.includes("sb_secret_"), false, name);
    assert.equal(src.includes("service_role"), false, name);
  }
});
