// Touch QoL: long-press Home enters edit mode without a text selection; settings inputs stay selectable.
//   PLAYWRIGHT_PATH=... BASE=http://127.0.0.1:8765 node logger/tests/touch-qol.mjs
// Screenshots go to SHOTS_DIR (default /workspace/team/shots/touch-qol).

import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { launchOfflineBrowser } from "./browser-launch.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

const BASE = process.env.BASE || "http://127.0.0.1:8765";
const SHOTS = process.env.SHOTS_DIR || "/workspace/team/shots/touch-qol";
mkdirSync(SHOTS, { recursive: true });
const fails = [];

function check(name, cond, extra) {
  if (cond) console.log("PASS", name);
  else { console.log("FAIL", name, extra || ""); fails.push(name); }
}

async function boot(browser, mode) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.addInitScript((mode) => {
    if (localStorage.getItem("liftlog-v1")) return;
    localStorage.setItem("liftlog-v1", JSON.stringify({
      version: 2,
      sessions: [],
      theme: { mode, accent: mode === "light" ? "citrus" : "sea" },
      profile: { name: "Ada Lovelace", dob: "1990-01-01", sex: "female", units: "kg", heightCm: 170, weighIns: [{ date: "2020-01-01", kg: 70 }] },
    }));
  }, mode);
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.app && window.app.enterHomeEdit);
  await page.waitForTimeout(200);
  return { context, page };
}

/* Touch long press: dispatch pointer events the way home-drag.js listens for them. */
async function longPress(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await page.waitForTimeout(800);
  /* Chrome selects the word under a long press when nothing blocks it. */
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(300);
}

const browser = await launchOfflineBrowser(chromium, { executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome" });

for (const mode of ["light", "dark"]) {
  const { context, page } = await boot(browser, mode);

  await longPress(page, "#pane-home .hw-slot, #pane-home .hw, #pane-home .hero");
  const editing = await page.evaluate(() => !!(window.app.ui && window.app.ui.homeEdit));
  check(mode + " long press enters edit mode", editing);
  const sel = await page.evaluate(() => window.getSelection().toString());
  check(mode + " no text selected after long press", sel === "", JSON.stringify(sel));
  await page.screenshot({ path: `${SHOTS}/home-edit-after-longpress-${mode}.png` });

  /* Leave edit mode, open Settings, then the profile sheet that holds #pf-name. */
  await page.evaluate(() => {
    const app = window.app;
    app.ui.homeEdit = false;
    app.ui.sheet = null;
    if (typeof app.go === "function") app.go("settings");
    else { app.ui.tab = "settings"; app.render(); }
  });
  await page.waitForSelector('[data-action="pf-edit"]', { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => {
    const app = window.app;
    const btn = document.querySelector('[data-action="pf-edit"]');
    if (btn) btn.click();
    else {
      if (typeof app.startProfileDraft === "function") app.startProfileDraft();
      app.ui.sheet = "profile";
      app.renderSheet();
    }
  });
  await page.waitForSelector("#pf-name", { timeout: 5000 });
  const input = page.locator("#pf-name");
  check(mode + " settings input exists", (await input.count()) > 0);
  if (await input.count()) {
    await input.focus();
    await input.selectText();
    const state = await input.evaluate((el) => ({
      us: getComputedStyle(el).userSelect || getComputedStyle(el).webkitUserSelect,
      sel: window.getSelection().toString() || el.value.slice(el.selectionStart, el.selectionEnd),
      fs: parseFloat(getComputedStyle(el).fontSize),
    }));
    check(mode + " settings input user-select is text", state.us === "text", state.us);
    check(mode + " settings input text is selectable", state.sel.length > 0, JSON.stringify(state));
    check(mode + " settings input font >= 16px", state.fs >= 16, String(state.fs));
  }
  await page.screenshot({ path: `${SHOTS}/settings-input-selectable-${mode}.png` });
  await context.close();
}

await browser.close();
if (fails.length) { console.log("FAILED:", fails.join(", ")); process.exit(1); }
console.log("touch-qol ok");
