// The web app starts from its own copy of supabase-js, so a cold launch never
// waits on a CDN. The copy must be the pinned devDependency's browser build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const pinned = pkg.devDependencies["@supabase/supabase-js"];
const html = readFileSync(new URL("../logger/index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
const vendored = readFileSync(new URL("../logger/js/vendor/supabase.js", import.meta.url), "utf8");

test("index.html loads supabase-js from the app, not a CDN", () => {
  assert.match(html, /<script src="js\/vendor\/supabase\.js"><\/script>\s*<script type="module" src="js\/main\.js"><\/script>/);
  assert.doesNotMatch(html, /<script[^>]+src="https?:\/\/[^"]*supabase/i);
});

test("the service worker precaches the vendored copy", () => {
  const shell = JSON.parse(sw.match(/const SHELL = (\[[^\]]*\]);/)[1]);
  assert.ok(shell.includes("./js/vendor/supabase.js"));
});

test("the vendored copy is the pinned devDependency's browser build, with its licence", () => {
  assert.match(pinned, /^\d+\.\d+\.\d+$/, "supabase-js stays pinned to an exact version");
  const [banner, ...rest] = vendored.split("\n");
  assert.equal(banner, `/*! @supabase/supabase-js ${pinned} | MIT License | https://github.com/supabase/supabase-js */`);
  const dir = dirname(require.resolve("@supabase/supabase-js/package.json"));
  assert.equal(require(join(dir, "package.json")).version, pinned);
  assert.equal(rest.join("\n"), readFileSync(join(dir, "dist/umd/supabase.js"), "utf8") + "\n");
  assert.match(readFileSync(new URL("../logger/js/vendor/supabase.LICENSE", import.meta.url), "utf8"), /MIT License/);
});
