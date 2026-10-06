// Runs the PR smoke projects that are actually installed.
// PW_PROJECTS=iphone-webkit (comma-separated) forces the list. CI sets that.
// With no WebKit browser, the Chromium iPhone project still runs.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

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

const args = [cli, "test", ...projects.flatMap((name) => ["--project", name]), ...process.argv.slice(2)];
const result = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(result.status == null ? 1 : result.status);
