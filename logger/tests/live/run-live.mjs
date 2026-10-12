// Entry point for the deployed-site checks.
// Missing email or password skips with exit 0. Playwright is loaded only after
// that, so a machine without node_modules still skips cleanly.
import { liveGate } from "./gate.mjs";

const gate = liveGate(process.env);
if (gate.skip) {
  console.log(`pw:live: skipped. ${gate.reason}`);
  process.exit(0);
}

const { spawnSync } = await import("node:child_process");
const { createRequire } = await import("node:module");
const { dirname, join } = await import("node:path");

const require = createRequire(import.meta.url);
let cli;
try {
  cli = join(dirname(require.resolve("@playwright/test/package.json")), "cli.js");
} catch {
  console.error("pw:live: Playwright is not installed. Run npm ci, then npx playwright install chromium.");
  process.exit(1);
}

const env = { ...process.env };
delete env.DEBUG;
delete env.PWDEBUG;
delete env.NODE_DEBUG;

console.log("pw:live: credentials are set. Running the deployed-site checks.");
const result = spawnSync(process.execPath, [
  cli,
  "test",
  "-c",
  "playwright.live.config.mjs",
  ...process.argv.slice(2),
], { stdio: "inherit", env });
process.exit(result.status == null ? 1 : result.status);
