// Rapid tab-swipe stress test. Run from the repo with the app already served:
//   node logger/tests/rapid-swipe.mjs
// Uses Playwright touch events at 390x844.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_PATH || "playwright");
const { chromium } = pw;

const BASE = process.env.BASE || "http://127.0.0.1:8765";
const ORDER = ["home", "workouts", "food", "progress", "insights"];
const fails = [];

function check(name, cond, extra) {
  if (cond) console.log("PASS", name);
  else {
    console.log("FAIL", name, extra || "");
    fails.push(name);
  }
}

async function boot(reduced) {
  const browser = await chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    deviceScaleFactor: 1,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  await page.addInitScript(() => localStorage.removeItem("liftlog-v1"));
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.app && window.app.goTab);
  await page.waitForTimeout(150);
  return { browser, page, errors };
}

async function cdpSwipe(page, x1, x2, steps) {
  const cdp = await page.context().newCDPSession(page);
  const y = 430;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x1, y, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    const x = x1 + (x2 - x1) * (i / steps);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

async function state(page) {
  return page.evaluate(() => {
    const ORDER = ["home", "workouts", "food", "progress", "insights"];
    const stage = document.getElementById("stage");
    const w = stage.clientWidth;
    const panes = [...document.querySelectorAll("#stage .pane")].map((el, i) => {
      const tr = getComputedStyle(el).transform;
      const m = tr && (tr.match(/matrix3d\(([^)]+)\)/) || tr.match(/matrix\(([^)]+)\)/));
      let x = null;
      if (m) {
        const p = m[1].split(",").map(Number);
        x = p.length === 16 ? p[12] : p[4];
      }
      return { i, pane: el.dataset.pane, x, active: el.classList.contains("active"), empty: el.innerHTML.trim().length === 0 };
    });
    const implied = panes.map((p) => (p.x == null ? null : p.i - p.x / w));
    const bub = document.getElementById("tab-bubble").getBoundingClientRect();
    const tabEl = document.querySelector('#tabs .tab[aria-current="page"]');
    const r = tabEl.getBoundingClientRect();
    const activeCx = r.x + r.width / 2;
    return {
      tab: app.ui.tab,
      index: app.motion.index,
      dragging: app.motion.dragging,
      animating: app.motion.animating,
      w,
      panes,
      implied,
      spread: Math.max(...implied) - Math.min(...implied),
      bubbleDelta: Math.abs(bub.x + bub.width / 2 - activeCx),
      bubbleTransition: getComputedStyle(document.getElementById("tab-bubble")).transition,
      activePane: panes.find((p) => p.active),
    };
  });
}

function problems(s, expectTab) {
  const idx = ORDER.indexOf(expectTab);
  const out = [];
  if (s.tab !== expectTab) out.push("tab " + s.tab);
  if (s.index !== idx) out.push("index " + s.index);
  if (s.dragging) out.push("dragging");
  if (s.animating) out.push("animating");
  if (s.spread > 0.02) out.push("desync " + s.spread.toFixed(3));
  s.panes.forEach((p) => {
    const want = (p.i - idx) * s.w;
    if (p.x == null || Math.abs(p.x - want) > 1.5) out.push(`${p.pane} ${Math.round(p.x)}!=${Math.round(want)}`);
  });
  if (s.activePane && s.activePane.empty) out.push("blank " + s.activePane.pane);
  if (s.bubbleDelta > 2) out.push("bubble " + s.bubbleDelta.toFixed(2));
  return out;
}

async function settled(page, tab, label) {
  await page.waitForTimeout(650);
  const s = await state(page);
  const bad = problems(s, tab);
  check(label, bad.length === 0, bad.join("; "));
  return s;
}

async function main() {
  const { browser, page, errors } = await boot(false);

  await cdpSwipe(page, 320, 40, 8);
  await settled(page, "workouts", "single swipe commits one tab");

  await cdpSwipe(page, 180, 210, 12);
  await settled(page, "workouts", "short swipe cancels");

  const tracked = await page.evaluate(async () => {
    const stage = document.getElementById("stage");
    const w = stage.clientWidth;
    const visual = () => {
      const el = document.querySelector("#pane-home");
      const tr = getComputedStyle(el).transform;
      const m = tr.match(/matrix3d\(([^)]+)\)/) || tr.match(/matrix\(([^)]+)\)/);
      const p = m[1].split(",").map(Number);
      const x = p.length === 16 ? p[12] : p[4];
      return -x / w;
    };
    app.goTab("home");
    await new Promise((r) => setTimeout(r, 500));
    const target = document.querySelector("#pane-home");
    const fire = (type, x) => {
      const touch = new Touch({ identifier: 1, target, clientX: x, clientY: 420, pageX: x, pageY: 420 });
      const touches = type === "touchend" || type === "touchcancel" ? [] : [touch];
      target.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true, touches, targetTouches: touches, changedTouches: [touch],
      }));
    };
    const swipe = (x1, x2, steps) => {
      fire("touchstart", x1);
      for (let i = 1; i <= steps; i++) fire("touchmove", x1 + (x2 - x1) * (i / steps));
      fire("touchend", x2);
    };

    // Park an in-flight slide, then grab it.
    swipe(330, 30, 5);
    let guard = 0;
    while ((visual() < 0.25 || visual() > 0.8) && guard++ < 40) {
      await new Promise((r) => requestAnimationFrame(r));
    }
    const before = visual();
    fire("touchstart", 220);
    fire("touchmove", 205);
    const atLock = visual();
    fire("touchmove", 165);
    const afterStep = visual();
    const lockJump = Math.abs(atLock - before);
    const step = afterStep - atLock;
    const expectStep = (205 - 165) / w;
    // Reverse hard enough to commit back, from wherever the finger now is.
    fire("touchmove", 360);
    fire("touchend", 360);
    const reversedTo = app.ui.tab;
    await new Promise((r) => setTimeout(r, 700));
    const reversedVisual = visual();

    // Several quick swipes, including ones that start while the slide is still moving,
    // direction reversals, and flings with only two samples.
    let maxStepError = 0;
    const jumps = [];
    const burst = async (x1, x2, steps) => {
      const v0 = visual();
      fire("touchstart", x1);
      let prev = v0;
      let prevX = x1;
      for (let i = 1; i <= steps; i++) {
        const x = x1 + (x2 - x1) * (i / steps);
        fire("touchmove", x);
        const v = visual();
        const finger = (prevX - x) / w;
        const got = v - prev;
        // Ignore the locking sample, and samples that rubber-band past the first or last tab.
        const tab = app.TAB_ORDER.indexOf(app.ui.tab);
        const inward = (finger > 0 && tab < 4) || (finger < 0 && tab > 0);
        if (i > 1 && inward && tab > 0 && tab < 4) maxStepError = Math.max(maxStepError, Math.abs(got - finger));
        jumps.push(Math.abs(got));
        prev = v;
        prevX = x;
      }
      fire("touchend", x2);
      await new Promise((r) => requestAnimationFrame(r));
    };
    for (let i = 0; i < 4; i++) await burst(320, 40, 4);
    for (let i = 0; i < 3; i++) await burst(i % 2 ? 40 : 320, i % 2 ? 300 : 50, 3);
    for (let i = 0; i < 3; i++) await burst(300, 20, 2);
    for (let i = 0; i < 2; i++) await burst(30, 340, 2);
    await new Promise((r) => setTimeout(r, 700));
    const endVisual = visual();
    const endTab = app.ui.tab;
    return {
      before, atLock, afterStep, lockJump, step, expectStep,
      maxStepError, maxJump: Math.max(...jumps, 0),
      reversedTo, reversedVisual, endVisual, endTab, animating: app.motion.animating, dragging: app.motion.dragging,
    };
  });

  check("grab does not teleport", tracked.lockJump < 0.08, JSON.stringify(tracked));
  check("mid-animation step tracks the finger", Math.abs(tracked.step - tracked.expectStep) < 0.05, JSON.stringify(tracked));
  check("reverse during the slide commits home", tracked.reversedTo === "home", JSON.stringify(tracked));
  check("reverse during the slide finishes on home", Math.abs(tracked.reversedVisual) < 0.02, JSON.stringify(tracked));

  check("rapid steps stay with the finger", tracked.maxStepError < 0.08, "maxStepError " + tracked.maxStepError);
  check("no single sample jumps a tab", tracked.maxJump < 0.55, "maxJump " + tracked.maxJump);
  const afterBurst = await state(page);
  const burstBad = problems(afterBurst, afterBurst.tab);
  check("rapid swipes settle in sync", burstBad.length === 0 && !afterBurst.animating && !afterBurst.dragging, burstBad.join("; ") + " tab=" + afterBurst.tab);

  // Real CDP flings back to back, the next one starting while the slide is still running.
  await page.evaluate(() => app.goTab("home"));
  await page.waitForTimeout(500);
  for (let i = 0; i < 4; i++) {
    await cdpSwipe(page, 330, 20, 3);
    await page.waitForTimeout(35);
  }
  await settled(page, "insights", "four overlapping forward flings reach insights");
  for (let i = 0; i < 4; i++) {
    await cdpSwipe(page, 20, 330, 3);
    await page.waitForTimeout(30);
  }
  await settled(page, "home", "four overlapping reverse flings return home");

  await page.click('#tabs .tab[data-tab="food"]');
  await settled(page, "food", "tap still lands on food");
  await page.click('#tabs .tab[data-tab="home"]');
  await settled(page, "home", "tap back home");

  const interesting = errors.filter((e) => !/supabase|Failed to fetch|net::|favicon|fonts\.google|fonts\.gstatic/i.test(e));
  check("no console errors", interesting.length === 0, interesting.join(" | "));
  await browser.close();

  const reduced = await boot(true);
  await cdpSwipe(reduced.page, 320, 40, 6);
  await reduced.page.waitForTimeout(80);
  const rs = await state(reduced.page);
  const rb = problems(rs, "workouts");
  check("reduced motion lands immediately", rb.length === 0, rb.join("; "));
  check("reduced motion bubble does not transition", /none/.test(rs.bubbleTransition) || rs.bubbleTransition.startsWith("all 0s"), rs.bubbleTransition);
  await reduced.page.waitForTimeout(500);
  await reduced.page.click('#tabs .tab[data-tab="progress"]');
  await reduced.page.waitForTimeout(80);
  const rt = await state(reduced.page);
  check("reduced motion tap", problems(rt, "progress").length === 0, problems(rt, "progress").join("; "));
  await reduced.browser.close();

  if (fails.length) {
    console.log("FAILED", fails.join(", "));
    process.exit(1);
  }
  console.log("ALL PASSED");
}

main().catch((err) => { console.error(err); process.exit(1); });
