import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import { authErrorText } from "../logger/js/shared/cloud.js";

const src = (p) => readFileSync(new URL(`../logger/${p}`, import.meta.url), "utf8");

test("sign-in errors read as plain words, never the server's text", () => {
  assert.match(authErrorText({ message: "Invalid login credentials" }, "signin"), /don't match/);
  assert.match(authErrorText({ message: "Email not confirmed" }, "signin"), /Confirm your email/);
  assert.match(authErrorText({ message: "User already registered" }, "signup"), /already an account/);
  assert.match(authErrorText({ message: "Email rate limit exceeded", status: 429 }, "signup"), /Too many tries/);
  assert.match(authErrorText(new TypeError("Failed to fetch"), "signin"), /Can't reach the server/);
  assert.match(authErrorText(new TypeError("Load failed"), "signin"), /Can't reach the server/);
  assert.equal(authErrorText({ message: "AuthApiError: something internal" }, "signin"), "Couldn't sign you in just now. Try again in a moment.");
  assert.equal(authErrorText(undefined, "signup"), "Couldn't create your account just now. Try again in a moment.");
  assert.equal(app.authErrorText, authErrorText);
});

test("a sign-in that throws gives the button back instead of leaving it on One moment", () => {
  const cloud = src("js/shared/cloud.js");
  const body = cloud.slice(cloud.indexOf("async function signIn("), cloud.indexOf("app.session = res.data.session"));
  assert.match(body, /try \{\s*res = mode === "signup"/);
  assert.match(body, /catch \(e\) \{\s*res = \{ error:/);
  assert.match(body, /restore\(\);\s*app\.toast\(authErrorText\(/);
  assert.doesNotMatch(body, /app\.toast\(res\.error\.message\)/);
});

test("search boxes update only their results, with a full render only as a fallback", () => {
  const actions = src("js/shell/actions.js");
  for (const [field, region, builder] of [
    ["food-rq", "food-rq-list", "app.recentFoodHTML()"],
    ["food-q", "food-q-list", "app.foodSavedSheetHTML()"],
    ["ms-q", "ms-q-list", "app.machineListSheetHTML()"],
    ["home-q", "home-q-list", "app.homeGalleryHTML()"],
  ]) {
    const line = actions.split("\n").find((l) => l.startsWith(`  "${field}": { region: "${region}"`));
    assert.ok(line && line.includes(`html: () => ${builder}`), `${field} swaps its results`);
  }
  const handler = actions.slice(actions.indexOf('document.addEventListener("input"'));
  assert.ok(handler.indexOf("if (swapSearchResults(el)) return;") < handler.indexOf('el.id === "ms-q"'), "the swap runs before the full-render fallbacks");
  assert.match(src("js/pages/food.js"), /<div id="food-rq-list">/);
  assert.match(src("js/pages/food.js"), /<div id="food-q-list">/);
  assert.match(src("js/pages/settings.js"), /<div id="ms-q-list">/);
  assert.match(src("js/pages/home.js"), /class="hw-gal-scroll" id="home-q-list"/);
});

test("coming back to the app leaves an open sheet, a focused field or the live workout alone", () => {
  const timer = src("js/shell/timer.js");
  const handler = timer.slice(timer.indexOf('document.addEventListener("visibilitychange"'));
  assert.match(handler, /if \(busyOnReturn\(\)\) app\.tick\(\);\s*else app\.render\(\);/);
  const busy = timer.slice(timer.indexOf("function busyOnReturn"), timer.indexOf("app.busyOnReturn"));
  for (const k of ["app.ui.sheet", "app.ui.workoutOpen", "app.ui.cardioOpen", "INPUT|TEXTAREA|SELECT", "dialog"]) assert.ok(busy.includes(k), k);
});

test("re-rendering an open sheet keeps its scroll and doesn't replay the slide-in", () => {
  const w = src("js/shell/workout.js");
  const fn = w.slice(w.indexOf("function renderSheet()"), w.indexOf("app.renderSheet = renderSheet"));
  assert.match(fn, /const sameSheet = !!prevCard && el\.dataset\.open === app\.ui\.sheet;/);
  assert.match(fn, /if \(card && sameSheet && keepTop\) card\.scrollTop = keepTop;/);
  assert.match(fn, /if \(!sameSheet && !detailSheet\) el\.classList\.add\("sheet-in"\);\s*else el\.classList\.remove\("sheet-in"\);/);
  const rw = w.slice(w.indexOf("function renderWorkout()"), w.indexOf("app.renderWorkout = renderWorkout"));
  assert.match(rw, /const keepTop = el\.hidden \? 0 : el\.scrollTop;/);
  assert.match(rw, /if \(keepTop\) el\.scrollTop = keepTop;/);
});

test("controls answer a press, skip the tap delay and respect reduced motion", () => {
  const css = src("css/polish.css");
  assert.match(css, /:where\(button, \[role="button"\], \.set-row, a\.btn\) \{ touch-action: manipulation; \}/);
  assert.match(css, /:where\(button:not\(:disabled\), \[role="button"\], \.set-row, a\.btn\):active \{ opacity: \.66;/);
  assert.match(css, /#sheet\.sheet-in \.sheet-card \{ animation: sheet-up/);
  const reduce = css.slice(css.lastIndexOf("Feel: sheet entrance"));
  assert.match(reduce, /prefers-reduced-motion: reduce\) \{\s*#sheet\.sheet-in \.sheet-card, #sheet\.sheet-in \.sheet-back \{ animation: none; \}/);
  assert.match(src("css/base.css"), /\.wo-actions \{ display: flex; gap: 16px; \}/);
});
