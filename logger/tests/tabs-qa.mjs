// Step 6 QA: every tab, light and dark, three iPhone sizes, with and without Oura.
//   PLAYWRIGHT_PATH=... BASE=http://127.0.0.1:8765 node logger/tests/tabs-qa.mjs
// Data is synthetic (app.makeDemo). Checks: no page errors, no horizontal overflow,
// no element wider than the viewport, no empty cards, no "connect" filler beyond one entry point.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const BASE = process.env.BASE || "http://127.0.0.1:8765";
const ART = process.env.ARTIFACTS_DIR || "/tmp/tabs-qa";
const SHOTS = process.env.SHOTS !== "0";
mkdirSync(ART, { recursive: true });

const SIZES = [[375, 667], [390, 844], [430, 932]];
const THEMES = ["light", "dark"];
const DATA = ["oura", "none", "lapsed"];
const TABS = ["home", "workouts", "food", "progress", "insights", "recovery"];
const fails = [];
const rows = [];

function check(name, cond, extra) {
  if (!cond) { fails.push(name + (extra ? " " + extra : "")); console.log("FAIL", name, extra || ""); }
  return !!cond;
}

async function boot(browser, theme, data, w, h) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, deviceScaleFactor: 2, colorScheme: theme });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.addInitScript(({ theme }) => {
    if (localStorage.getItem("liftlog-v1")) return;
    localStorage.setItem("liftlog-v1", JSON.stringify({
      version: 2, sessions: [], theme: { mode: theme, accent: theme === "light" ? "citrus" : "sea" },
      profile: { name: "Test User", dob: "1990-01-01", sex: "female", units: "kg", heightCm: 170, weighIns: [{ date: "2020-01-01", kg: 70 }] },
    }));
  }, { theme });
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.app && window.app.makeDemo && window.app.state);
  await page.evaluate((data) => {
    const app = window.app;
    const demo = app.makeDemo();
    const s = app.state;
    s.sessions = demo.sessions;
    s.food = s.food || { days: {}, saved: [], targets: { auto: true }, deleted: [], updatedAt: 0 };
    s.food.days = demo.foodDays;
    s.profile.weighIns = demo.weighIns;
    s.measurements = demo.measurements;
    if (data === "oura") { s.demo = true; }
    else if (data === "lapsed") { s.demo = false; s.oura = { connected: true, lastSync: null, days: {} }; }
    else { s.demo = false; s.oura = { connected: false, lastSync: null, days: {} }; }
    app.save(); app.render();
    document.documentElement.style.setProperty("--safe-top", "47px");
    document.documentElement.style.setProperty("--safe-bottom", "34px");
  }, data);
  await page.waitForTimeout(250);
  return { context, page, errors };
}

async function audit(page, tab, w) {
  return page.evaluate(({ tab, w }) => {
    const pane = document.getElementById("pane-" + (tab === "recovery" ? "insights" : tab));
    const out = { overflow: [], empty: [], connect: 0, cards: 0, text: (pane.innerText || "").length };
    const doc = document.scrollingElement;
    if (pane.scrollWidth > pane.clientWidth + 1) out.overflow.push("pane scrollWidth " + pane.scrollWidth);
    pane.querySelectorAll("*").forEach((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || r.width === 0) return;
      if ((r.right > w + 1 || r.left < -1) && !el.closest("[data-scroll-x],.hscroll,.chips,.seg,.strip") && cs.position !== "fixed") {
        if (out.overflow.length < 5) out.overflow.push((el.className && String(el.className).slice(0, 40) || el.tagName) + " " + Math.round(r.left) + ".." + Math.round(r.right));
      }
    });
    pane.querySelectorAll(".card").forEach((c) => {
      const cs = getComputedStyle(c);
      if (cs.display === "none") return;
      out.cards++;
      if ((c.innerText || "").trim().length < 3 && !c.querySelector("svg,canvas,img")) out.empty.push(String(c.className).slice(0, 40));
    });
    // Connect entry points: a connect card, or a connect button outside one.
    const cards = pane.querySelectorAll(".oura-nudge, .card.connect");
    const loose = [...pane.querySelectorAll('[data-action="oura-connect"]')].filter((b) => !b.closest(".oura-nudge, .card.connect"));
    out.connect = cards.length + loose.length;
    out.filler = (pane.innerText.match(/unlock this|n=0/gi) || []).length;
    return out;
  }, { tab, w });
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  for (const theme of THEMES) for (const data of DATA) for (const [w, h] of SIZES) {
    const { context, page, errors } = await boot(browser, theme, data, w, h);
    for (const tab of TABS) {
      await page.evaluate((t) => {
        const app = window.app;
        app.ui.iseg = t === "recovery" ? "recovery" : "trends";
        app.goTab(t === "recovery" ? "insights" : t, { instant: true });
        app.render();
      }, tab);
      await page.waitForTimeout(350);
      const a = await audit(page, tab, w);
      const key = `${theme}/${data}/${w}x${h}/${tab}`;
      let ok = true;
      ok = check(key + " no horizontal overflow", a.overflow.length === 0, JSON.stringify(a.overflow)) && ok;
      ok = check(key + " no empty cards", a.empty.length === 0, JSON.stringify(a.empty)) && ok;
      ok = check(key + " at most one connect entry", a.connect <= 1, String(a.connect)) && ok;
      ok = check(key + " has content", a.text > 40, String(a.text)) && ok;
      ok = check(key + " no locked filler", a.filler === 0, String(a.filler)) && ok;
      rows.push({ key, ok, cards: a.cards, connect: a.connect });
      if (SHOTS) {
        await page.evaluate((t) => { const p = document.getElementById("pane-" + (t === "recovery" ? "insights" : t)); if (p) p.scrollTop = 0; }, tab);
        await page.screenshot({ path: `${ART}/${theme}-${data}-${w}-${tab}.png`, fullPage: false });
      }
    }
    check(`${theme}/${data}/${w}x${h} no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
    await context.close();
  }
  await browser.close();
  const passed = rows.filter((r) => r.ok).length;
  console.log(`\n${passed}/${rows.length} tab views clean; ${fails.length} failed checks`);
  if (fails.length) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exit(1); });
