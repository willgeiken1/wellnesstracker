// Machine settings notes and the pinned edit-mode Done button.
//   PLAYWRIGHT_PATH=... node logger/tests/machine-notes.mjs

import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_PATH || "playwright");
const { chromium } = pw;

const BASE = process.env.BASE || "http://127.0.0.1:8765";
const ART = "/opt/cursor/artifacts";
mkdirSync(ART, { recursive: true });
const fails = [];

function check(name, cond, extra) {
  if (cond) console.log("PASS", name);
  else { console.log("FAIL", name, extra || ""); fails.push(name); }
}

async function launch() {
  const browser = await chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  return browser;
}

async function boot(browser, state) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  if (state) {
    await page.addInitScript((s) => {
      // Reload must keep what the page saved. Seeding on every navigation wiped the open workout.
      if (sessionStorage.getItem("notes-booted")) return;
      localStorage.setItem("liftlog-v1", JSON.stringify(s));
      sessionStorage.setItem("notes-booted", "1");
    }, state);
  } else await page.addInitScript(() => localStorage.removeItem("liftlog-v1"));
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.app && window.app.mergeRemote);
  await page.waitForTimeout(200);
  return { context, page, errors };
}

async function hold(page, selector) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: "visible" });
  let box = await el.boundingBox();
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(50);
    const next = await el.boundingBox();
    const settled = next && box && Math.abs(next.x - box.x) < 0.5 && Math.abs(next.y - box.y) < 0.5;
    box = next;
    if (settled) break;
  }
  await page.mouse.move(box.x + Math.min(24, box.width / 2), box.y + Math.min(30, box.height / 2));
  await page.waitForTimeout(40);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await page.waitForTimeout(250);
}

async function pillBox(page) {
  return page.locator(".done-pill").boundingBox();
}

async function main() {
  const browser = await launch();
  const seeded = {
    version: 2,
    sessions: [],
    machineNotes: { "Pec Fly Machine": "Seat 4" },
    theme: { mode: "dark", accent: "citrus" },
  };
  const { page, errors } = await boot(browser, seeded);

  const migrated = await page.evaluate(() => {
    const v = app.state.machineNotes["Pec Fly Machine"];
    return { text: app.machineNote("Pec Fly Machine"), shape: v && typeof v === "object" && !Array.isArray(v) ? v : null };
  });
  check("legacy string migrates to a note record", migrated.text === "Seat 4" && migrated.shape && migrated.shape.text === "Seat 4" && typeof migrated.shape.at === "number", JSON.stringify(migrated));
  const rpcGate = await page.evaluate(() => ({
    missing: app.mergeRpcMissing({ code: "PGRST202", message: "Could not find the function public.merge_user_data(p_data) in the schema cache" }),
    undefinedFn: app.mergeRpcMissing({ code: "42883", message: "function public.merge_user_data(jsonb) does not exist" }),
    other: app.mergeRpcMissing({ code: "42501", message: "permission denied for function merge_user_data" }),
    none: app.mergeRpcMissing(null),
  }));
  check("undeployed merge function is the fallback case", rpcGate.missing === true && rpcGate.undefinedFn === true && rpcGate.other === false && rpcGate.none === false, JSON.stringify(rpcGate));

  const pushed = await page.evaluate(async () => {
    const calls = [];
    const prevSb = app.sb;
    const prevSession = app.session;
    const prevNotes = JSON.parse(JSON.stringify(app.state.machineNotes));
    app.session = { user: { id: "11111111-1111-4111-8111-111111111111" } };
    app.state.machineNotes = { "Pec Fly Machine": { text: "Seat 4", at: 10 } };
    app.sb = {
      rpc: async (name, args) => {
        calls.push({ rpc: name, sent: args.p_data.machineNotes["Pec Fly Machine"].text });
        return { data: { machineNotes: { "Pec Fly Machine": { text: "Seat 4", at: 10 }, Dips: { text: "Wide", at: 8 } } }, error: null };
      },
      from() { throw new Error("fallback should not run when merge_user_data succeeds"); },
    };
    await app.cloudPush();
    const keptRemote = app.machineNote("Dips");
    app.state.machineNotes = { "Pec Fly Machine": { text: "Seat 9", at: 20 } };
    app.sb = {
      rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.merge_user_data" } }),
      from() {
        return {
          select() { return { eq: () => ({ maybeSingle: async () => ({ data: { data: { machineNotes: { "Cable Row": { text: "Pin 3", at: 3 } } } }, error: null }) }) }; },
          upsert: async (row) => { calls.push({ upsert: row.data.machineNotes["Pec Fly Machine"].text, cable: row.data.machineNotes["Cable Row"].text }); return { error: null }; },
        };
      },
    };
    await app.cloudPush();
    const mergedFallback = app.machineNote("Cable Row");
    app.state.machineNotes = prevNotes;
    app.sb = prevSb;
    app.session = prevSession;
    return { calls, keptRemote, mergedFallback };
  });
  check("save syncs through merge_user_data and keeps the other phone's note", pushed.calls[0] && pushed.calls[0].rpc === "merge_user_data" && pushed.calls[0].sent === "Seat 4" && pushed.keptRemote === "Wide", JSON.stringify(pushed));
  check("missing merge function falls back without dropping either note", pushed.calls[1] && pushed.calls[1].upsert === "Seat 9" && pushed.calls[1].cable === "Pin 3" && pushed.mergedFallback === "Pin 3", JSON.stringify(pushed));

  await page.locator('.tab[data-tab="workouts"]').click();
  await page.waitForTimeout(200);
  check("workouts gear is gone", await page.locator(".gear-btn").count() === 0);
  check("workouts header has no machine-settings button", await page.locator("#pane-workouts [data-action='ms-list']").count() === 0);

  await page.locator('.tab[data-tab="home"]').click();
  await page.waitForTimeout(150);
  await page.locator("[data-action='start'][data-id='push']").first().click();
  await page.waitForSelector("#workout .ex");
  const rows = await page.locator("#workout .ex").count();
  const controls = await page.locator("#workout .ms-chip, #workout .ms-add").count();
  check("every exercise shows a chip or link", rows > 1 && controls === rows, `${controls} of ${rows}`);
  check("saved note shows as a chip", (await page.locator("#workout .ms-chip span").first().innerText()) === "Seat 4");
  check("unsaved exercise shows the link", await page.locator("#workout .ms-add", { hasText: "Machine settings" }).count() >= 1);
  const chipHtml = await page.locator("#workout .ms-chip").first().innerHTML();
  check("chip uses the gear icon", chipHtml.includes("<svg") && !chipHtml.includes("⚙"));

  const linkBox = await page.locator("#workout .ms-add").first().boundingBox();
  const chipBox = await page.locator("#workout .ms-chip").first().boundingBox();
  check("chip tap target", chipBox && chipBox.height >= 44 && chipBox.width >= 44 && chipBox.x >= 0 && chipBox.x + chipBox.width <= 390, JSON.stringify(chipBox));
  check("link tap target", linkBox && linkBox.height >= 44 && linkBox.width >= 44 && linkBox.x >= 0 && linkBox.x + linkBox.width <= 390, JSON.stringify(linkBox));

  await page.locator("#workout .ms-chip").first().click();
  await page.waitForSelector("#ms-text");
  check("editor has no Clear button", await page.locator("[data-action='ms-clear']").count() === 0 && !(await page.locator("#sheet").innerText()).includes("Clear"));
  check("editor keeps the saved text", await page.locator("#ms-text").inputValue() === "Seat 4");
  await page.locator("#ms-text").fill("Seat 6");
  await page.locator("[data-action='ms-save']").click();
  await page.waitForTimeout(150);
  check("chip updates after save", (await page.locator("#workout .ms-chip span").first().innerText()) === "Seat 6");

  await page.locator("#workout li.ex").first().screenshot({ path: ART + "/machine_settings_chip.png", animations: "disabled" });

  for (const mode of ["dark", "light"]) {
    for (const accent of ["citrus", "sea", "dusk", "sand"]) {
      await page.evaluate(({ mode, accent }) => {
        app.state.theme = { mode, accent };
        app.applyTheme();
        app.renderWorkout();
      }, { mode, accent });
      const box = await page.locator("#workout .ms-chip").first().boundingBox();
      check(`${mode} ${accent} chip fits`, !!(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= 390), JSON.stringify(box));
    }
  }
  await page.evaluate(() => { app.state.theme = { mode: "dark", accent: "citrus" }; app.applyTheme(); app.renderWorkout(); });

  await page.locator("#workout .ms-chip").first().click();
  await page.locator("#ms-text").fill("");
  await page.locator("[data-action='ms-save']").click();
  await page.waitForTimeout(100);
  check("empty save does not wipe the note", (await page.locator("#workout .ms-chip span").first().innerText()) === "Seat 6");
  check("Clear stays absent", await page.locator("[data-action='ms-clear']").count() === 0);
  await page.locator("#ms-text").fill("Seat 7");
  await page.locator("[data-action='ms-save']").click();
  await page.waitForTimeout(150);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => window.app && window.app.machineNote);
  await page.locator("[data-action='resume']").click();
  await page.waitForSelector("#workout .ms-chip");
  check("note survives reload", (await page.locator("#workout .ms-chip span").first().innerText()) === "Seat 7");

  const merged = await page.evaluate(() => {
    app.state.machineNotes = {
      "Pec Fly Machine": { text: "Seat 7", at: 5000 },
      "Dips": { text: "Assist band", at: 4000 },
    };
    app.state.settingsAt = 1000;
    app.state.updatedAt = 2000;
    app.state.theme = { mode: "dark", accent: "citrus" };
    app.state.muscleMode = "basic";
    app.mergeRemote({
      settingsAt: 9000,
      updatedAt: 8000,
      theme: { mode: "light", accent: "sea" },
      muscleMode: "advanced",
      layout: { home: { order: ["today"], hidden: [] } },
      machineNotes: {
        "Pec Fly Machine": { text: "Seat 1", at: 1000 },
        "Cable Lateral Raise": { text: "Pin 4", at: 3000 },
      },
    });
    const themeCase = {
      pec: app.machineNote("Pec Fly Machine"),
      dips: app.machineNote("Dips"),
      cable: app.machineNote("Cable Lateral Raise"),
      mode: app.state.theme.mode,
      accent: app.state.theme.accent,
      muscle: app.state.muscleMode,
    };
    const both = app.mergeMachineNotes(
      { "Pec Fly Machine": { text: "Seat 7", at: 10 }, Dips: { text: "Old dips", at: 5 } },
      { Dips: { text: "New dips", at: 20 }, "Calf Raises": { text: "High", at: 8 } }
    );
    const newest = app.mergeMachineNotes(
      { "Pec Fly Machine": { text: "Seat 7", at: 10 } },
      { "Pec Fly Machine": { text: "Seat 9", at: 30 } }
    );
    const olderRemote = app.mergeMachineNotes(
      { "Pec Fly Machine": { text: "Seat 9", at: 30 } },
      { "Pec Fly Machine": { text: "Seat 1", at: 4 } }
    );
    app.state.machineNotes = {};
    app.state.settingsAt = 0;
    app.mergeRemote({ machineNotes: { Dips: { text: "Wide", at: 50 } }, settingsAt: 10 });
    const firstSync = app.machineNote("Dips");
    app.state.machineNotes = { "Pec Fly Machine": "Seat 4" };
    app.state.settingsAt = 10;
    app.mergeRemote({ settingsAt: 99999, updatedAt: 1, machineNotes: { "Pec Fly Machine": "Seat 1", Dips: "Wide grip" } });
    return { themeCase, both, newest, olderRemote, firstSync, legacyLocal: app.machineNote("Pec Fly Machine"), legacyOther: app.machineNote("Dips") };
  });

  check("theme sync keeps the newer note", merged.themeCase.pec === "Seat 7" && merged.themeCase.mode === "light" && merged.themeCase.accent === "sea", JSON.stringify(merged.themeCase));
  check("unrelated settings sync keeps other notes", merged.themeCase.dips === "Assist band" && merged.themeCase.muscle === "advanced", JSON.stringify(merged.themeCase));
  check("remote note that this phone lacks is kept", merged.themeCase.cable === "Pin 4");
  check("edits to different notes both survive", merged.both["Pec Fly Machine"].text === "Seat 7" && merged.both.Dips.text === "New dips" && merged.both["Calf Raises"].text === "High", JSON.stringify(merged.both));
  check("newest edit to the same note wins", merged.newest["Pec Fly Machine"].text === "Seat 9" && merged.olderRemote["Pec Fly Machine"].text === "Seat 9");
  check("first sync on an empty phone keeps cloud notes", merged.firstSync === "Wide");
  check("legacy notes are not replaced by a newer settings blob", merged.legacyLocal === "Seat 4" && merged.legacyOther === "Wide grip", JSON.stringify(merged));

  await page.evaluate(() => {
    app.ui.workoutOpen = false;
    app.ui.sheet = null;
    app.ui.detail = null;
    app.ui.tab = "workouts";
    app.state.muscleMode = "basic";
    app.state.machineNotes["Pec Fly Machine"] = { text: "Seat 6", at: Date.now() };
    app.applyTheme();
    app.render();
  });
  await page.waitForTimeout(200);
  await page.locator("[data-action='open-w'][data-id='push']").click();
  await page.waitForSelector("#start-slot .start-bar");
  const startAtRest = await page.locator("#start-slot .start-bar").boundingBox();
  await page.evaluate(() => {
    const pane = document.querySelector(".pane.active");
    pane.scrollTop = pane.scrollHeight;
  });
  await page.waitForTimeout(80);
  const startScrolled = await page.locator("#start-slot .start-bar").boundingBox();
  check("start button stays pinned while the routine scrolls",
    startAtRest && startScrolled && Math.abs(startAtRest.y - startScrolled.y) < 1 && startAtRest.x >= -1 && startAtRest.x + startAtRest.width <= 391,
    JSON.stringify({ startAtRest, startScrolled }));
  await page.evaluate(() => { document.querySelector(".pane.active").scrollTop = 0; });
  await page.locator("[data-action='edit-ex']").first().click();
  await page.locator("#exName").fill("Pec Fly");
  await page.locator("[data-action='ex-save']").click();
  await page.waitForTimeout(200);
  const renamed = await page.evaluate(() => ({
    next: app.machineNote("Pec Fly"),
    prev: app.machineNote("Pec Fly Machine"),
    tomb: app.state.machineNotes["Pec Fly Machine"],
  }));
  check("rename carries the note", renamed.next === "Seat 6" && renamed.prev === "" && renamed.tomb && renamed.tomb.gone, JSON.stringify(renamed));

  check("no console errors", errors.length === 0, errors.join(" | "));
  await page.context().close();

  const pill = await boot(browser, null);
  const p = pill.page;
  await hold(p, "#pane-home .wdg");
  check("home edit mode", await p.evaluate(() => app.ui.edit) === "home");
  await p.locator(".done-pill").screenshot({ path: ART + "/done_pill_pinned.png", animations: "disabled" });

  async function assertPinned(label) {
    const before = await pillBox(p);
    const tabs = await p.locator("#tabs").boundingBox();
    check(`${label} pill is on screen`, !!before, JSON.stringify(before));
    if (!before || !tabs) return;
    check(`${label} pill sits above the tab bar`, before.y + before.height <= tabs.y + 1, JSON.stringify({ before, tabs }));
    check(`${label} pill tap target`, before.height >= 44);
    await p.evaluate(() => {
      const pane = document.querySelector(".pane.active") || document.getElementById("view");
      pane.scrollTop = pane.scrollHeight;
    });
    await p.waitForTimeout(80);
    const after = await pillBox(p);
    check(`${label} pill stays put while scrolling`, Math.abs(before.y - after.y) < 1 && Math.abs(before.x - after.x) < 1, `${before.y} -> ${after.y}`);
    const mounted = await p.evaluate(() => {
      const el = document.querySelector(".done-pill");
      return el && el.parentElement && el.parentElement.id;
    });
    check(`${label} pill is outside the scrolling pane`, mounted === "done-slot");
  }

  await assertPinned("home");
  const homeClears = await p.evaluate(() => {
    const pane = document.querySelector(".pane.active");
    pane.scrollTop = pane.scrollHeight;
    const last = pane.querySelector(".wdg:last-child");
    const pill = document.querySelector(".done-pill").getBoundingClientRect();
    const box = last.getBoundingClientRect();
    return { bottom: box.bottom, pill: pill.top, scrollable: pane.scrollHeight > pane.clientHeight + 40 };
  });
  check("home can scroll", homeClears.scrollable, JSON.stringify(homeClears));
  check("home content scrolls above the pill", homeClears.bottom <= homeClears.pill + 1, JSON.stringify(homeClears));

  for (const mode of ["light", "dark"]) {
    await p.evaluate((mode) => { app.state.theme = { mode, accent: "citrus" }; app.applyTheme(); app.render(); }, mode);
    await assertPinned(`home ${mode}`);
  }

  const resting = await pillBox(p);
  await p.evaluate(() => {
    const w = app.state.workouts[0];
    app.state.sessions.push({
      id: "rest-test",
      date: app.today(),
      workoutId: w.id,
      name: w.name,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      entries: [],
    });
    app.startTimer();
    app.tick();
  });
  const lifted = await pillBox(p);
  const timer = await p.locator("#timer").boundingBox();
  check("pill stays above the rest timer", lifted && timer && lifted.y + lifted.height <= timer.y + 1, JSON.stringify({ lifted, timer }));
  check("timer lifts the pill off the tab bar", lifted && resting && lifted.y < resting.y - 20, JSON.stringify({ lifted, resting }));
  await p.evaluate(() => {
    const pane = document.querySelector(".pane.active");
    pane.scrollTop = 0;
    const bar = document.createElement("div");
    bar.className = "start-bar";
    bar.innerHTML = "<button class='btn primary block'>Start</button>";
    // A bar inside the transformed pane is not viewport-fixed, so it cannot stand in for the pinned Start button.
    document.body.appendChild(bar);
  });
  await p.waitForTimeout(50);
  const aboveStart = await pillBox(p);
  const start = await p.locator(".start-bar").boundingBox();
  check("pill stays above the start bar", aboveStart && start && aboveStart.y + aboveStart.height <= start.y + 1, JSON.stringify({ aboveStart, start }));
  await p.evaluate(() => {
    app.stopTimer();
    app.state.sessions = app.state.sessions.filter((s) => s.id !== "rest-test");
    app.tick();
    document.querySelector(".start-bar").remove();
  });

  await p.locator(".done-pill").click();
  await p.waitForTimeout(150);
  check("Done leaves edit mode", await p.evaluate(() => app.ui.edit) === null && await p.locator(".done-pill").count() === 0);

  await p.locator('.tab[data-tab="food"]').click();
  await p.waitForTimeout(250);
  await hold(p, "#pane-food .wdg");
  check("food edit mode", await p.evaluate(() => app.ui.edit) === "food");
  await assertPinned("food");
  await p.locator(".done-pill").click();

  await p.locator('.tab[data-tab="insights"]').click();
  await p.waitForTimeout(250);
  const trendsWidget = await p.locator("#pane-insights .wdg").count();
  if (trendsWidget) await hold(p, "#pane-insights .wdg");
  else await p.evaluate(() => { app.ui.tab = "insights"; app.ui.iseg = "trends"; app.ui.edit = "trends"; app.render(); });
  check("trends edit mode", await p.evaluate(() => app.ui.edit) === "trends");
  await assertPinned("trends");

  await p.evaluate(() => { app.ui.tab = "insights"; app.ui.iseg = "recovery"; app.ui.edit = "recovery"; app.render(); });
  check("recovery edit mode", await p.evaluate(() => app.ui.edit) === "recovery");
  await assertPinned("recovery");

  await p.evaluate(() => { app.ui.edit = null; app.ui.tab = "workouts"; app.ui.detail = null; app.ui.wseg = "routines"; app.render(); });
  await p.waitForFunction(() => !app.motion.animating && !app.motion.dragging);
  await hold(p, "#pane-workouts .wcard");
  check("routines edit mode", await p.evaluate(() => app.ui.edit) === "routines");
  await assertPinned("routines");

  check("done-pill page has no console errors", pill.errors.length === 0, pill.errors.join(" | "));
  await browser.close();

  if (fails.length) {
    console.log("FAILED", fails.length, fails.join(", "));
    process.exit(1);
  }
  console.log("ALL PASSED");
}
main().catch((err) => { console.error(err); process.exit(1); });
