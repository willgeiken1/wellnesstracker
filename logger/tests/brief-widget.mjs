// Home Morning Brief widget. Run with the app served at BASE (default :8765):
//   PLAYWRIGHT_PATH=... node logger/tests/brief-widget.mjs

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

async function boot(state) {
  const browser = await chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  if (state) await page.addInitScript((s) => localStorage.setItem("liftlog-v1", JSON.stringify(s)), state);
  else await page.addInitScript(() => localStorage.removeItem("liftlog-v1"));
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.app && window.app.homeHTML);
  await page.waitForTimeout(200);
  return { browser, page, errors };
}

async function widgetOrder(page) {
  return page.$$eval("#pane-home .wdg", (els) => els.map((el) => el.dataset.w));
}

async function main() {
  const { browser, page, errors } = await boot(null);

  check("brief is on home", await page.locator("#pane-home .wdg[data-w='brief'] .brief").count() === 1);
  check("brief is the first widget", (await widgetOrder(page))[0] === "brief", (await widgetOrder(page)).join(">"));
  const label = await page.locator(".brief-k").innerText();
  check("brief label", /morning brief/i.test(label), label);
  check("expand and edit controls", await page.locator("[data-action='brief-size']").count() === 1 && await page.locator("[data-action='brief-edit']").count() === 1);

  await page.locator("[data-action='brief-size']").click();
  await page.waitForTimeout(150);
  check("expand keeps the card", await page.locator(".brief.expanded").count() === 1);
  await page.locator("[data-action='brief-size']").click();
  await page.waitForTimeout(100);

  const card = page.locator("#pane-home .wdg[data-w='brief']");
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 90);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(250);
  check("home edit mode", await page.evaluate(() => app.ui.edit) === "home");
  check("brief has move and remove", await page.locator(".wdg[data-w='brief'] .wdg-grip").count() === 1 && await page.locator(".wdg[data-w='brief'] .wdg-x").count() === 1);
  await card.screenshot({ path: ART + "/brief_widget_edit.png", animations: "disabled" });

  const before = await widgetOrder(page);
  const grip = page.locator(".wdg[data-w='brief'] .wdg-grip");
  const gr = await grip.boundingBox();
  const today = await page.locator(".wdg[data-w='today']").boundingBox();
  await page.mouse.move(gr.x + 16, gr.y + 16);
  await page.mouse.down();
  await page.mouse.move(gr.x + 16, today.y + today.height - 8, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await widgetOrder(page);
  check("reorder moves the brief", after.indexOf("brief") > before.indexOf("brief"), after.join(">"));

  await page.locator(".wdg[data-w='brief'] .wdg-x").click({ force: true });
  await page.waitForTimeout(200);
  check("brief hidden", await page.locator(".wdg[data-w='brief']").count() === 0);
  await page.locator("[data-action='w-add']").click();
  await page.waitForTimeout(200);
  check("add menu lists morning brief", (await page.locator("#sheet").innerText()).includes("Morning brief"));
  await page.locator("[data-action='w-add-one'][data-w='brief']").click();
  await page.waitForTimeout(250);
  check("brief re-added", await page.locator(".wdg[data-w='brief'] .brief").count() === 1);
  await page.locator("[data-action='w-done']").click({ force: true });
  await page.waitForTimeout(200);

  await page.locator(".avatar").click();
  await page.waitForTimeout(300);
  await page.locator("[data-action='demo-on']").click();
  await page.waitForTimeout(300);
  await page.evaluate(() => app.goTab("home"));
  await page.waitForTimeout(300);
  check("demo still shows the brief", await page.locator(".wdg[data-w='brief'] .brief").count() === 1 && await page.evaluate(() => app.state.demo === true));
  const demoText = await page.locator(".wdg[data-w='brief']").innerText();
  check("demo brief has tiles", /Readiness|Training|This week/.test(demoText), demoText.slice(0, 240));

  await page.locator("[data-action='brief-edit']").click();
  await page.waitForTimeout(150);
  const switches = page.locator(".brief-edit .switch");
  const n = await switches.count();
  check("metric editor opens", n >= 5, String(n));
  for (let i = 0; i < n; i++) {
    if ((await switches.nth(i).getAttribute("aria-checked")) === "true") await switches.nth(i).click();
  }
  await page.locator("[data-action='brief-done']").click();
  await page.waitForTimeout(150);
  const emptyText = await page.locator(".wdg[data-w='brief']").innerText();
  check("empty state", emptyText.includes("All metrics are off"), emptyText.slice(0, 240));
  await page.locator(".wdg[data-w='brief']").screenshot({ path: ART + "/brief_widget_empty.png", animations: "disabled" });

  for (const accent of ["citrus", "sea", "dusk", "sand"]) {
    await page.evaluate((a) => { app.state.theme = { mode: "light", accent: a }; app.applyTheme(); app.render(); }, accent);
    await page.waitForTimeout(80);
    check(`light ${accent} still shows brief`, await page.locator(".brief").count() === 1);
  }
  await page.evaluate(() => { app.state.theme = { mode: "dark", accent: "citrus" }; app.applyTheme(); app.render(); });
  check("dark still shows brief", await page.locator(".brief").count() === 1);

  const interesting = errors.filter((e) => !/supabase|Failed to fetch|net::|favicon|fonts\.google|fonts\.gstatic/i.test(e));
  check("no console errors", interesting.length === 0, interesting.join(" | "));
  await browser.close();

  const saved = await boot(null);
  await saved.page.evaluate(() => {
    app.state.layout = { home: { order: ["today", "week", "readiness"], hidden: ["map-basic"] } };
    app.render();
  });
  await saved.page.waitForTimeout(150);
  const migrated = await widgetOrder(saved.page);
  check("saved layout still shows brief first", migrated[0] === "brief" && migrated.includes("today"), migrated.join(">"));
  await saved.page.evaluate(() => {
    app.state.layout.home.hidden = [...app.state.layout.home.hidden, "brief"];
    app.render();
  });
  check("explicit hide stays hidden", await saved.page.locator(".wdg[data-w='brief']").count() === 0);
  await saved.browser.close();

  if (fails.length) { console.log("FAILED", fails.join(", ")); process.exit(1); }
  console.log("ALL PASSED");
}

main().catch((err) => { console.error(err); process.exit(1); });
