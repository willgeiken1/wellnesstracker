import assert from "node:assert/strict";
import { describe, test } from "node:test";

/* Synthetic routines only. A fake clock and a fake timeout stand in for
   real time. The flag stays false in source. */

function el() {
  return {
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    appendChild() {},
    remove() {},
    click() {},
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    dataset: {},
    hidden: true,
    innerHTML: "",
  };
}
const card = { outerHTML: "" };
let cardPresent = true;
globalThis.document = {
  hidden: false,
  addEventListener() {},
  removeEventListener() {},
  documentElement: { dataset: {}, classList: { add() {}, remove() {} } },
  body: el(),
  head: el(),
  querySelector: (sel) => (sel === ".dr-now" ? (cardPresent ? card : null) : el()),
  querySelectorAll: () => [],
  getElementById: () => el(),
  createElement: () => el(),
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const timeouts = [];
globalThis.setTimeout = (fn, ms) => {
  const handle = { fn, ms, unref() {} };
  timeouts.push(handle);
  return handle;
};

const { app } = await import("../logger/js/runtime.js");
const { dailyRoutinesHTML } = await import("../logger/js/pages/daily-routines.js");

let clock = new Date("2026-11-19T11:59:00");
function drain() {
  app.ui = { tab: "home" };
  while (timeouts.length) timeouts.shift().fn();
}

function signIn() {
  if (app.ui) drain();
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.sb = null;
  app.cloudPullOk = true;
  app.state = { dailyRoutines: null };
  app.save = () => {};
  app.ui = { tab: "daily-routines" };
  app.today = () => "2026-11-19";
  app.routineNow = () => clock;
  app.render = () => { app.rendered = (app.rendered || 0) + 1; };
  app.rendered = 0;
  timeouts.length = 0;
  cardPresent = true;
  card.outerHTML = "";
  document.hidden = false;
}

function fire() {
  const next = timeouts.shift();
  assert.ok(next, "a timeout is waiting");
  clock = new Date(clock.getTime() + next.ms);
  next.fn();
}

describe("routine Now card tick", { concurrency: false }, () => {
  test("the Now card repaints at each minute boundary and the tab repaints at a slot change", () => {
    clock = new Date("2026-11-19T11:58:30");
    signIn();
    const html = dailyRoutinesHTML();
    assert.match(html, /Morning routine/);
    assert.equal(timeouts.length, 1);
    assert.ok(timeouts[0].ms > 29000 && timeouts[0].ms <= 31000);

    fire();
    assert.match(card.outerHTML, /11:59/);
    assert.match(card.outerHTML, /Morning routine/);
    assert.match(card.outerHTML, /1 min/);
    assert.equal(app.rendered, 0);
    assert.equal(timeouts.length, 1);

    fire();
    assert.equal(clock.getHours(), 12);
    assert.equal(app.rendered, 1);
    assert.equal(timeouts.length, 1);
    app.routineNow = () => clock;
    assert.match(dailyRoutinesHTML(), /Afternoon/);
    assert.equal(timeouts.length, 1);
  });

  test("no timer starts when the flag is off, the user is signed out, or another tab shows", () => {
    signIn();
    app.ROUTINES_ENABLED = false;
    dailyRoutinesHTML();
    assert.equal(timeouts.length, 0);
    app.ROUTINES_ENABLED = true;
    app.session = null;
    dailyRoutinesHTML();
    assert.equal(timeouts.length, 0);
    signIn();
    app.ui.tab = "home";
    dailyRoutinesHTML();
    assert.equal(timeouts.length, 0);
  });

  test("the timer stops when the tab changes or the page is hidden", () => {
    signIn();
    dailyRoutinesHTML();
    app.ui.tab = "home";
    fire();
    assert.equal(timeouts.length, 0);
    assert.equal(card.outerHTML, "");
    signIn();
    dailyRoutinesHTML();
    document.hidden = true;
    fire();
    assert.equal(timeouts.length, 0);
    assert.equal(card.outerHTML, "");
  });
});
