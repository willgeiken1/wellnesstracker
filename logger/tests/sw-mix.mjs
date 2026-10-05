// Service-worker deploy mix. Each iteration precaches the on-disk app, then
// flips the server to the same bytes with one shell file held just below or
// just above the asset timeout in logger/sw.js. New responses carry X-Sw-Gen.
// index.html stays byte-for-byte the same, so a slow asset must boot one whole
// generation: the new shell if the file arrives in time, otherwise the cache.
// A mix (some new, some old) fails. Nothing here edits logger/sw.js.
//
//   CHROME_PATH=... node logger/tests/sw-mix.mjs
//   SW_MIX_SEED=1234 SW_MIX_N=8 node logger/tests/sw-mix.mjs
//
// The page is opened on localhost, which is where the app registers its worker.
// Timeouts are read from sw.js. SW_MIX_EDGE_MS is how far under or over the
// asset timeout each hold sits (default 750).

import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchOfflineBrowser } from "./browser-launch.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOGGER = path.resolve(HERE, "..");
const SW_SRC = fs.readFileSync(path.join(LOGGER, "sw.js"), "utf8");

function timeoutFromSw(name) {
  const match = SW_SRC.match(new RegExp(name + " =[\\s\\S]*?\\|\\|\\s*(\\d+)"));
  if (!match) throw new Error("could not read " + name + " from sw.js");
  return Number(match[1]);
}

const ASSET_TIMEOUT_MS = timeoutFromSw("ASSET_TIMEOUT_MS");
const NAV_TIMEOUT_MS = timeoutFromSw("NAV_TIMEOUT_MS");
const EDGE_MS = Number(process.env.SW_MIX_EDGE_MS || 750);
const N = Number(process.env.SW_MIX_N || 8);

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

function shellRequestPaths() {
  const block = SW_SRC.match(/const SHELL = \[([\s\S]*?)\];/);
  if (!block) throw new Error("could not read SHELL from sw.js");
  const urls = [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  return [...new Set(urls.map((url) => {
    if (url === "./") return "/";
    return "/" + url.replace(/^\.\//, "");
  }))];
}

function isDocument(pathname) {
  return pathname === "/" || pathname === "/index.html";
}

function holdMatches(pathname, target) {
  if (isDocument(target)) return isDocument(pathname);
  return pathname === target;
}

function expectedGen(file, delay) {
  if (isDocument(file)) {
    // A slow document falls back at the navigation timeout and then stays on
    // that cached generation. An on-time document still waits out the asset
    // timeout before any new shell file is used.
    if (delay >= NAV_TIMEOUT_MS || delay >= ASSET_TIMEOUT_MS) return "old";
    return "new";
  }
  return delay >= ASSET_TIMEOUT_MS ? "old" : "new";
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
    const pathname = decodeURIComponent(url.pathname);
    let rel = pathname;
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.normalize(path.join(LOGGER, rel));
    if (file !== LOGGER && !file.startsWith(LOGGER + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const mode = state.mode;
    const delayMs = state.delayMs;
    const delayed = mode === "new" && holdMatches(pathname, state.delayPath);
    if (delayed) {
      state.delayedHits += 1;
      console.log(`holding ${pathname} for ${delayMs}ms`);
    }
    const send = () => {
      fs.readFile(file, (err, buf) => {
        if (err) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        const headers = {
          "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
          "Cache-Control": "no-store",
        };
        if (mode === "new") headers["X-Sw-Gen"] = "new";
        if (delayed) console.log(`released ${pathname}`);
        res.writeHead(200, headers);
        res.end(buf);
      });
    };
    if (delayed) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        send();
      }, delayMs);
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

async function waitForBoot(page, timeout) {
  await page.waitForFunction(
    () => window.app && typeof window.app.render === "function" && document.querySelector("#pane-home") && document.querySelector("#pane-home").childElementCount > 0,
    null,
    { timeout }
  );
}

async function generations(page, paths) {
  return page.evaluate(async (paths) => {
    const out = {};
    for (const path of paths) {
      try {
        const res = await fetch(path, { cache: "no-store" });
        out[path] = res.ok ? (res.headers.get("x-sw-gen") || "old") : "status-" + res.status;
      } catch (err) {
        out[path] = "error";
      }
    }
    return out;
  }, paths);
}

async function main() {
  const seedText = process.env.SW_MIX_SEED;
  const seed = seedText == null || seedText === "" ? (Math.floor(Math.random() * 0x100000000) >>> 0) : Number(seedText);
  console.log("sw-mix seed", seed);
  if (!Number.isInteger(seed) || seed < 0) {
    check("seed is an integer", false, String(seed));
    process.exit(1);
  }
  if (!Number.isInteger(N) || N < 1) {
    check("iteration count", false, String(N));
    process.exit(1);
  }
  if (!Number.isFinite(EDGE_MS) || EDGE_MS <= 0 || EDGE_MS >= ASSET_TIMEOUT_MS) {
    check("edge sits inside the asset timeout", false, `edge ${EDGE_MS} asset ${ASSET_TIMEOUT_MS}`);
    process.exit(1);
  }
  console.log(`asset timeout ${ASSET_TIMEOUT_MS}ms, nav timeout ${NAV_TIMEOUT_MS}ms, edge ${EDGE_MS}ms, iterations ${N}`);

  const paths = shellRequestPaths();
  const rng = mulberry32(seed);
  const cases = [];
  for (let i = 0; i < N; i++) {
    const file = paths[Math.floor(rng() * paths.length)];
    const above = rng() < 0.5;
    const delay = above ? ASSET_TIMEOUT_MS + EDGE_MS : ASSET_TIMEOUT_MS - EDGE_MS;
    cases.push({ file, delay, expect: expectedGen(file, delay) });
  }

  const state = { mode: "old", delayPath: "/", delayMs: 0, delayedHits: 0 };
  const server = await startServer(state);
  const { port } = server.address();
  const origin = `http://localhost:${port}`;
  console.log("serving", origin);

  const executablePath = chromePath();
  const browser = await launchOfflineBrowser(chromium, executablePath ? { executablePath } : {});

  try {
    for (let i = 0; i < cases.length; i++) {
      const item = cases[i];
      const label = `case ${i} ${item.file} delay ${item.delay}ms`;
      console.log(label, "expect", item.expect);
      state.mode = "old";
      state.delayPath = item.file;
      state.delayMs = item.delay;
      state.delayedHits = 0;
      server.closeTimers();
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      const errs = [];
      page.on("pageerror", (err) => errs.push(err.message));
      try {
        await page.goto(origin + "/index.html", { waitUntil: "load", timeout: 30000 });
        await waitForController(page);
        await waitForBoot(page, 15000);
        const before = await page.evaluate(() => !!(window.app && typeof window.app.render === "function"));
        check(label + " old shell boots", before === true);

        state.mode = "new";
        const hitsBefore = state.delayedHits;
        errs.length = 0;
        await page.reload({ waitUntil: "domcontentloaded", timeout: item.delay + 20000 }).catch((err) => {
          console.log(label, "reload settled early:", err.message);
        });
        await waitForBoot(page, item.delay + 20000);
        const gens = await generations(page, paths);
        const seen = new Set(Object.values(gens));
        const mismatched = Object.entries(gens).filter((entry) => entry[1] !== item.expect).slice(0, 4);
        check(label + " boots one generation", seen.size === 1 && seen.has(item.expect), JSON.stringify({ seen: [...seen], mismatched }));
        check(label + " held the shell file", state.delayedHits > hitsBefore, String(state.delayedHits));
        check(label + " no page errors", errs.length === 0, errs.slice(0, 3).join(" | "));
      } catch (err) {
        check(label, false, err && err.message ? err.message : String(err));
      } finally {
        server.closeTimers();
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.closeTimers();
    await new Promise((resolve) => server.close(resolve));
  }

  if (fails.length) {
    console.log("FAILED", fails.join(", "));
    console.log("sw-mix seed", seed);
    process.exit(1);
  }
  console.log("ALL PASSED");
  console.log("sw-mix seed", seed);
}

main().catch((err) => {
  console.error(err);
  console.log("sw-mix seed", process.env.SW_MIX_SEED || "(see the seed line above)");
  process.exit(1);
});
