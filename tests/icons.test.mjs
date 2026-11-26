import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import { icon } from "../logger/js/shared/icons.js";
import { ICON_SET, ICON_STROKE } from "../logger/js/shared/icon-set.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const source = JSON.parse(read("../design/icons/insight-icons.json"));

test("the web set is the design set, and the generated files are current", () => {
  assert.deepEqual({ ...ICON_SET }, source.icons);
  assert.equal(ICON_STROKE, 1.75);
  execFileSync("node", [new URL("../native/scripts/gen-icons.cjs", import.meta.url).pathname, "--check"], { stdio: "pipe" });
});

test("an icon is a decorative inline SVG that takes its colour and size from where it sits", () => {
  for (const name of Object.keys(ICON_SET)) {
    const html = icon(name);
    assert.match(html, /^<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">/, name);
    assert.ok(html.includes(ICON_SET[name]), name);
    assert.doesNotMatch(html.replace(/currentColor/g, ""), /(?:stroke|fill)="(?!none)[^"]/, name);
    for (const width of html.matchAll(/stroke-width="([^"]+)"/g)) assert.equal(width[1], "1.75", name);
  }
  assert.match(icon("lock", { size: 28 }), / width="28" height="28" /);
  assert.match(icon("chevron-right", { cls: "chev" }), /class="ic chev"/);
  assert.throws(() => icon("no-such-icon"), /No icon named/);
  assert.equal(app.icon, icon);
});

test("the tab bar and the shared chevrons and grip come from the set", () => {
  const html = read("../logger/index.html");
  for (const tab of ["home", "workouts", "food", "progress", "insights"]) {
    assert.ok(html.includes(`data-tab="${tab}"`) && html.includes(`data-icon="${tab}" aria-hidden="true" focusable="false">${ICON_SET[tab]}</svg>`), tab);
  }
  assert.ok(app.I.chevR.includes(ICON_SET["chevron-right"]) && app.I.chevL.includes(ICON_SET["chevron-left"]));
  assert.ok(app.I.chevD.includes(ICON_SET["chevron-down"]) && app.I.grip.includes(ICON_SET["drag-handle"]));
});

test("no page keeps a hand-drawn icon, a character or an emoji in an icon slot", () => {
  const files = ["pages/cardio.js", "pages/daily-routines.js", "pages/food.js", "pages/home.js", "pages/privacy.js", "pages/session.js", "pages/settings.js", "pages/workouts.js",
    "shared/muscles.js", "shared/profile.js", "shared/weekly.js", "shared/widgets.js", "shell/actions.js", "shell/pager.js", "shell/workout.js"];
  for (const file of files) {
    const text = read(`../logger/js/${file}`);
    assert.doesNotMatch(text, /<svg viewBox="0 0 24 24"/, file);
    assert.doesNotMatch(text, />(?:×|‹|›|▶|✓|\+|−)<\/(?:button|span)>/u, file);
    assert.doesNotMatch(text, /[\u{1F3C3}\u{1FA9C}\u{1F6B2}\u{1F6A3}\u{1F3C6}〰⚖]/u, file);
  }
  const sw = read("../logger/sw.js");
  assert.match(sw, /"\.\/js\/shared\/icon-set\.js"/);
});
