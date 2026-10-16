// Update banner. Serves the app on localhost so the service worker registers,
// then ships a byte-different sw.js. An in-progress routine workout keeps the
// banner, and the banner stays below the header so Cancel still receives the
// tap. Tapping the banner reloads once and reopens that workout with the
// half-typed set. Nothing is captured.
//
//   CHROME_PATH=... node logger/tests/sw-update-banner.mjs

import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchOfflineBrowser, isOfflineNoise } from "./browser-launch.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOGGER = path.resolve(HERE, "..");
const LABEL = "Update available, tap to refresh";

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
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      if (url.pathname === "/sw.js" && state.token) {
        buf = Buffer.concat([buf, Buffer.from("\n// update-banner " + state.token + "\n")]);
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(buf);
    });
  });
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

async function waitForBoot(page) {
  await page.waitForFunction(
    () => window.app && typeof window.app.render === "function" && document.querySelector("#pane-home"),
    null,
    { timeout: 15000 }
  );
}

async function main() {
  const state = { token: "" };
  const server = await startServer(state);
  const { port } = server.address();
  const origin = `http://localhost:${port}`;
  console.log("serving", origin);

  const executablePath = chromePath();
  const browser = await launchOfflineBrowser(chromium, executablePath ? { executablePath } : {});
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => {
    if (!isOfflineNoise(err.message)) errors.push(err.message);
  });
  await page.addInitScript(() => {
    const n = Number(sessionStorage.getItem("insight-load-count") || "0") + 1;
    sessionStorage.setItem("insight-load-count", String(n));
  });

  try {
    await page.goto(origin + "/index.html", { waitUntil: "load", timeout: 30000 });
    await waitForController(page);
    await waitForBoot(page);
    await page.evaluate(() => {
      const orig = window.app.capture;
      window.app.capture = function (name) {
        const prev = JSON.parse(sessionStorage.getItem("insight-banner-captures") || "[]");
        prev.push(name);
        sessionStorage.setItem("insight-banner-captures", JSON.stringify(prev));
        return orig && orig.apply(this, arguments);
      };
    });

    const beforeUpdate = await page.evaluate(() => {
      const el = document.getElementById("sw-update");
      return {
        hidden: !el || el.hidden,
        loads: sessionStorage.getItem("insight-load-count"),
      };
    });
    check("no banner before an update", beforeUpdate.hidden === true, JSON.stringify(beforeUpdate));

    await page.evaluate(() => {
      const app = window.app;
      const routine = app.state.workouts.find((item) => item.id === "push") || app.state.workouts[0];
      app.state.sessions.push({
        id: "live-update",
        date: app.today(),
        workoutId: routine.id,
        name: routine.name,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        entries: [],
      });
      app.ui.workoutOpen = true;
      app.ui.open = 0;
      app.ui.drafts = {};
      app.save();
      app.render();
    });
    await page.locator("#workout input[data-field='w']").fill("135.");
    await page.locator("#workout input[data-field='r']").fill("8");

    state.token = "next";
    const updated = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return { ok: false, reason: "no registration" };
      await reg.update();
      return { ok: true };
    });
    check("registration update ran", updated.ok === true, JSON.stringify(updated));

    try {
      await page.waitForFunction(() => {
        const el = document.getElementById("sw-update");
        if (!el || el.hidden) return false;
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && el.textContent.indexOf("Update available, tap to refresh") !== -1;
      }, null, { timeout: 20000 });
    } catch (err) {
      const info = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        const el = document.getElementById("sw-update");
        return {
          controller: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
          waiting: !!(reg && reg.waiting),
          installing: reg && reg.installing ? reg.installing.state : "",
          hidden: !el || el.hidden,
          text: el ? el.textContent : "",
        };
      });
      check("banner shows while a workout is in progress", false, JSON.stringify(info) + " " + err.message);
    }

    const during = await page.evaluate(() => {
      const el = document.getElementById("sw-update");
      const box = el.getBoundingClientRect();
      const header = document.querySelector("#workout .wo-top");
      const cancel = document.querySelector("#workout [data-action='cancel-workout']");
      const weight = document.querySelector("#workout input[data-field='w']");
      const headerBox = header.getBoundingClientRect();
      const cancelBox = cancel.getBoundingClientRect();
      const weightBox = weight.getBoundingClientRect();
      const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const hitAt = (rect) => {
        const node = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        if (!node) return "";
        return node.id || (node.dataset && node.dataset.action) || node.tagName;
      };
      const workout = document.getElementById("workout");
      const session = window.app.activeSession();
      return {
        text: el.textContent,
        hidden: el.hidden,
        inWorkout: document.body.classList.contains("in-workout"),
        workoutOpen: workout && !workout.hidden,
        session: !!(session && !session.finishedAt && session.id === "live-update"),
        loads: sessionStorage.getItem("insight-load-count"),
        z: getComputedStyle(el).zIndex,
        hit: hitAt(box) === "sw-update",
        cancelHit: hitAt(cancelBox),
        width: box.width,
        height: box.height,
        bannerTop: box.top,
        headerBottom: headerBox.bottom,
        coversHeader: overlaps(box, headerBox),
        coversCancel: overlaps(box, cancelBox),
        coversWeight: overlaps(box, weightBox),
        weight: weight.value,
        reps: document.querySelector("#workout input[data-field='r']").value,
      };
    });
    check("banner copy", during.text === LABEL, during.text);
    check("banner is visible over the open workout", during.hidden === false && during.inWorkout && during.workoutOpen && during.session && during.hit, JSON.stringify(during));
    check("banner stays small", during.height > 0 && during.height <= 44 && during.width < 360, JSON.stringify(during));
    check("banner stays below the header and Cancel", during.bannerTop >= during.headerBottom - 1 && !during.coversHeader && !during.coversCancel && during.cancelHit === "cancel-workout", JSON.stringify(during));
    check("banner leaves the half-typed set visible", !during.coversWeight && during.weight === "135." && during.reps === "8", JSON.stringify(during));
    const baseline = during.loads;

    await page.waitForTimeout(800);
    const held = await page.evaluate(() => sessionStorage.getItem("insight-load-count"));
    check("an open workout does not reload until the tap", held === baseline, held);

    const capturesBefore = await page.evaluate(() => sessionStorage.getItem("insight-banner-captures"));
    // The tap reloads the page. Reading before that navigation settles races it and can throw
    // "Execution context was destroyed". sessionStorage survives the reload, so read after it.
    await Promise.all([
      page.waitForNavigation({ waitUntil: "load", timeout: 15000 }),
      page.click("#sw-update"),
    ]);
    const capturesAfter = await page.evaluate(() => sessionStorage.getItem("insight-banner-captures"));
    check("tap sends no tracking", capturesBefore === capturesAfter, String(capturesAfter));

    await page.waitForFunction((base) => Number(sessionStorage.getItem("insight-load-count")) === Number(base) + 1, baseline, { timeout: 15000 });
    await waitForBoot(page);
    await page.waitForTimeout(1200);
    const settled = await page.evaluate(() => {
      const el = document.getElementById("sw-update");
      const session = window.app.activeSession();
      const weight = document.querySelector("#workout input[data-field='w']");
      const reps = document.querySelector("#workout input[data-field='r']");
      const workout = document.getElementById("workout");
      return {
        loads: sessionStorage.getItem("insight-load-count"),
        hidden: !el || el.hidden,
        controller: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
        open: window.app.ui.workoutOpen === true,
        shown: !!(workout && !workout.hidden && document.body.classList.contains("in-workout")),
        id: session && session.id,
        name: session && session.name,
        sets: session && session.entries ? session.entries.reduce((n, entry) => n + ((entry.sets && entry.sets.length) || 0), 0) : -1,
        weight: weight && weight.value,
        reps: reps && reps.value,
      };
    });
    check("tap reloads once", Number(settled.loads) === Number(baseline) + 1, JSON.stringify(settled));
    check("banner hides after the refresh", settled.hidden === true && settled.controller === true, JSON.stringify(settled));
    check("routine workout reopens with the half-typed set", settled.open && settled.shown && settled.id === "live-update" && settled.name === "Push" && settled.sets === 0 && settled.weight === "135." && settled.reps === "8", JSON.stringify(settled));
    check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  } catch (err) {
    check("update banner harness", false, err && err.message ? err.message : String(err));
  } finally {
    await browser.close();
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
