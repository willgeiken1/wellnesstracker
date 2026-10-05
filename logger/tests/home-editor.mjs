// Home editor: add, remove, resize, save, and reload in light and dark.
//   PLAYWRIGHT_PATH=... node logger/tests/home-editor.mjs

import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { launchOfflineBrowser, isOfflineNoise } from "./browser-launch.mjs";

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_PATH || "playwright");
const { chromium } = pw;

const BASE = process.env.BASE || "http://127.0.0.1:8765";
const ART = process.env.ARTIFACTS_DIR || "/opt/cursor/artifacts";
mkdirSync(ART, { recursive: true });
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
  return launchOfflineBrowser(chromium, {
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
  });
}

async function boot(browser, mode) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  await page.addInitScript((mode) => {
    if (localStorage.getItem("liftlog-v1")) return;
    localStorage.setItem("liftlog-v1", JSON.stringify({
      version: 2,
      sessions: [],
      theme: { mode, accent: mode === "light" ? "citrus" : "sea" },
      profile: {
        name: "Ada Lovelace",
        dob: "1990-01-01",
        sex: "female",
        units: "kg",
        heightCm: 170,
        weighIns: [{ date: "2020-01-01", kg: 70 }],
      },
    }));
  }, mode);
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.app && window.app.homeHTML && window.app.commitHomeEditor);
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--safe-top", "59px");
    document.documentElement.style.setProperty("--safe-bottom", "34px");
  });
  await page.waitForTimeout(200);
  return { context, page, errors };
}

async function fieldStyle(page, selector, prop) {
  return page.locator(selector).first().evaluate((el, p) => {
    const cs = getComputedStyle(el, p || undefined);
    let node = el;
    let bg = "rgba(0, 0, 0, 0)";
    while (node) {
      const c = getComputedStyle(node).backgroundColor;
      const m = String(c).match(/rgba?\([\d.]+,\s*[\d.]+,\s*[\d.]+(?:,\s*([\d.]+))?\)/);
      const a = m && m[1] != null ? +m[1] : 1;
      if (m && a > 0.9) { bg = c; break; }
      node = node.parentElement;
    }
    return {
      color: cs.color,
      fill: cs.webkitTextFillColor || cs.getPropertyValue("-webkit-text-fill-color"),
      bg,
    };
  }, prop);
}

function assertReadable(name, style) {
  const fg = parse(style.fill && style.fill !== "currentcolor" && style.fill !== "rgb(0, 0, 0)" ? style.fill : style.color);
  const bg = parse(style.bg);
  check(name + " parsed", !!(fg && bg && bg.a !== 0), JSON.stringify(style));
  if (!fg || !bg || bg.a === 0) return;
  const ratio = contrast(fg, bg);
  check(name + " contrast >= 4.5", ratio >= 4.5, ratio.toFixed(2) + " " + JSON.stringify(style));
}

async function topOf(page, selector) {
  return page.locator(selector).first().evaluate((el) => el.getBoundingClientRect().top);
}

async function editorContrast(page, mode) {
  check(mode + " editor starts below the status bar", await topOf(page, ".home-editor-top") >= 59);
  assertReadable(mode + " add", await fieldStyle(page, ".home-editor-add"));
  assertReadable(mode + " done", await fieldStyle(page, ".home-editor-save"));
  const hit = await page.locator(".hw-minus").first().evaluate((el) => {
    const q = getComputedStyle(el, "::before");
    return { h: el.getBoundingClientRect().height + 2 * Math.abs(parseFloat(q.top)), w: el.getBoundingClientRect().width + 2 * Math.abs(parseFloat(q.left)) };
  });
  check(mode + " minus badge has a 44pt hit area", hit.h >= 44 && hit.w >= 44, JSON.stringify(hit));
  const bar = await page.locator(".home-editor-add").evaluate((el) => el.getBoundingClientRect().height);
  check(mode + " Add is 44pt tall", bar >= 44, String(bar));
}

async function galleryContrast(page, mode) {
  const box = await page.locator(".home-gallery").boundingBox();
  check(mode + " gallery stays below the status bar", !!box && box.y >= 59, box && String(box.y));
  assertReadable(mode + " search", await fieldStyle(page, "#home-q"));
  assertReadable(mode + " search placeholder", await fieldStyle(page, "#home-q", "::placeholder"));
  const bar = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, hit: !!top && (top === el || el.contains(top)) };
    };
    return { cancel: pick(".hw-gal-cancel"), close: pick(".hw-gal-x") };
  });
  check(mode + " gallery has Cancel and close", !!(bar.cancel && bar.close), JSON.stringify(bar));
  if (bar.cancel && bar.close) {
    const apart = bar.cancel.r <= bar.close.l || bar.close.r <= bar.cancel.l || bar.cancel.b <= bar.close.t || bar.close.b <= bar.cancel.t;
    check(mode + " Cancel and close do not overlap", apart, JSON.stringify(bar));
    check(mode + " Cancel and close are 44pt", bar.cancel.h >= 44 && bar.cancel.w >= 44 && bar.close.h >= 44 && bar.close.w >= 44, JSON.stringify(bar));
    check(mode + " Cancel and close are what a tap reaches", bar.cancel.hit && bar.close.hit, JSON.stringify(bar));
  }
  assertReadable(mode + " gallery title", await fieldStyle(page, ".hw-gal-item b"));
  assertReadable(mode + " gallery subtitle", await fieldStyle(page, ".hw-gal-item em"));
}

async function main() {
  const browser = await launch();
  const { page, errors } = await boot(browser, "dark");

  // Default tiles (a weigh-in is already saved) render inside .home-v2. That strip
  // is not the registry: layout.homeV2 stays empty and the legacy .wdgs stack stays.
  check("fresh home stays on the legacy stack", await page.evaluate(() => !app.state.layout || app.state.layout.homeV2 == null) && await page.locator("#pane-home .wdgs").count() === 1);
  check("fresh home offers Edit", await page.locator("[data-action='home-edit']").count() === 1);
  check("home title starts below the status bar", await topOf(page, "#pane-home .page-title") >= 59);

  await page.locator("[data-action='home-edit']").click();
  await page.waitForTimeout(200);
  check("editor opens", await page.locator(".home-editor").count() === 1);
  const untouched = await page.evaluate(() => app.state.layout.homeV2 == null);
  await page.locator("[data-action='home-save']").click();
  await page.waitForTimeout(200);
  check("no-change save does not write", untouched && await page.evaluate(() => app.state.layout.homeV2 == null) && await page.locator("#pane-home .wdgs").count() === 1);

  await page.locator("[data-action='home-edit']").click();
  await page.waitForTimeout(200);
  await editorContrast(page, "dark");
  await page.screenshot({ path: ART + "/home_editor_dark.png", animations: "disabled" });

  const before = await page.evaluate(() => app.ui.homeDraft.items.slice());
  const from = page.locator(".hw-slot[data-id='brief']");
  const next = page.locator(".hw-slot[data-id='this-week']");
  const g = await from.boundingBox();
  const n = await next.boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, n.y + n.height / 2, { steps: 14 });
  check("dragged card lifts", await from.evaluate((el) => el.classList.contains("dragging") && /scale\(1\.04\)/.test(el.style.transform) === true));
  await page.mouse.up();
  await page.waitForTimeout(400);
  const dragged = await page.evaluate(() => app.ui.homeDraft.items.slice());
  check("drag reorders before save", dragged.indexOf("brief") > before.indexOf("brief") && dragged[0] !== "brief", dragged.slice(0, 4).join(">"));
  check("drag settles with no leftover transform", await from.evaluate((el) => !el.style.transform && !el.style.order && !el.classList.contains("settling")));

  await page.locator(".hw-slot[data-id='brief']").focus();
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(100);
  const stepped = await page.evaluate(() => app.ui.homeDraft.items.slice());
  check("arrow key moves the brief", stepped.indexOf("brief") > dragged.indexOf("brief"), stepped.join(">"));

  await page.locator("[data-action='home-remove'][data-id='muscles']").click();
  await page.waitForTimeout(100);
  check("remove drops the card from the draft", await page.evaluate(() => !app.ui.homeDraft.items.includes("muscles") && app.ui.homeDraft.hidden.includes("muscles")));

  await page.locator("[data-action='home-gallery']").click();
  await page.waitForTimeout(200);
  await galleryContrast(page, "dark");
  await page.locator("#home-q").fill("Food today");
  await page.waitForTimeout(150);
  assertReadable("dark search typed", await fieldStyle(page, "#home-q"));
  check("search filters the gallery", await page.locator("[data-action='home-gal-pick'][data-id='food-today']").count() === 1);
  await page.screenshot({ path: ART + "/home_gallery_dark.png", animations: "disabled" });
  await page.locator("[data-action='home-gal-pick'][data-id='food-today']").click();
  await page.waitForTimeout(150);
  check("a two-size card asks for a size", await page.locator("[data-action='home-add'][data-id='food-today'][data-size='medium']").count() === 1);
  await page.locator("[data-action='home-add'][data-id='food-today'][data-size='medium']").click();
  await page.waitForTimeout(150);
  check("add puts the card on the draft at the chosen size", await page.evaluate(() => app.ui.homeDraft.items.includes("food-today") && app.ui.homeDraft.sizes["food-today"] === "medium"));
  check("the sheet closes and edit mode stays", await page.locator(".home-gallery").count() === 0 && await page.locator(".hw-slot[data-id='food-today']").count() === 1);

  await page.locator("[data-action='home-save']").click();
  await page.waitForTimeout(250);
  const saved = await page.evaluate(() => {
    const home = app.state.layout.homeV2;
    return {
      registry: !!document.querySelector("#pane-home .home-v2"),
      nudgeInside: (() => {
        const brief = document.querySelector("#pane-home section.brief");
        const nudge = document.querySelector("#pane-home .nudge");
        return !!(brief && nudge && brief.contains(nudge));
      })(),
      last: !!document.querySelector("#pane-home [data-hw='food-today']"),
      muscles: !!document.querySelector("#pane-home [data-hw='muscles']"),
      span: document.querySelector("#pane-home [data-hw='food-today']")?.className || "",
      briefs: document.querySelectorAll("#pane-home section.brief").length,
      headline: !!document.querySelector("#pane-home [data-hw='headline']"),
      migrated: home.migrated,
      migratedAt: home.migratedAt,
      size: home.sizes && home.sizes["food-today"],
      items: home.items.includes("food-today") && home.items.includes("brief") && !home.items.includes("muscles"),
    };
  });
  check("save paints the registry", saved.registry === true, saved);
  check("weigh-in nudge sits inside the brief", saved.nudgeInside === true && saved.briefs === 1, saved);
  check("save does not repeat the headline tile", saved.headline === false, saved);
  check("save stores a real edit", saved.migrated == null && saved.migratedAt == null && saved.size === "medium" && saved.items, saved);
  check("medium food today is a full row", /\bspan-m\b/.test(saved.span), saved.span);
  check("removed card stays off the grid", saved.muscles === false);
  check("added card is on the grid", saved.last === true);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => window.app && document.querySelector("#pane-home .home-v2"));
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--safe-top", "59px");
    document.documentElement.style.setProperty("--safe-bottom", "34px");
  });
  check("reload keeps the registry", await page.locator("#pane-home .home-v2").count() === 1);
  check("reload keeps the edit", await page.evaluate(() => {
    const home = app.state.layout.homeV2;
    return home.sizes["food-today"] === "medium" && home.items.includes("food-today") && home.items.includes("brief") && !home.migratedAt;
  }));

  await page.evaluate(() => {
    app.state.theme = { mode: "light", accent: "citrus" };
    app.applyTheme();
    app.save();
    app.ui.homeEdit = true;
    app.ui.homeDraft = app.homeEditorDraft(app.state);
    app.render();
  });
  await page.waitForTimeout(200);
  await editorContrast(page, "light");
  await page.screenshot({ path: ART + "/home_editor_light.png", animations: "disabled" });
  await page.locator("[data-action='home-gallery']").click();
  await page.waitForTimeout(200);
  await galleryContrast(page, "light");
  await page.locator("#home-q").fill("Food");
  await page.waitForTimeout(120);
  assertReadable("light search typed", await fieldStyle(page, "#home-q"));
  await page.screenshot({ path: ART + "/home_gallery_light.png", animations: "disabled" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  await page.locator("[data-action='home-save']").click();
  await page.waitForTimeout(200);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => window.app && document.querySelector("#pane-home .home-v2"));
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--safe-top", "59px");
    document.documentElement.style.setProperty("--safe-bottom", "34px");
  });
  const light = await page.evaluate(() => ({
    mode: document.documentElement.dataset.mode,
    registry: !!document.querySelector("#pane-home .home-v2"),
    title: document.querySelector("#pane-home .page-title").getBoundingClientRect().top,
  }));
  check("light reload keeps the registry", light.mode === "light" && light.registry, light);
  check("light home starts below the status bar", light.title >= 59, String(light.title));

  const interesting = errors.filter((e) => !isOfflineNoise(e));
  check("no console errors", interesting.length === 0, interesting.join(" | "));
  await browser.close();
  if (fails.length) { console.log("FAILED", fails.join(", ")); process.exit(1); }
  console.log("ALL PASSED");
}

main().catch((err) => { console.error(err); process.exit(1); });
