import assert from "node:assert/strict";
import test from "node:test";

/* state.js reads localStorage as it loads. actions.js binds #importFile at load. */
const store = {};
globalThis.localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
globalThis.window = globalThis;
globalThis.document = {
  addEventListener() {},
  documentElement: { dataset: {} },
  querySelector: () => ({ addEventListener() {} }),
};

const { app } = await import("../logger/js/runtime.js");
const { sanitizeSetInput, setFieldAllowsKey, setNumberField } = await import("../logger/js/pages/session.js");
await import("../logger/js/data/state.js");
await import("../logger/js/shell/actions.js");

app.wUnit = () => "lb";
app.wStep = () => 5;
app.suggestion = () => ({ w: 999, r: 1 });

function benchSession(extra) {
  return {
    id: extra.id,
    date: extra.date,
    startedAt: extra.startedAt || extra.date + "T12:00:00",
    finishedAt: extra.finishedAt,
    workoutId: "push",
    name: "Push",
    entries: extra.entries || [],
  };
}

function arm(sessions) {
  app.ui.drafts = {};
  app.state.workouts = [{ id: "push", name: "Push", exercises: [{ name: "Bench Press", muscles: ["chest"] }] }];
  app.state.sessions = sessions;
}

function snap() { return JSON.stringify(app.state.sessions); }

test("spaces and other non-digits are dropped, and a decimal in progress is kept", () => {
  assert.equal(sanitizeSetInput("w", "1 3 5"), "135");
  assert.equal(sanitizeSetInput("w", "135 lb"), "135");
  assert.equal(sanitizeSetInput("w", "135.5"), "135.5");
  assert.equal(sanitizeSetInput("w", "135."), "135.");
  assert.equal(sanitizeSetInput("w", "1.2.3"), "1.23");
  assert.equal(sanitizeSetInput("w", "1,5"), "1.5");
  assert.equal(sanitizeSetInput("w", "  "), "");
  assert.equal(sanitizeSetInput("r", "8 reps"), "8");
  assert.equal(sanitizeSetInput("r", " 12 "), "12");
  assert.equal(sanitizeSetInput("r", "8.5"), "85");
  assert.equal(sanitizeSetInput("rR", "a 3"), "3");
});

test("a space is blocked and digits still type, including a decimal on weight only", () => {
  for (const field of ["w", "r", "wR", "rR"]) {
    assert.equal(setFieldAllowsKey(field, " "), false, field);
    assert.equal(setFieldAllowsKey(field, "a"), false, field);
    assert.equal(setFieldAllowsKey(field, "5"), true, field);
    assert.equal(setFieldAllowsKey(field, "Backspace"), true, field);
  }
  assert.equal(setFieldAllowsKey("w", "."), true);
  assert.equal(setFieldAllowsKey("w", ","), true);
  assert.equal(setFieldAllowsKey("r", "."), false);
  assert.equal(setNumberField({ id: "se-w", dataset: {} }), "w");
  assert.equal(setNumberField({ id: "se-rR", dataset: {} }), "rR");
  assert.equal(setNumberField({ dataset: { field: "note", i: "0" } }), "");
});

test("typing strips the space in place, keeps the caret, and does not re-render", () => {
  const cur = benchSession({ id: "now", date: "2026-10-07", entries: [] });
  arm([cur]);
  const before = snap();
  let renders = 0;
  app.render = () => { renders++; };
  app.renderWorkout = () => { renders++; };
  app.renderSheet = () => { renders++; };
  app.save = () => { renders++; };
  const el = {
    id: "w-0",
    value: "12 3",
    selectionStart: 3,
    dataset: { field: "w", i: "0" },
    scrollLeft: 8,
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; },
  };
  assert.equal(app.commitSetField(el), true);
  assert.equal(el.value, "123");
  assert.equal(el.selectionStart, 2);
  assert.equal(el.scrollLeft, 0);
  assert.equal(app.ui.drafts["Bench Press"].w, "123");
  assert.equal(renders, 0);
  assert.equal(snap(), before);

  const space = { key: " ", target: el, ctrlKey: false, metaKey: false, altKey: false, preventDefault() { this.blocked = true; } };
  assert.equal(app.guardSetFieldKey(space), true);
  assert.equal(space.blocked, true);
  const digit = { key: "4", target: el, preventDefault() { this.blocked = true; } };
  assert.equal(app.guardSetFieldKey(digit), false);
  assert.equal(digit.blocked, undefined);

  const beforeIn = { inputType: "insertText", data: " ", target: { id: "se-r", dataset: {}, value: "8" }, preventDefault() { this.blocked = true; } };
  assert.equal(app.guardSetFieldBeforeInput(beforeIn), true);
  assert.equal(beforeIn.blocked, true);
  assert.equal(beforeIn.target.value, "8");

  const note = { value: "felt good", dataset: { field: "note", i: "0" }, setSelectionRange() { throw new Error("note should not move"); } };
  assert.equal(app.commitSetField(note), false);
  assert.equal(note.value, "felt good");
  assert.equal(renders, 0);
});

test("Log Set still saves a set when the restored draft has no note", () => {
  const cur = benchSession({ id: "now", date: "2026-10-07", finishedAt: null, entries: [] });
  arm([cur]);
  // A shell-update reload keeps typed weight and reps and drops a blank note.
  app.ui.drafts["Bench Press"] = { w: "100", r: "8" };
  assert.equal(app.draftFor(cur, "Bench Press").note, "");
  const prev = {
    toast: app.toast, prsFor: app.prsFor, logsStartRest: app.logsStartRest,
    renderWorkout: app.renderWorkout, tick: app.tick, celebrate: app.celebrate, save: app.save,
  };
  app.toast = () => {};
  app.prsFor = () => [];
  app.logsStartRest = () => false;
  app.renderWorkout = () => {};
  app.tick = () => {};
  app.celebrate = () => {};
  app.save = () => {};
  try {
    app.logSet(0);
    assert.equal(cur.entries.length, 1);
    assert.equal(cur.entries[0].sets.length, 1);
    assert.equal(cur.entries[0].sets[0].w, 100);
    assert.equal(cur.entries[0].sets[0].r, 8);
    assert.equal(cur.entries[0].sets[0].note, undefined);
    assert.equal(app.ui.drafts["Bench Press"], undefined);
  } finally {
    Object.assign(app, prev);
  }
});

test("a new set starts empty and the last logged value is only a placeholder", () => {
  const older = benchSession({
    id: "old", date: "2025-12-01", finishedAt: "2025-12-01T13:00:00",
    entries: [{ exercise: "Bench Press", sets: [{ w: 95, r: 5 }] }],
  });
  const newer = benchSession({
    id: "mid", date: "2026-09-01", finishedAt: "2026-09-01T13:00:00",
    entries: [{ exercise: "Bench Press", sets: [{ w: 45, r: 10, tag: "warmup" }, { w: 135, r: 5 }, { w: 125, r: 6 }] }],
  });
  const cur = benchSession({ id: "now", date: "2026-10-07", entries: [] });
  arm([older, newer, cur]);
  const before = snap();

  const d = app.draftFor(cur, "Bench Press");
  assert.deepEqual({ w: d.w, r: d.r, wR: d.wR, rR: d.rR }, { w: "", r: "", wR: "", rR: "" });
  const hint = app.setFieldHints(cur, "Bench Press");
  assert.deepEqual(hint, { w: "125", r: "6", wR: "125", rR: "6" });
  assert.notEqual(hint.w, "999");
  const html = app.stepPair(0, d, "w", "r", false, hint);
  assert.match(html, /id="w-0"[^>]*value=""/);
  assert.match(html, /id="r-0"[^>]*value=""/);
  assert.match(html, /id="w-0"[^>]*placeholder="125"/);
  assert.match(html, /id="r-0"[^>]*placeholder="6"/);
  assert.match(html, /id="w-0"[^>]*inputmode="decimal"/);
  assert.match(html, /id="r-0"[^>]*inputmode="numeric"/);
  assert.match(html, /id="r-0"[^>]*pattern="\[0-9\]\*"/);
  assert.match(html, /autocorrect="off"/);
  assert.match(html, /type="text"/);
  assert.doesNotMatch(html, /value="125"/);
  assert.doesNotMatch(html, /value="999"/);
  assert.equal(snap(), before);

  cur.entries = [{ exercise: "Bench Press", sets: [{ w: 140, r: 5 }] }];
  app.ui.drafts = {};
  const again = app.draftFor(cur, "Bench Press");
  assert.equal(again.w, "");
  assert.equal(again.r, "");
  assert.deepEqual(app.setFieldHints(cur, "Bench Press"), { w: "140", r: "5", wR: "140", rR: "5" });
  assert.equal(newer.entries[0].sets[2].w, 125);
});

test("unilateral placeholders use each side, and a first-ever set stays blank", () => {
  const prev = benchSession({
    id: "mid", date: "2026-09-01", finishedAt: "2026-09-01T13:00:00",
    entries: [{ exercise: "Bench Press", sets: [{ w: 50, r: 12, uni: { l: { w: 40, r: 8 }, r: { w: 50, r: 12 } } }] }],
  });
  const cur = benchSession({ id: "now", date: "2026-10-07", entries: [] });
  arm([prev, cur]);
  const hint = app.setFieldHints(cur, "Bench Press");
  assert.deepEqual(hint, { w: "40", r: "8", wR: "50", rR: "12" });
  const html = app.stepPair(0, { w: "", r: "" }, "wR", "rR", false, hint);
  assert.match(html, /placeholder="50"/);
  assert.match(html, /placeholder="12"/);
  assert.match(html, /value=""/);

  assert.equal(app.setFieldHints(cur, "Brand New"), null);
  const fresh = app.stepPair(1, { w: "", r: "" }, "w", "r", true, null);
  assert.match(fresh, /placeholder="BW"/);
  assert.match(fresh, /placeholder="0"/);
  assert.match(fresh, /value=""/);
});

test("a double tap on Log Set logs one set, and a later tap logs the next", () => {
  const cur = benchSession({ id: "double-tap", date: "2026-10-07", finishedAt: null, entries: [] });
  arm([cur]);
  const prev = {
    toast: app.toast, prsFor: app.prsFor, logsStartRest: app.logsStartRest,
    renderWorkout: app.renderWorkout, tick: app.tick, celebrate: app.celebrate, save: app.save,
  };
  const toasts = [];
  app.toast = (m) => toasts.push(m);
  app.prsFor = () => [];
  app.logsStartRest = () => false;
  app.renderWorkout = () => {};
  app.tick = () => {};
  app.celebrate = () => {};
  app.save = () => {};
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    app.ui.drafts["Bench Press"] = { w: "100", r: "8" };
    app.logSet(0);
    app.ui.drafts["Bench Press"] = { w: "100", r: "8" };
    now += 200;
    app.logSet(0);
    assert.equal(cur.entries[0].sets.length, 1, "the second tap is the same tap");
    assert.deepEqual(toasts, [], "no error toast after a successful log");
    now += 1000;
    app.logSet(0);
    assert.equal(cur.entries[0].sets.length, 2, "a deliberate next tap logs the next set");
  } finally {
    Date.now = realNow;
    Object.assign(app, prev);
  }
});
