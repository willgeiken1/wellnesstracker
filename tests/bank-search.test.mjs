import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { app } from "../logger/js/runtime.js";
import "../logger/js/data/body.js";
import "../logger/js/shared/muscles.js";

app.esc = (s) => String(s == null ? "" : s);
app.customExercises = () => [];
app.musclesLabel = () => "";

function rows(html) {
  return [...html.matchAll(/<button class="pk-row[^"]*"([^>]*)>/g)].map((m) => {
    const attrs = m[1];
    const tier = Number((attrs.match(/data-tier="(\d+)"/) || [])[1]);
    const name = (attrs.match(/data-name="([^"]+)"/) || [])[1];
    return { tier, name };
  }).filter((row) => row.name);
}

function assertTierOrder(list) {
  assert.ok(list.length > 1);
  const tiers = list.map((row) => row.tier);
  const sortedTiers = [...tiers].sort((a, b) => a - b);
  assert.deepEqual(tiers, sortedTiers);
  for (const tier of new Set(tiers)) {
    const names = list.filter((row) => row.tier === tier).map((row) => row.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
    assert.deepEqual(names, sorted, `tier ${tier} should be alphabetical`);
  }
}

test("fuzzy search finds bench from a small typo and sorts within each tier", () => {
  const html = app.bankListHTML({ q: "bensh", action: "pick" });
  const found = rows(html).filter((row) => row.name !== "bensh");
  assert.ok(found.some((row) => row.name === "Bench Press"));
  assertTierOrder(found);
});

test("search matches names, muscles, and equipment words", () => {
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

  const barbell = rows(app.bankListHTML({ q: "barbell", action: "pick" }));
  assert.ok(barbell.some((row) => row.name === "Barbell Curl" && row.tier === 0));
  assert.doesNotMatch(app.bankListHTML({ q: "machine", action: "pick" }), /Search for the movement/);
});

test("cable and smith rank name prefix ahead of a later word, alphabetically inside the tier", () => {
  assert.equal(app.bankMatchTier("cable", { name: "Seated Cable Row" }), 1);
  assert.equal(app.bankMatchTier("smith", { name: "Smith Machine Squat" }), 0);
  assert.equal(app.foldSearch("  CaBle!! "), "cable");
  assert.equal(app.foldSearch("smith-machine"), "smith machine");

  const cable = rows(app.bankListHTML({ q: "  CaBle!! ", action: "pick" }));
  assert.ok(cable.some((row) => row.name === "Cable Crunch" && row.tier === 0));
  assert.ok(cable.some((row) => row.name === "One-Handed Cable Row" && row.tier === 1));
  assert.ok(cable.findIndex((row) => row.name === "Cable Crunch") < cable.findIndex((row) => row.name === "One-Handed Cable Row"));
  assertTierOrder(cable);
  const cableTier0 = cable.filter((row) => row.tier === 0).map((row) => row.name);
  assert.deepEqual(cableTier0, [...cableTier0].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));

  const smith = rows(app.bankListHTML({ q: "SMITH", action: "pick" }));
  assert.ok(smith.some((row) => row.name === "Smith Machine Squat" && row.tier === 0));
  assert.ok(smith.some((row) => row.name === "Seated Smith Machine Shoulder Press" && row.tier === 1));
  assert.ok(smith.findIndex((row) => row.name === "Smith Machine Squat") < smith.findIndex((row) => row.name === "Seated Smith Machine Shoulder Press"));
  assertTierOrder(smith);

  const phrase = rows(app.bankListHTML({ q: "smith-machine", action: "pick" }));
  assert.ok(phrase.some((row) => row.name === "Smith Machine Squat" && row.tier === 0));
  const spaced = rows(app.bankListHTML({ q: "  cable   row  ", action: "pick" }));
  assert.ok(spaced.some((row) => row.name === "One-Handed Cable Row" && row.tier === 1));
});

test("a typo such as cabel still lists cable exercises in the fuzzy tier", () => {
  assert.equal(app.bankMatchTier("cabel", { name: "Seated Cable Row" }), 3);
  const html = app.bankListHTML({ q: "cabel", action: "pick" });
  const found = rows(html);
  assert.ok(found.some((row) => row.name === "Cable Crunch" && row.tier === 3));
  assert.ok(found.some((row) => row.name === "One-Handed Cable Row" && row.tier === 3));
  assert.ok(found.every((row) => row.tier === 3));
  assertTierOrder(found);
  assert.match(html, /data-filter="1"/);
  assert.doesNotMatch(html, /No exercises match/);
  assert.doesNotMatch(html, /Search for the movement/);
});

test("aliases, equipment, and muscles match when the row has them", () => {
  assert.equal(app.bankMatchTier("face pull", { name: "Rear Delt Pull", aliases: ["Face Pull"] }), 0);
  assert.equal(app.bankMatchTier("cable", { name: "Seated Row", equipment: "Cable" }), 2);
  assert.equal(app.bankMatchTier("lats", { name: "Straight-Arm Pulldown", muscles: ["lats"] }), 2);
  assert.equal(app.bankMatchTier("upper chest", { name: "Press", muscles: ["pecs"], adv: ["pecUpper"] }), 2);
});

test("movement words that sit near equipment names still find the exercise", () => {
  const bend = app.bankListHTML({ q: "bend", action: "pick" });
  assert.match(bend, /data-name="Dumbbell Side Bend"/);
  assert.doesNotMatch(bend, /Search for the movement/);
  const banded = app.bankListHTML({ q: "banded", action: "pick" });
  assert.match(banded, /data-name="Banded Hip March"/);
  assert.doesNotMatch(banded, /Search for the movement/);
});

test("a misspelled equipment word still finds the exercise", () => {
  const html = app.bankListHTML({ q: "dumbell bensh", action: "pick" });
  assert.match(html, /data-name="Close-Grip Dumbbell Bench Press"/);
  assert.doesNotMatch(html, /No exercises match/);
  assert.doesNotMatch(html, /bank-create/);
  const kettle = app.bankListHTML({ q: "kettelbell curl", action: "pick" });
  assert.match(kettle, /data-name="Kettlebell Curl"/);
});

test("an empty search result offers to create the typed name", () => {
  const html = app.bankListHTML({ q: "zzzznot", action: "pick" });
  assert.match(html, /No exercises match/);
  assert.match(html, /data-action="bank-create" data-name="zzzznot"/);
  assert.match(html, /Create zzzznot/);
  assert.doesNotMatch(html, /data-src="bank"/);
  assert.doesNotMatch(html, /pk-list/);
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
