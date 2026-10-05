// Form controls must not render dark text on a dark field.
//   PLAYWRIGHT_PATH=... CHROME_PATH=... node logger/tests/form-contrast.mjs

import { createRequire } from "node:module";
import { launchOfflineBrowser } from "./browser-launch.mjs";

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_PATH || "playwright");
const { chromium } = pw;

const BASE = process.env.BASE || "http://127.0.0.1:8765";
const fails = [];

function check(name, cond, extra) {
  if (cond) console.log("PASS", name);
  else { console.log("FAIL", name, extra || ""); fails.push(name); }
}

function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
function lum(r, g, b) { return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
function contrast(a, b) {
  const L1 = lum(a.r, a.g, a.b), L2 = lum(b.r, b.g, b.b);
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}
function parse(c) {
  const m = String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
}

async function launch() {
  if (process.env.CHROME_PATH) return launchOfflineBrowser(chromium, { executablePath: process.env.CHROME_PATH });
  return launchOfflineBrowser(chromium, { channel: "chrome" });
}

async function boot(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.addInitScript(() => localStorage.removeItem("liftlog-v1"));
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.app && window.app.renderSheet);
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--safe-top", "59px");
    document.documentElement.style.setProperty("--safe-bottom", "34px");
    app.state.demo = true;
    app.state.theme = { mode: "dark", accent: "sea" };
    app.applyTheme();
    app.save();
    app.render();
  });
  await page.waitForTimeout(150);
  return { context, page, errors };
}

async function fieldStyle(page, selector, prop) {
  return page.locator(selector).first().evaluate((el, p) => {
    const cs = getComputedStyle(el, p || undefined);
    return {
      color: cs.color,
      fill: cs.webkitTextFillColor || cs.getPropertyValue("-webkit-text-fill-color"),
      bg: (p ? getComputedStyle(el).backgroundColor : cs.backgroundColor),
      caret: cs.caretColor,
      align: cs.textAlign,
      height: cs.height,
      scheme: getComputedStyle(document.documentElement).colorScheme,
    };
  }, prop);
}

function assertReadable(name, style, { placeholder = false } = {}) {
  const fg = parse(style.fill && style.fill !== "currentcolor" ? style.fill : style.color);
  const bg = parse(style.bg);
  check(name + " parsed", !!(fg && bg), JSON.stringify(style));
  if (!fg || !bg) return;
  const fgL = lum(fg.r, fg.g, fg.b);
  const bgL = lum(bg.r, bg.g, bg.b);
  const darkOnDark = bgL < 0.15 && fgL < 0.25;
  check(name + " not dark-on-dark", !darkOnDark, `fg ${style.color} L=${fgL.toFixed(3)} bg ${style.bg} L=${bgL.toFixed(3)}`);
  const ratio = contrast(fg, bg);
  const need = 4.5;
  check(name + ` contrast >= ${need}`, ratio >= need, ratio.toFixed(2));
}

async function openSheet(page, sheet, sd) {
  await page.evaluate(({ sheet, sd }) => {
    app.ui.sheet = sheet;
    app.ui.sd = sd || {};
    app.renderSheet();
  }, { sheet, sd });
  await page.waitForTimeout(80);
}

async function bootLaunched(browser, mode) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.addInitScript((mode) => {
    localStorage.setItem("liftlog-v1", JSON.stringify({ version: 2, sessions: [], theme: { mode, accent: mode === "light" ? "citrus" : "sea" } }));
  }, mode);
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.app && window.app.startWorkout);
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--safe-top", "59px");
    document.documentElement.style.setProperty("--safe-bottom", "34px");
  });
  await page.waitForTimeout(150);
  return { context, page, errors };
}

async function checkWorkoutBand(page, mode) {
  const info = await page.evaluate(async (mode) => {
    document.documentElement.style.setProperty("--safe-top", "59px");
    app.state.theme = { ...(app.state.theme || {}), mode, accent: mode === "light" ? "citrus" : "sea" };
    app.applyTheme();
    const w = app.state.workouts[0];
    await app.startWorkout(w.id);
    const wo = document.getElementById("workout");
    const head = document.querySelector("#workout .wo-top");
    const title = document.querySelector("#workout h2");
    const band = getComputedStyle(document.body, "::before");
    const meta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    const theme = document.querySelector('meta[name="theme-color"]');
    return {
      workoutTop: getComputedStyle(wo).top,
      overscroll: getComputedStyle(wo).overscrollBehaviorY,
      padTop: getComputedStyle(head).paddingTop,
      titleTop: title.getBoundingClientRect().top,
      bandBg: band.backgroundColor,
      pageBg: getComputedStyle(document.body).backgroundColor,
      bar: document.documentElement.dataset.bar,
      style: meta ? meta.getAttribute("content") : "",
      themeColor: theme ? theme.getAttribute("content") : "",
    };
  }, mode);
  check(mode + " workout starts below the status band", info.workoutTop === "59px", info.workoutTop);
  check(mode + " workout overscroll stays in the scroller", info.overscroll.includes("contain"), info.overscroll);
  check(mode + " workout header drops the safe-area pad", info.padTop === "8px", info.padTop);
  check(mode + " workout title is below the band", info.titleTop >= 59, String(info.titleTop));
  if (mode === "dark") {
    check("dark band matches the page background", info.bandBg === info.pageBg, info.bandBg + " vs " + info.pageBg);
    check("dark launch keeps black-translucent", info.style === "black-translucent", info.style);
    check("dark theme-color matches the background", info.themeColor === "#0F0F11", info.themeColor);
  } else {
    check("light band stays dark", info.bandBg === "rgb(15, 15, 17)", info.bandBg);
    check("light launch uses status-bar style default", info.bar === "light" && info.style === "default", info.bar + " " + info.style);
    check("light theme-color is #F3F4F1", info.themeColor === "#F3F4F1", info.themeColor);
  }
}

async function main() {
  const browser = await launch();
  const { page, errors } = await boot(browser);

  await openSheet(page, "food-describe", { meal: "breakfast", text: "", source: "describe" });
  const box = page.locator("#food-describe");
  await box.click();
  await box.fill("Two eggs, toast with butter, black coffee");
  const typed = await fieldStyle(page, "#food-describe");
  assertReadable("describe typed", typed);
  check("describe uses text color", /244,\s*244,\s*241/.test(typed.color) || /242,\s*243,\s*245/.test(typed.color), typed.color);
  check("describe color-scheme dark", typed.scheme === "dark", typed.scheme);
  const ph = await fieldStyle(page, "#food-describe", "::placeholder");
  assertReadable("describe placeholder", ph, { placeholder: true });

  await openSheet(page, "ms-edit", { name: "Lat Pulldown Machine" });
  const notes = page.locator("#ms-text");
  await notes.click();
  await notes.fill("Seat 4, chest pad snug");
  assertReadable("machine notes typed", await fieldStyle(page, "#ms-text"));

  await openSheet(page, "weigh", {});
  const date = await fieldStyle(page, "#wi-d");
  assertReadable("weigh date", date);
  check("date stays left aligned", date.align === "left" || date.align === "start", date.align);
  check("date keeps full height", parseFloat(date.height) >= 48, date.height);

  await openSheet(page, "goal", { name: "" });
  assertReadable("goal select", await fieldStyle(page, "#goal-ex"));

  await page.evaluate(() => { app.goals().sessionsPerWeek = 4; });
  await openSheet(page, "goalweek", {});
  assertReadable("danger text button", await fieldStyle(page, ".btn.danger"));

  await openSheet(page, "priv-delete", {});
  const del = await fieldStyle(page, "#del-go");
  assertReadable("delete button", del);
  check("delete button is not white-on-red", !/255,\s*255,\s*255/.test(del.color), del.color);

  await page.evaluate(() => {
    app.ui.sheet = null;
    app.renderSheet();
    app.state.theme = { mode: "light", accent: "citrus" };
    app.applyTheme();
    app.ui.sheet = "food-describe";
    app.ui.sd = { meal: "lunch", text: "", source: "describe" };
    app.renderSheet();
  });
  const lightPh = await fieldStyle(page, "#food-describe", "::placeholder");
  const lightFg = parse(lightPh.color);
  const lightBg = parse(lightPh.bg);
  const lightRatio = lightFg && lightBg ? contrast(lightFg, lightBg) : 0;
  check("light placeholder has margin over 4.5", lightRatio >= 4.7, lightRatio.toFixed(2) + " " + lightPh.color);

  await page.evaluate(() => {
    app.goals().sessionsPerWeek = 3;
    app.ui.sheet = "goalweek";
    app.renderSheet();
  });
  assertReadable("light danger text button", await fieldStyle(page, ".btn.danger"));
  await openSheet(page, "priv-delete", {});
  assertReadable("light delete button", await fieldStyle(page, "#del-go"));

  await page.evaluate(() => {
    app.ui.sheet = null;
    app.renderSheet();
    app.state.theme = { mode: "dark", accent: "sea" };
    app.applyTheme();
    app.goTab("home");
  });
  await page.locator("#pane-home").evaluate((el) => { el.scrollTop = 480; });
  await page.evaluate(() => app.goTab("insights"));
  await page.evaluate(() => app.goTab("home"));
  const kept = await page.locator("#pane-home").evaluate((el) => el.scrollTop);
  check("tab switch keeps scroll", kept > 400, String(kept));
  await page.evaluate(() => app.goTab("home"));
  const retap = await page.locator("#pane-home").evaluate((el) => el.scrollTop);
  check("re-tap scrolls home to top", retap === 0, String(retap));

  await checkWorkoutBand(page, "dark");

  check("no page errors", errors.length === 0, errors.join(" | "));
  await page.context().close();

  const light = await bootLaunched(browser, "light");
  await checkWorkoutBand(light.page, "light");
  check("no page errors on light launch", light.errors.length === 0, light.errors.join(" | "));
  await light.context.close();
  await browser.close();
  if (fails.length) {
    console.log("FAILED", fails.length);
    process.exit(1);
  }
  console.log("ALL PASSED");
}

main().catch((err) => { console.error(err); process.exit(1); });
