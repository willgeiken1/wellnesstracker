// Runs the PR smoke projects that are actually installed.
// PW_PROJECTS=iphone-webkit (comma-separated) forces the list. CI sets that.
// With no WebKit browser, the Chromium iPhone project still runs.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSpecsUseAppFixture } from "./check-imports.mjs";
import { selfTestExpectedFailure } from "./fixtures/app.mjs";
import { assertLoopbackOnly } from "./fixtures/loopback-only.mjs";

const require = createRequire(import.meta.url);
const { chromium, webkit } = require("playwright");
const cli = join(dirname(require.resolve("@playwright/test/package.json")), "cli.js");

function installed(browserType) {
  try { return existsSync(browserType.executablePath()); }
  catch { return false; }
}

const requested = (process.env.PW_PROJECTS || "").split(/[,\s]+/).filter(Boolean);
const present = [];
if (installed(webkit)) present.push("iphone-webkit");
if (installed(chromium)) present.push("iphone-chromium");

const projects = requested.length ? requested : present;
if (!projects.length) {
  console.error("pw:smoke: no Playwright browser is installed. Run: npx playwright install webkit chromium");
  process.exit(1);
}
if (!requested.length && !present.includes("iphone-webkit")) {
  console.log("pw:smoke: WebKit is not installed, so this run uses iphone-chromium only.");
}

const specDir = dirname(fileURLToPath(import.meta.url));
try {
  selfTestExpectedFailure();
  assertSpecsUseAppFixture(specDir);
} catch (err) {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
}

// PW_REPEAT=N runs each test N times with retries still 0, so a guard hit
// cannot pass on a later attempt. Unexpected failures are the flake count.
const repeat = Number(process.env.PW_REPEAT || "");
const repeatArgs = Number.isInteger(repeat) && repeat > 1 ? [`--repeat-each=${repeat}`] : [];

if (projects.includes("iphone-webkit")) {
  try {
    await assertLoopbackOnly();
  } catch (err) {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  }
}

const args = [cli, "test", ...projects.flatMap((name) => ["--project", name]), ...repeatArgs, ...process.argv.slice(2)];
const result = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(result.status == null ? 1 : result.status);
