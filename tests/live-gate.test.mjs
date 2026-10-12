import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assertSpecsUseAppFixture } from "../logger/tests/e2e/check-imports.mjs";
import { describeDenied, liveRequestAllowed, STATIC_HOSTS } from "../logger/tests/live/allowlist.mjs";
import {
  assertConfigured,
  liveGate,
  passwordOk,
  PROBE_NAME,
  purgeSkippedOnSchedule,
  PURGE_TABLES,
  redactError,
  redactText,
  serviceRoleOk,
  throwawayEmailOk,
} from "../logger/tests/live/gate.mjs";
import { deleteRefusal, pollUntil, probeLanded, requireCount, requireStorageList } from "../logger/tests/live/purge-check.mjs";
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

test("an error that echoes the throwaway email is redacted", () => {
  const err = new Error(`Could not finish for ${EMAIL}`);
  err.stack = `Error: Could not finish for ${EMAIL}\n    at signIn (${encodeURIComponent(EMAIL)})`;
  const secrets = [EMAIL, PASSWORD];
  const wrapped = redactError(err, secrets, "Could not finish.");
  assert.equal(wrapped.message.includes(EMAIL), false);
  assert.equal(wrapped.stack.includes(EMAIL), false);
  assert.equal(wrapped.stack.includes(encodeURIComponent(EMAIL)), false);
  assert.match(wrapped.message, /\[redacted\]/);
  assert.match(wrapped.stack, /\[redacted\]/);
  const blank = new Error("");
  blank.stack = `Error\n    at signIn (${EMAIL})`;
  const fromFallback = redactError(blank, secrets, `Could not finish for ${EMAIL}`);
  assert.equal(fromFallback.message.includes(EMAIL), false);
  assert.equal(fromFallback.stack.includes(EMAIL), false);
  assert.match(fromFallback.message, /\[redacted\]/);
});

function purgeCatchBlock(src) {
  const marker = "\n    } catch (err) {";
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, "purge catch block");
  const open = at + marker.length - 1;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(at + 1, i + 1);
    }
  }
  assert.fail("purge catch block did not close");
}

function hasBareThrowErr(block) {
  return block.split("\n").some((line) => /^\s*throw\s+err\s*;?\s*$/.test(line));
}

test("the purge catch redacts failures instead of rethrowing the raw error", () => {
  const spec = readFileSync(join(root, "logger/tests/live/account-purge.spec.mjs"), "utf8");
  const block = purgeCatchBlock(spec);
  assert.match(block, /deleteThrowawayAccount/);
  assert.match(block, /redactError\(err, secrets, "Account purge failed\."\)/);
  assert.match(block, /redactError\(cleanupErr, secrets, "Could not delete the throwaway account\."\)/);
  assert.equal(hasBareThrowErr(block), false, "purge catch rethrows the raw error");
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

function workflowSteps(src) {
  const steps = [];
  let current = null;
  for (const line of src.split("\n")) {
    const name = line.match(/^      - name: (.+)$/);
    if (name) {
      current = { name: name[1].trim(), lines: [line] };
      steps.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return steps.map((step) => ({ name: step.name, text: step.lines.join("\n") }));
}

function ifCondition(step) {
  const line = step.text.split("\n").find((item) => item.trim().startsWith("if:"));
  return line ? line.trim() : "";
}

test("the live workflow is manual or weekly and does not print secrets", () => {
  const src = readFileSync(join(root, ".github/workflows/live-checks.yml"), "utf8");
  assert.match(src, /workflow_dispatch:/);
  assert.match(src, /schedule:/);
  assert.equal(src.includes("GITHUB_EVENT_NAME"), false);
  const lines = src.split("\n");
  for (const line of lines) {
    assert.doesNotMatch(line, /^\s*pull_request:/);
    assert.doesNotMatch(line, /^\s*push:/);
    assert.doesNotMatch(line, /^\s*cache:/);
    assert.doesNotMatch(line, /set -x/);
    assert.doesNotMatch(line, /echo .*\$(\{|\{?\{? secrets\.|INSIGHT_TEST_)/);
  }
  const steps = workflowSteps(src);
  const boot = steps.find((step) => step.text.includes("--project=live-boot"));
  const purge = steps.find((step) => step.text.includes("--project=live-purge"));
  assert.ok(boot, "page check step");
  assert.ok(purge, "purge step");
  assert.equal(ifCondition(boot), "if: steps.gate.outputs.present == 'true'");
  assert.equal(ifCondition(purge), "if: steps.gate.outputs.present == 'true' && github.event_name == 'workflow_dispatch'");
  assert.match(boot.text, /INSIGHT_TEST_EMAIL/);
  assert.match(boot.text, /INSIGHT_TEST_PASSWORD/);
  assert.equal(boot.text.includes("INSIGHT_TEST_SERVICE_ROLE_KEY"), false);
  const keySteps = steps.filter((step) => step.text.includes("INSIGHT_TEST_SERVICE_ROLE_KEY"));
  assert.deepEqual(keySteps.map((step) => step.name), [purge.name]);
  const keyLines = src.split("\n").filter((line) => line.includes("INSIGHT_TEST_SERVICE_ROLE_KEY"));
  assert.deepEqual(keyLines.map((line) => line.trim()), [
    "INSIGHT_TEST_SERVICE_ROLE_KEY: ${{ secrets.INSIGHT_TEST_SERVICE_ROLE_KEY }}",
  ]);
  const spec = readFileSync(join(root, "logger/tests/live/account-purge.spec.mjs"), "utf8");
  assert.match(spec, /purgeSkippedOnSchedule\(process\.env\.GITHUB_EVENT_NAME\)/);
});

test("a scheduled run skips the account delete", () => {
  assert.equal(purgeSkippedOnSchedule("schedule"), true);
  assert.equal(purgeSkippedOnSchedule("workflow_dispatch"), false);
  assert.equal(purgeSkippedOnSchedule(undefined), false);
  assert.equal(purgeSkippedOnSchedule(""), false);
});

test("count and storage errors fail closed", () => {
  const messages = [
    "relation does not exist",
    "column user_id does not exist",
    "Could not find the table in the schema cache",
    "could not find the table",
  ];
  for (const message of messages) {
    assert.throws(() => requireCount("user_data", { message, status: 404 }, 0), /Could not count user_data/);
  }
  assert.throws(() => requireCount("ai_usage", { message: "not found" }, null), /Could not count ai_usage/);
  assert.equal(requireCount("user_data", null, 0), 0);
  assert.throws(() => requireStorageList({ message: "Object not found", status: 404 }, []), /Could not list progress storage/);
  assert.throws(() => requireStorageList({ message: "Bucket not found" }, null), /Could not list progress storage/);
  assert.throws(() => requireStorageList(null, null), /Could not list progress storage/);
  assert.deepEqual(requireStorageList(null, []), []);
  assert.deepEqual(requireStorageList(null, [{ name: ".emptyFolderPlaceholder" }]), []);
  assert.deepEqual(requireStorageList(null, [{ name: "live-probe.jpg" }]), ["live-probe.jpg"]);
  const account = readFileSync(join(root, "logger/tests/live/account.mjs"), "utf8");
  assert.match(account, /requireCount\(table, error, count\)/);
  assert.match(account, /requireStorageList\(listed\.error, listed\.data\)/);
  assert.equal(account.includes("schema cache"), false);
  assert.equal(account.includes("if (missing) return 0"), false);
  assert.match(account, /seedPurgeTargets/);
  assert.match(account, /pollUntil/);
  assert.match(account, /alreadyExists\(created\.error\)/);
  assert.match(account, /deleteThrowawayAccount/);
  assert.match(account, /deleteRefusal\(\{ email, userId \}\)/);
  assert.match(account, /deleteRefusal\(\{ email, userId, loadedEmail: user\.email \}\)/);
  assert.match(account, /probeLanded\(data\)/);
  const spec = readFileSync(join(root, "logger/tests/live/account-purge.spec.mjs"), "utf8");
  assert.match(spec, /cloudPush/);
  assert.match(spec, /The page did not expose cloudPush/);
  assert.match(spec, /throw redactError\(err, secrets,/);
  assert.match(spec, /deleteThrowawayAccount/);
  assert.equal(spec.includes("waitForFunction(async"), false);
});

test("the user_data poll waits and still fails closed", async () => {
  let reads = 0;
  await pollUntil(async () => {
    reads += 1;
    return reads >= 3;
  }, { timeoutMs: 200, intervalMs: 10, missing: "user_data was not written before the purge check." });
  assert.equal(reads, 3);
  await assert.rejects(
    () => pollUntil(async () => false, { timeoutMs: 30, intervalMs: 10, missing: "user_data was not written before the purge check." }),
    /user_data was not written before the purge check/
  );
  await assert.rejects(
    () => pollUntil(async () => { throw new Error("Could not read user_data before the purge check (status 404)."); }, {
      timeoutMs: 200,
      intervalMs: 10,
      missing: "user_data was not written before the purge check.",
    }),
    /Could not read user_data/
  );
});

const GATE_SEED = Number(process.env.LIVE_GATE_SEED ?? 20261012);

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function randInt(rng, n) {
  return Math.floor(rng() * n);
}

function chunk(rng, max) {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const n = 1 + randInt(rng, max);
  let out = "";
  for (let i = 0; i < n; i++) out += alphabet[randInt(rng, alphabet.length)];
  return out;
}

function casedMarker(rng) {
  return [..."insight-live"].map((ch) => (ch === "-" || rng() < 0.5 ? ch : ch.toUpperCase())).join("");
}

function goodDomain(rng) {
  const host = chunk(rng, 10).toLowerCase();
  const tld = pick(rng, ["com", "org", "net", "io", "co"]);
  if (rng() < 0.3) return `${host}.mail.${tld}`;
  return `${host}.${tld}`;
}

function goodEmail(rng) {
  const marker = casedMarker(rng);
  const seps = [".", "+", "_", "-"];
  const mode = randInt(rng, 4);
  let local = marker;
  if (mode === 1) local = `${chunk(rng, 8)}${pick(rng, seps)}${marker}`;
  else if (mode === 2) local = `${marker}${pick(rng, seps)}${chunk(rng, 8)}`;
  else if (mode === 3) local = `${chunk(rng, 6)}${pick(rng, seps)}${marker}${pick(rng, seps)}${chunk(rng, 6)}`;
  return `${local}@${goodDomain(rng)}`;
}

function rejectEmail(rng, kind) {
  const marker = casedMarker(rng);
  const seps = [".", "+", "_", "-"];
  const local = `${chunk(rng, 4)}${pick(rng, seps)}${marker}`;
  if (kind === "glued") {
    const left = chunk(rng, 4);
    const right = chunk(rng, 4);
    const mode = randInt(rng, 3);
    const glued = mode === 0 ? `${left}${marker}` : mode === 1 ? `${marker}${right}` : `${left}${marker}${right}`;
    return `${glued}@${goodDomain(rng)}`;
  }
  if (kind === "two-at") return `${local}@${chunk(rng, 3).toLowerCase()}@${goodDomain(rng)}`;
  if (kind === "space") {
    const space = pick(rng, [" ", "\t", "\n"]);
    return pick(rng, [
      `${chunk(rng, 3)}${space}${marker}@${goodDomain(rng)}`,
      `${marker}@ex${space}ample.com`,
      ` ${marker}@example.com`,
    ]);
  }
  if (kind === "unicode") {
    const mark = pick(rng, ["í", "é", "ü", "你", "ø"]);
    const good = goodEmail(rng);
    const at = randInt(rng, good.length);
    return `${good.slice(0, at)}${mark}${good.slice(at)}`;
  }
  if (kind === "domain") {
    const domain = pick(rng, ["localhost", "example.c", ".example.com", "example.com.", "example..com", "com", "", ".com"]);
    return `${local}@${domain}`;
  }
  return `${"a".repeat(40)}.${marker}.${"b".repeat(200)}@example.com`;
}

function show(value) {
  return JSON.stringify(value);
}

function boundary(ch) {
  return ch === "" || ch === "." || ch === "+" || ch === "_" || ch === "-";
}

function referenceEmailOk(email) {
  if (typeof email !== "string" || !email || email.length > 254 || /\s/.test(email)) return false;
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const local = parts[0];
  const domain = parts[1];
  if (!/^[A-Za-z0-9._+-]+$/.test(local)) return false;
  if (!/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(domain)) return false;
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return false;
  const marker = "insight-live";
  const lower = local.toLowerCase();
  let from = 0;
  while (from < lower.length) {
    const at = lower.indexOf(marker, from);
    if (at < 0) return false;
    const before = at === 0 ? "" : lower[at - 1];
    const afterAt = at + marker.length;
    const after = afterAt >= lower.length ? "" : lower[afterAt];
    if (boundary(before) && boundary(after)) return true;
    from = at + 1;
  }
  return false;
}

function referenceRequestAllowed(url) {
  let parsed;
  try { parsed = new URL(url); }
  catch { return false; }
  if (parsed.protocol === "data:" || parsed.protocol === "blob:") return true;
  if (parsed.username !== "" || parsed.password !== "" || parsed.port !== "") return false;
  const schemeAt = url.indexOf("://");
  const pathAt = schemeAt < 0 ? -1 : url.indexOf("/", schemeAt + 3);
  const rawPath = pathAt < 0 ? "" : url.slice(pathAt).split("?")[0].split("#")[0];
  if (/%2f/i.test(rawPath) || /%2e/i.test(rawPath)) return false;
  if (rawPath.split("/").includes(".") || rawPath.split("/").includes("..")) return false;
  if (STATIC_HOSTS.includes(parsed.hostname)) return parsed.protocol === "https:";
  if (parsed.hostname !== SUPABASE_HOST) return false;
  if (parsed.protocol !== "https:" && parsed.protocol !== "wss:") return false;
  const segments = parsed.pathname.split("/").filter((segment) => segment !== "");
  const functionCall = segments[0] === "functions" && segments[1] === "v1";
  if (!functionCall) return true;
  if (parsed.protocol !== "https:") return false;
  if (segments.length !== 3) return false;
  try { return decodeURIComponent(segments[2]) === "delete-account"; }
  catch { return false; }
}

test("throwawayEmailOk holds on seeded random addresses", () => {
  const rng = mulberry32(GATE_SEED);
  const accepted = [
    "owner+insight-live@example.com",
    "a.insight-live.b@example.com",
    "owner_insight-live@example.com",
    "owner-INSIGHT-LIVE@Example.COM",
    goodEmail(rng),
  ];
  const rejected = [
    "xinsight-live@example.com",
    "insight-lived@example.com",
    "abinsight-livecd@example.com",
    "owner+insight-live@foo@example.com",
    "owner +insight-live@example.com",
    "owner+insight-live@exämple.com",
    "insight-live@localhost",
    "insight-live@example.c",
    "insight-live@.example.com",
    "insight-live@example.com.",
    "insight-live@example..com",
    `${"a".repeat(40)}.insight-live.${"b".repeat(200)}@example.com`,
  ];
  for (let i = 0; i < 24; i++) accepted.push(goodEmail(rng));
  for (const kind of ["glued", "two-at", "space", "unicode", "domain", "long"]) {
    for (let i = 0; i < 8; i++) rejected.push(rejectEmail(rng, kind));
  }
  for (const email of accepted) {
    assert.equal(email.length <= 254, true, `seed ${GATE_SEED} accept length ${show(email)}`);
    assert.equal(throwawayEmailOk(email), true, `seed ${GATE_SEED} accept ${show(email)}`);
    assert.equal(referenceEmailOk(email), throwawayEmailOk(email), `seed ${GATE_SEED} email reference ${show(email)}`);
  }
  for (const email of rejected) {
    assert.equal(throwawayEmailOk(email), false, `seed ${GATE_SEED} reject ${show(email)}`);
    assert.equal(referenceEmailOk(email), throwawayEmailOk(email), `seed ${GATE_SEED} email reference ${show(email)}`);
  }
});

function goodStaticUrl(rng) {
  const host = pick(rng, STATIC_HOSTS);
  const path = pick(rng, [
    "/",
    "/index.html",
    "/wellnesstracker/logger/index.html",
    "/npm/@supabase/supabase-js@2",
    `/${chunk(rng, 6)}.html`,
    "/css?family=Lexend",
  ]);
  return `https://${host}${path}`;
}

function goodDeleteUrl(rng) {
  const suffix = pick(rng, ["", "/", "?confirm=DELETE", "/?x=1"]);
  return `https://${SUPABASE_HOST}/functions/v1/delete-account${suffix}`;
}

function rejectUrl(rng, kind) {
  const host = SUPABASE_HOST;
  const staticHost = pick(rng, STATIC_HOSTS);
  const fn = pick(rng, ["food-photo", "food-describe", "oura-sync", "oura-connect", "purge-range", "delete_account", "delete-accounts", `fn-${chunk(rng, 6).toLowerCase()}`]);
  if (kind === "function") {
    return pick(rng, [
      `https://${host}/functions/v1/${fn}`,
      `https://${host}/functions/v1/${fn}/`,
      `https://${host}/functions/v1/delete-account/${fn}`,
    ]);
  }
  if (kind === "encoded") {
    return pick(rng, [
      `https://${host}/functions%2Fv1%2Fdelete-account`,
      `https://${host}/functions/v1/delete-account%2F${fn}`,
      `https://${host}/functions/v1/delete-account%2f..%2f${fn}`,
      `https://${staticHost}/a%2Fb`,
      `https://${staticHost}/a%2eb`,
    ]);
  }
  if (kind === "dot") {
    return pick(rng, [
      `https://${host}/functions/v1/${fn}/../delete-account`,
      `https://${host}/functions/v1/./delete-account`,
      `https://${host}/functions/v1/delete-account/./`,
      `https://${staticHost}/a/../index.html`,
      `https://${staticHost}/./index.html`,
    ]);
  }
  if (kind === "http") {
    return pick(rng, [
      `http://${host}/functions/v1/delete-account`,
      `http://${staticHost}/index.html`,
      `http://${host}/auth/v1/token`,
    ]);
  }
  if (kind === "ws") {
    return pick(rng, [
      `ws://${host}/realtime/v1/websocket`,
      `ws://${host}/functions/v1/delete-account`,
      `ws://${staticHost}/`,
      `wss://${staticHost}/socket`,
    ]);
  }
  if (kind === "lookalike") {
    const base = pick(rng, [host, ...STATIC_HOSTS]);
    const name = pick(rng, [`${base}.evil.com`, `evil.${base}`, `not-${base}`, `${base}.example.com`]);
    return `https://${name}/functions/v1/delete-account`;
  }
  if (kind === "userinfo") {
    return pick(rng, [
      `https://evil@${host}/functions/v1/delete-account`,
      `https://evil:secret@${host}/auth/v1/token`,
      `https://evil@${staticHost}/index.html`,
      `https://cdn.jsdelivr.net:444/npm/pkg`,
      `https://${host}:8443/functions/v1/delete-account`,
      `https://${staticHost}:444/`,
    ]);
  }
  return pick(rng, [
    `https://example.com/functions/v1/delete-account`,
    `https://${chunk(rng, 8).toLowerCase()}.example.com/`,
    `https://example.org/`,
  ]);
}

test("liveRequestAllowed holds on seeded random urls", () => {
  const rng = mulberry32(GATE_SEED);
  const accepted = [
    `https://${SUPABASE_HOST}/functions/v1/delete-account`,
    `https://${SUPABASE_HOST}/functions/v1/delete-account/`,
    `https://${PAGES_HOST}/wellnesstracker/logger/index.html`,
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    "https://fonts.googleapis.com/css?family=Lexend",
    "https://fonts.gstatic.com/s/lexend/v1.woff2",
    // data: and blob: stay inside the page. They are allowed, including encoded slashes.
    "data:text/plain,insight",
    "data:image/jpeg;base64,a%2Fb",
    `blob:https://${PAGES_HOST}/11111111-1111-1111-1111-111111111111`,
  ];
  const rejected = [
    `https://${SUPABASE_HOST}/functions/v1/food-photo`,
    `https://${SUPABASE_HOST}/functions/v1/oura-sync`,
    `https://${SUPABASE_HOST}/functions%2Fv1%2Fdelete-account`,
    `https://${SUPABASE_HOST}/functions/v1/delete-account%2Ffood-photo`,
    `https://${SUPABASE_HOST}/functions/v1/food-photo/../delete-account`,
    `https://${SUPABASE_HOST}/functions/v1/./delete-account`,
    `http://${SUPABASE_HOST}/functions/v1/delete-account`,
    `http://${PAGES_HOST}/wellnesstracker/logger/`,
    `ws://${SUPABASE_HOST}/realtime/v1/websocket`,
    `ws://${PAGES_HOST}/`,
    "https://example.com/functions/v1/delete-account",
    `https://${PAGES_HOST}.evil.com/logger/`,
    `https://${SUPABASE_HOST}.evil.com/functions/v1/delete-account`,
    `https://evil.${SUPABASE_HOST}/functions/v1/delete-account`,
    `https://evil@${SUPABASE_HOST}/functions/v1/delete-account`,
    `https://evil:secret@${SUPABASE_HOST}/auth/v1/token`,
    `https://${SUPABASE_HOST}:8443/functions/v1/delete-account`,
    "https://cdn.jsdelivr.net:444/npm/@supabase/supabase-js@2",
  ];
  for (let i = 0; i < 16; i++) {
    accepted.push(goodStaticUrl(rng));
    accepted.push(goodDeleteUrl(rng));
    accepted.push(i % 2 === 0 ? `data:text/plain,${chunk(rng, 6)}` : `blob:https://${PAGES_HOST}/${chunk(rng, 8)}`);
  }
  for (const kind of ["function", "encoded", "dot", "http", "ws", "host", "lookalike", "userinfo"]) {
    for (let i = 0; i < 8; i++) rejected.push(rejectUrl(rng, kind));
  }
  for (const url of accepted) {
    assert.equal(liveRequestAllowed(url), true, `seed ${GATE_SEED} accept ${show(url)}`);
    assert.equal(referenceRequestAllowed(url), liveRequestAllowed(url), `seed ${GATE_SEED} url reference ${show(url)}`);
  }
  for (const url of rejected) {
    assert.equal(liveRequestAllowed(url), false, `seed ${GATE_SEED} reject ${show(url)}`);
    assert.equal(referenceRequestAllowed(url), liveRequestAllowed(url), `seed ${GATE_SEED} url reference ${show(url)}`);
  }
});

function hexDigits(rng, n) {
  let out = "";
  for (let i = 0; i < n; i++) out += "0123456789abcdef"[randInt(rng, 16)];
  return out;
}

function goodUuid(rng) {
  return `${hexDigits(rng, 8)}-${hexDigits(rng, 4)}-${hexDigits(rng, 4)}-${hexDigits(rng, 4)}-${hexDigits(rng, 12)}`;
}

function badUuid(rng) {
  const valid = goodUuid(rng);
  return pick(rng, [
    "",
    "not-a-uuid",
    valid.slice(1),
    valid.replace("-", ""),
    `${valid} `,
    `${valid}x`,
    "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz",
    null,
    12,
  ]);
}

function recaseEmail(rng, email) {
  return [...email].map((ch) => (rng() < 0.5 ? ch.toUpperCase() : ch.toLowerCase())).join("");
}

function differentEmail(rng, expected) {
  for (let i = 0; i < 8; i++) {
    const candidate = pick(rng, [
      "person@example.com",
      goodEmail(rng),
      `not-${expected}`,
      expected.slice(0, -1),
    ]);
    if (String(candidate).toLowerCase() !== expected.toLowerCase()) return candidate;
  }
  return `not-${expected}`;
}

function probeRow(weighIns, name = PROBE_NAME) {
  return { data: { profile: { name, weighIns, units: "metric" } }, updated_at: "2026-10-12T00:00:00Z" };
}

test("delete refusals and probe rows hold on seeded random inputs", () => {
  const rng = mulberry32(GATE_SEED);
  const allowed = [];
  const refused = [];
  const landed = [];
  const missed = [];
  allowed.push({ email: "owner+insight-live@example.com", userId: "11111111-1111-1111-1111-111111111111", loadedEmail: "OWNER+INSIGHT-LIVE@example.com" });
  refused.push(
    { email: "person@example.com", userId: "11111111-1111-1111-1111-111111111111", reason: "email" },
    { email: "xinsight-live@example.com", userId: "11111111-1111-1111-1111-111111111111", reason: "email" },
    { email: "owner+insight-live@example.com", userId: "not-a-uuid", reason: "uuid" },
    { email: "owner+insight-live@example.com", userId: "11111111-1111-1111-1111-111111111111", loadedEmail: "person@example.com", reason: "mismatch" },
  );
  landed.push(probeRow([{ date: "2026-10-12", kg: 80 }]));
  missed.push(
    null,
    {},
    { data: {} },
    { data: { profile: { name: PROBE_NAME, weighIns: [] } } },
    { data: { profile: { name: "live probe", weighIns: [{ kg: 80 }] } } },
    { data: { profile: { name: PROBE_NAME, weighIns: "80" } } },
  );
  for (let i = 0; i < 200; i++) {
    const email = goodEmail(rng);
    const userId = goodUuid(rng);
    allowed.push({ email, userId, loadedEmail: recaseEmail(rng, email) });
    allowed.push({ email, userId });
    refused.push({ email: rejectEmail(rng, pick(rng, ["glued", "two-at", "space", "unicode", "domain", "long"])), userId, reason: "email" });
    refused.push({ email, userId: badUuid(rng), reason: "uuid" });
    refused.push({ email, userId, loadedEmail: differentEmail(rng, email), reason: "mismatch" });
    landed.push(probeRow(
      Array.from({ length: 1 + randInt(rng, 3) }, () => ({ date: "2026-10-12", kg: 40 + randInt(rng, 80), note: chunk(rng, 4) })),
      PROBE_NAME
    ));
    const badName = pick(rng, ["live probe", "LIVE PROBE", `${PROBE_NAME} `, ` ${PROBE_NAME}`, `x${PROBE_NAME}`, chunk(rng, 8)]);
    missed.push(probeRow([{ kg: 80 }], badName));
    missed.push(probeRow(pick(rng, [[], null, "80", { length: 1 }, 1])));
    missed.push({ data: { profile: null } });
  }
  for (const input of allowed) {
    assert.equal(deleteRefusal(input), "", `seed ${GATE_SEED} allow delete ${show(input)}`);
  }
  for (const input of refused) {
    assert.equal(deleteRefusal(input), input.reason, `seed ${GATE_SEED} refuse ${input.reason} ${show(input)}`);
  }
  for (const row of landed) {
    assert.equal(probeLanded(row), true, `seed ${GATE_SEED} probe landed ${show(row)}`);
  }
  for (const row of missed) {
    assert.equal(probeLanded(row), false, `seed ${GATE_SEED} probe missed ${show(row)}`);
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
