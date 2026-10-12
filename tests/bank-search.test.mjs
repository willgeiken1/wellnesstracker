import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { app } from "../logger/js/runtime.js";
import "../logger/js/data/body.js";
import "../logger/js/shared/muscles.js";

app.esc = (s) => String(s == null ? "" : s);
app.customExercises = () => [];
app.musclesLabel = () => "";

function names(html) {
  return [...html.matchAll(/data-name="([^"]+)"/g)].map((m) => m[1]);
}

test("fuzzy search finds bench from a small typo and sorts names", () => {
  const html = app.bankListHTML({ q: "bensh", action: "pick" });
  assert.match(html, /data-src="bank" data-name="Bench Press"/);
  const found = names(html).filter((n) => n !== "bensh");
  const sorted = [...found].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  assert.deepEqual(found, sorted);
  assert.ok(found.length > 1);
});

test("search matches names and muscle groups, not equipment", () => {
  const curl = app.bankListHTML({ q: "curl", action: "pick" });
  assert.match(curl, /data-name="Barbell Curl"/);

  const chest = app.bankListHTML({ q: "chest", action: "pick" });
  assert.match(chest, /data-name="Bench Press"/);

  const lats = app.ASSETS.bank.find((b) => {
    const basic = app.basicOf(b.a);
    return basic.includes("lats") && !b.n.toLowerCase().includes("lat");
  });
  assert.ok(lats, "expected a lat exercise whose name does not say lat");
  const latHtml = app.bankListHTML({ q: "lats", action: "pick" });
  assert.match(latHtml, new RegExp(`data-name="${lats.n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));

  for (const q of ["barbell", "machine", "smith"]) {
    const html = app.bankListHTML({ q, action: "pick" });
    assert.match(html, /No matches/);
    assert.doesNotMatch(html, /Barbell Curl|Smith Machine Bench Press/);
    assert.match(html, new RegExp(`data-action="bank-create" data-name="${q}"`));
    assert.match(html, new RegExp(`Create ${q}`));
  }
});

test("an empty search result offers to create the typed name", () => {
  const html = app.bankListHTML({ q: "zzzznot", action: "pick" });
  assert.match(html, /No matches/);
  assert.match(html, /data-action="bank-create" data-name="zzzznot"/);
  assert.match(html, /Create zzzznot/);
  assert.doesNotMatch(html, /data-src="bank"/);
});

test("typing waits 250ms and rewrites only the results list", () => {
  app.ui = { sheet: "picker", detail: "push", sd: {} };
  app.workoutById = () => ({ id: "push", name: "Push", exercises: [] });
  let renders = 0;
  let scrolls = 0;
  let focuses = 0;
  app.renderSheet = () => { renders += 1; };
  app.render = () => { renders += 1; };
  const input = { id: "pick-q", focus() { focuses += 1; } };
  const body = { innerHTML: "OLD", scrollTop: 0 };
  const card = { scrollTop: 0 };
  globalThis.window = { scrollTo() { scrolls += 1; } };
  globalThis.document = {
    getElementById(id) {
      if (id === "pk-body") return body;
      if (id === "pick-q") return input;
      return null;
    },
    querySelector(sel) {
      if (sel === ".sheet-card") return card;
      return null;
    },
  };

  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    app.noteBankQuery("bensh");
    assert.equal(body.innerHTML, "OLD");
    assert.equal(app.ui.sd.q, "bensh");
    mock.timers.tick(249);
    assert.equal(body.innerHTML, "OLD");
    mock.timers.tick(1);
    assert.match(body.innerHTML, /data-filter="1"/);
    assert.match(body.innerHTML, /Bench Press/);
    assert.equal(renders, 0);
    assert.equal(scrolls, 0);
    assert.equal(focuses, 0);
    assert.equal(body.scrollTop, 0);
    assert.equal(card.scrollTop, 0);
    assert.equal(document.getElementById("pick-q"), input);

    const written = body.innerHTML;
    app.noteBankQuery("bensh");
    mock.timers.tick(250);
    assert.equal(body.innerHTML, written);
    assert.equal(renders, 0);
  } finally {
    mock.timers.reset();
  }
});
