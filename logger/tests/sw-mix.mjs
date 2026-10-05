// Service-worker deploy mix. A JS-only "deploy" flips the server from the
// on-disk app (old) to the same files with one delayed shell module (new).
// usage-pref.js is held past the asset timeout in logger/sw.js, and the new
// copy appends a synthetic globalThis.__newThing marker. index.html is unchanged,
// so the worker must boot the cached generation instead of pairing a fast module
// with the slow one. The app has to come up after that flip. Nothing here edits
// logger/sw.js.
//
//   CHROME_PATH=... PLAYWRIGHT_PATH=... node logger/tests/sw-mix.mjs
//
// The script serves logger/ itself (its own port). The page is opened on
// localhost, which is where the app registers its service worker. SW_MIX_DELAY_MS
// overrides the hold, which defaults to 1.5s past the asset timeout read from sw.js.

import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOGGER = path.resolve(HERE, "..");
const SW_SRC = fs.readFileSync(path.join(LOGGER, "sw.js"), "utf8");
const ASSET_TIMEOUT_MS = Number((SW_SRC.match(/ASSET_TIMEOUT_MS =[\s\S]*?\|\|\s*(\d+)/) || [])[1] || 6000);
const DELAY_MS = Number(process.env.SW_MIX_DELAY_MS || ASSET_TIMEOUT_MS + 1500);
const DELAY_SUFFIX = "/js/usage-pref.js";
const MARKER = "\nglobalThis.__newThing = 1;\n";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

const fails = [];
function check(name, cond, extra) {
  if (cond) console.log("PASS", name);
  else {
    console.log("FAIL", name, extra == null ? "" : extra);
    fails.push(name);
  }
}

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const candidate of ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function startServer(state) {
  const timers = new Set();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.normalize(path.join(LOGGER, rel));
    if (file !== LOGGER && !file.startsWith(LOGGER + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const mode = state.mode;
    const delayed = mode === "new" && rel.endsWith(DELAY_SUFFIX);
    if (delayed) {
      state.delayedHits += 1;
      console.log(`holding ${rel} for ${DELAY_MS}ms`);
    }
    const send = () => {
      fs.readFile(file, (err, buf) => {
        if (err) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        let body = buf;
        if (mode === "new" && rel.endsWith(DELAY_SUFFIX)) body = Buffer.concat([buf, Buffer.from(MARKER)]);
        if (delayed) console.log(`released ${rel}`);
        res.writeHead(200, {
          "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
          "Cache-Control": "no-store",
        });
        res.end(body);
      });
    };
    if (delayed) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        send();
      }, DELAY_MS);
      timers.add(timer);
    } else send();
  });
  server.closeTimers = () => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  };
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function waitForController(page) {
  const ready = () => navigator.serviceWorker && navigator.serviceWorker.controller;
  try {
    await page.waitForFunction(ready, null, { timeout: 15000 });
  } catch {
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(ready, null, { timeout: 15000 });
  }
}

async function bootState(page) {
  return page.evaluate(() => ({
    booted: !!(
      window.app &&
      typeof window.app.render === "function" &&
      document.querySelector("#pane-home") &&
      document.querySelector("#pane-home").childElementCount > 0
    ),
    newThing: window.__newThing || 0,
  }));
}

async function main() {
  if (!Number.isFinite(DELAY_MS) || DELAY_MS <= ASSET_TIMEOUT_MS) {
    check("delay is past the asset timeout", false, `delay ${DELAY_MS} timeout ${ASSET_TIMEOUT_MS}`);
    process.exit(1);
  }
  console.log(`asset timeout ${ASSET_TIMEOUT_MS}ms, holding usage-pref.js ${DELAY_MS}ms in new mode`);

  const state = { mode: "old", delayedHits: 0 };
  const server = await startServer(state);
  const { port } = server.address();
  // platform.js registers the worker only for https or a localhost hostname.
  const origin = `http://localhost:${port}`;
  console.log("serving", origin);

  const launch = {
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
    ],
  };
  const chrome = chromePath();
  if (chrome) launch.executablePath = chrome;

  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on("pageerror", (err) => errs.push(err.message));

  try {
    state.mode = "old";
    await page.goto(origin + "/index.html", { waitUntil: "load", timeout: 30000 });
    await waitForController(page);
    await page.waitForFunction(
      () => window.app && typeof window.app.render === "function" && document.querySelector("#pane-home") && document.querySelector("#pane-home").childElementCount > 0,
      null,
      { timeout: 15000 }
    );
    const okOld = await bootState(page);
    check("old shell boots under a controlling worker", okOld.booted === true && okOld.newThing === 0, JSON.stringify(okOld));

    state.mode = "new";
    const hitsBefore = state.delayedHits;
    errs.length = 0;
    const t0 = Date.now();
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch((err) => {
      console.log("reload settled early:", err.message);
    });
    await page.waitForFunction(
      () => window.app && typeof window.app.render === "function" && document.querySelector("#pane-home") && document.querySelector("#pane-home").childElementCount > 0,
      null,
      { timeout: DELAY_MS + 15000 }
    );
    const after = await bootState(page);
    const elapsed = Date.now() - t0;
    console.log(JSON.stringify({ okOld, afterDeploy: after, elapsed, delayedHits: state.delayedHits, errs: errs.slice(0, 3) }));

    check("app still boots after the delayed deploy", after.booted === true, JSON.stringify(after));
    check("boot used the cached shell, not the delayed module", after.newThing === 0, JSON.stringify(after));
    check("the delayed usage-pref.js request was actually held", state.delayedHits > hitsBefore, String(state.delayedHits));
    check("no page errors on the reloaded shell", errs.length === 0, errs.slice(0, 3).join(" | "));
    console.log(`reload painted in ${elapsed}ms (delay is ${DELAY_MS}ms)`);
  } finally {
    await browser.close();
    server.closeTimers();
    await new Promise((resolve) => server.close(resolve));
  }

  if (fails.length) {
    console.log("FAILED", fails.join(", "));
    process.exit(1);
  }
  console.log("ALL PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
