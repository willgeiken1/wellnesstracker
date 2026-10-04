import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const versionUrl = new URL("../logger/js/version.js", import.meta.url);
await import(versionUrl.href);

const INTEGER_CACHE = /insight-shell-v(\d+)(?!\.\d)/g;

function jsFiles(dir) {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...jsFiles(path));
    else if (ent.isFile() && /\.(js|mjs)$/.test(ent.name)) out.push(path);
  }
  return out;
}

function shellEntries(sw) {
  const marker = "const SHELL = [";
  const start = sw.indexOf(marker);
  assert.ok(start >= 0, "logger/sw.js is missing the SHELL list");
  const end = sw.indexOf("];", start);
  assert.ok(end > start, "logger/sw.js SHELL list does not end");
  const body = sw.slice(start + marker.length, end);
  return [...body.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
}

test("app version is semver and is the only release source", () => {
  const version = globalThis.INSIGHT_APP_VERSION;
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(globalThis.INSIGHT_SHELL_CACHE, "insight-shell-v" + version);

  const src = readFileSync(versionUrl, "utf8");
  const literals = [...src.matchAll(/INSIGHT_APP_VERSION\s*=\s*"([^"]+)"/g)];
  assert.equal(literals.length, 1, "logger/js/version.js must set INSIGHT_APP_VERSION once");
  assert.equal(literals[0][1], version);
});

test("service worker and Sentry derive the release from version.js", () => {
  const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
  const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
  assert.match(sw, /importScripts\("\.\/js\/version\.js"\)/);
  assert.match(
    sw,
    /const CACHE = globalThis\.INSIGHT_SHELL_CACHE;/,
    "logger/sw.js must set CACHE from version.js. Do not assign a hand-written cache name."
  );
  assert.doesNotMatch(
    sw,
    /const CACHE = "/,
    "logger/sw.js must set CACHE from version.js. Do not assign a hand-written cache name."
  );
  assert.match(sw, /keys\.filter\(\(k\) => k !== CACHE\)/);
  assert.match(sw, /caches\.delete\(k\)/);
  assert.match(sentry, /import "\.\/version\.js";/);
  assert.match(
    sentry,
    /export const SENTRY_RELEASE = globalThis\.INSIGHT_APP_VERSION;/,
    "Sentry release must be INSIGHT_APP_VERSION from logger/js/version.js."
  );
  assert.doesNotMatch(
    sentry,
    /SENTRY_RELEASE = "/,
    "Sentry release must be INSIGHT_APP_VERSION from logger/js/version.js, not a hand-written string."
  );
});

test("every service worker shell file exists", () => {
  const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
  const entries = shellEntries(sw);
  assert.ok(entries.length > 20, "SHELL list was not parsed");
  assert.ok(entries.includes("./js/version.js"), "SHELL must cache js/version.js so the offline page can load the release");
  const loggerRoot = join(root, "logger");
  const missing = [];
  for (const entry of entries) {
    if (!entry.startsWith("./")) {
      missing.push(`${entry} (SHELL paths must start with ./)`);
      continue;
    }
    const rel = entry.slice(2);
    const full = rel === "" ? loggerRoot : join(loggerRoot, rel);
    if (!existsSync(full)) missing.push(entry);
  }
  assert.equal(
    missing.length,
    0,
    "These SHELL entries do not exist on disk:\n" + missing.map((item) => "  " + item).join("\n")
  );
});

test("hand-bumped insight-shell cache numbers are rejected", () => {
  const files = [...jsFiles(join(root, "logger")), ...jsFiles(join(root, "tests"))];
  const hits = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const found = new Set();
    for (const match of text.matchAll(INTEGER_CACHE)) found.add(match[0]);
    for (const name of found) hits.push(`${relative(root, file)}: ${name}`);
  }
  const version = globalThis.INSIGHT_APP_VERSION;
  assert.equal(
    hits.length,
    0,
    [
      "Hand-bumped service worker cache names are still in the tree:",
      ...hits.map((hit) => "  " + hit),
      "",
      `logger/js/version.js is the only app version (${version}).`,
      `The service worker cache is ${globalThis.INSIGHT_SHELL_CACHE}.`,
      `The Sentry release is ${version}.`,
      "Remove those strings from sw.js, sentry.js, and the tests.",
      "If this change is user-facing, bump INSIGHT_APP_VERSION in logger/js/version.js instead.",
    ].join("\n")
  );
});
