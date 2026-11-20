import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* Synthetic day-view polish. Names are Example Compound A and similar.
   The dose counter is a count of logged doses out of doses due today.
   It never sums amounts. */

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
globalThis.document = {
  addEventListener() {},
  removeEventListener() {},
  documentElement: { dataset: {}, classList: { add() {}, remove() {} } },
  body: el(),
  head: el(),
  querySelector: () => el(),
  querySelectorAll: () => [],
  getElementById: () => el(),
  createElement: () => el(),
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { app } = await import("../logger/js/runtime.js");
const {
  addRoutineItem,
  dailyRoutinesHTML,
  lastDoseLabel,
  logRoutineItem,
  logRoutineRest,
  routineDayComplete,
  routineDoseProgress,
  routineNextItem,
  skipRoutineItem,
  toggleRoutineCollapsed,
} = await import("../logger/js/pages/daily-routines.js");
const { putDailyRoutines, upsertEntity } = await import("../logger/js/shared/daily-routines-store.js");

const css = readFileSync(new URL("../logger/css/routines.css", import.meta.url), "utf8");

function pin(day, hour, minute) {
  app.today = () => day;
  app.routineNow = () => new Date(2026, 10, Number(day.slice(8, 10)), hour, minute, 0);
}

function signIn(day = "2026-11-19", hour = 8, minute = 30) {
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.sb = null;
  app.cloudPullOk = true;
  app.state = { dailyRoutines: null };
  app.ui = { sheet: null, sd: {}, dailyRoutineEdit: false };
  app.save = () => {};
  pin(day, hour, minute);
  dailyRoutinesHTML();
}

function blockId(name) {
  const block = app.state.dailyRoutines.blocks.find((row) => row.name === name);
  assert.ok(block, name);
  return block.id;
}

function itemNamed(name) {
  const item = app.state.dailyRoutines.items.find((row) => row.name === name);
  assert.ok(item, name);
  return item;
}

function countText(html) {
  const match = html.match(/<p class="dr-count"[\s\S]*?<\/p>/);
  assert.ok(match, "dose counter");
  return match[0];
}

describe("routine day view", { concurrency: false }, () => {
  test("the counter reads logged of due and does not sum amounts", () => {
    signIn();
    const morning = blockId("Morning routine");
    const amounts = [250, 250, 0.25, 100, 100, 100, 100];
    amounts.forEach((amount, index) => {
      assert.equal(addRoutineItem(app.state, morning, {
        name: `Example Compound ${index}`,
        kind: "dose",
        amount,
        unit: "mcg",
      }), true);
    });
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Check", kind: "check" }), true);
    const doses = amounts.map((_, index) => itemNamed(`Example Compound ${index}`));
    assert.equal(logRoutineItem(app.state, doses[0].id), true);
    assert.equal(logRoutineItem(app.state, doses[1].id), true);
    assert.equal(logRoutineItem(app.state, doses[2].id), true);
    assert.equal(skipRoutineItem(app.state, doses[3].id), true);
    const progress = routineDoseProgress(app.state.dailyRoutines, "2026-11-19");
    assert.deepEqual(progress, { logged: 3, due: 7 });
    assert.notEqual(progress.logged, 250 + 250 + 0.25);
    const counter = countText(dailyRoutinesHTML());
    assert.match(counter, /data-logged="3"/);
    assert.match(counter, /data-due="7"/);
    assert.match(counter, /<b>3<\/b> of 7 today/);
    assert.doesNotMatch(counter, /250|0\.25|1000|mcg/);
    assert.equal(routineDayComplete(app.state.dailyRoutines, "2026-11-19"), false);
    for (const dose of doses) {
      const log = app.state.dailyRoutines.logs.find((row) => row.itemId === dose.id && !(row.deletedAt > 0));
      if (!log) assert.equal(logRoutineItem(app.state, dose.id), true);
    }
    assert.equal(logRoutineItem(app.state, itemNamed("Example Check").id), true);
    assert.equal(routineDayComplete(app.state.dailyRoutines, "2026-11-19"), false);
    const skipped = app.state.dailyRoutines.logs.find((row) => row.status === "skipped");
    assert.equal(skipped.status, "skipped");
  });

  test("a finished day shows one all-done card and collapses the blocks", () => {
    signIn();
    const morning = blockId("Morning routine");
    const night = blockId("Night routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    assert.equal(addRoutineItem(app.state, night, { name: "Example Check", kind: "check" }), true);
    assert.equal(logRoutineItem(app.state, itemNamed("Example Compound A").id), true);
    let html = dailyRoutinesHTML();
    assert.equal(routineDayComplete(app.state.dailyRoutines, "2026-11-19"), false);
    assert.doesNotMatch(html, /data-all-done="true"/);
    assert.match(html, /<b>1<\/b> of 1 today/);
    assert.equal(logRoutineItem(app.state, itemNamed("Example Check").id), true);
    html = dailyRoutinesHTML();
    assert.match(html, /data-all-done="true"/);
    assert.match(html, /All done today ✓/);
    assert.match(html, /dr-all-done-mark/);
    assert.doesNotMatch(html, /Next: /);
    assert.doesNotMatch(html, /data-action="routines-log"/);
    assert.equal(html.match(/data-collapsed="true"/g).length, 3);
    assert.equal(toggleRoutineCollapsed(app.state, morning), true);
    const prefs = app.state.dailyRoutines.prefs;
    assert.deepEqual(prefs.allDoneOpen, { day: "2026-11-19", ids: [morning] });
    assert.ok(!Array.isArray(prefs.collapsedBlocks) || !prefs.collapsedBlocks.includes(morning));
    html = dailyRoutinesHTML();
    assert.match(html, new RegExp(`data-block-id="${morning}" data-current="[^"]+" data-collapsed="false"`));
    assert.match(html, new RegExp(`data-block-id="${night}" data-current="[^"]+" data-collapsed="true"`));
    app.ui.dailyRoutineEdit = true;
    html = dailyRoutinesHTML();
    assert.match(html, /data-routines-edit="on"/);
    assert.match(html, /class="dr-edit-name"/);
    assert.equal(html.match(/data-collapsed="false"/g).length, 3);
    app.ui.dailyRoutineEdit = false;
    pin("2026-11-20", 8, 30);
    html = dailyRoutinesHTML();
    assert.doesNotMatch(html, /data-all-done="true"/);
    assert.match(html, new RegExp(`data-block-id="${morning}" data-current="[^"]+" data-collapsed="false"`));
  });

  test("now/next names the next item and its countdown", () => {
    signIn("2026-11-19", 8, 30);
    const morning = blockId("Morning routine");
    const night = blockId("Night routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    assert.equal(addRoutineItem(app.state, night, { name: "Example Compound B", kind: "dose", amount: 1, unit: "mg" }), true);
    const html = dailyRoutinesHTML();
    assert.match(html, /Next: Example Compound B<span class="dr-wait">in 8 hr 30 min<\/span>/);
    assert.doesNotMatch(html, /Next · Night routine/);
    const next = routineNextItem(app.state.dailyRoutines, new Date(2026, 10, 19, 8, 30, 0), "2026-11-19");
    assert.equal(next.item.name, "Example Compound B");
    assert.equal(next.overdue, false);
    assert.equal(next.waitMin, 510);
    pin("2026-11-19", 4, 0);
    const early = dailyRoutinesHTML();
    assert.match(early, /Next: Example Compound A<span class="dr-wait">in 1 hr<\/span>/);
  });

  test("an overdue row shows the word and an icon, and a renamed block does not", () => {
    signIn("2026-11-19", 4, 0);
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    const item = itemNamed("Example Compound A");
    const at = new Date(2026, 10, 18, 8, 2, 0).getTime();
    const stored = upsertEntity(app.state.dailyRoutines, "logs", {
      id: "log-yesterday",
      itemId: item.id,
      compoundId: item.compoundId,
      day: "2026-11-18",
      status: "done",
      amount: 250,
      unit: "mcg",
      at,
      deletedAt: null,
    }, 30);
    assert.equal(putDailyRoutines(app.state, stored), true);
    let html = dailyRoutinesHTML();
    assert.doesNotMatch(html, /data-overdue/);
    assert.match(html, /Next dose in 1 hr/);
    assert.doesNotMatch(html, /last: 8:02 AM/);
    assert.equal(lastDoseLabel(app.state.dailyRoutines.logs.find((row) => row.id === "log-yesterday")), "last: 8:02 AM");

    pin("2026-11-19", 8, 30);
    html = dailyRoutinesHTML();
    assert.match(html, /data-overdue="true"/);
    assert.match(html, /<svg class="dr-overdue-icon"/);
    assert.match(html, /<span class="dr-overdue-text">overdue<\/span>/);
    assert.match(html, /last: 8:02 AM/);
    assert.doesNotMatch(html, /Next dose/);
    assert.match(html, /Next: Example Compound A<span class="dr-wait">overdue<\/span>/);
    assert.match(css, /\.dr-overdue \{[^}]*background:\s*#f6c56b/);
    assert.match(css, /\.dr-overdue-icon/);
    const overdueAt = html.indexOf('data-overdue="true"');
    const row = html.slice(overdueAt, overdueAt + 800);
    assert.match(row, /dr-overdue-text">overdue</);
    assert.match(row, /dr-overdue-icon/);

    assert.equal(app.renameRoutineBlock(app.state, morning, "Custom block"), true);
    html = dailyRoutinesHTML();
    assert.doesNotMatch(html, /data-overdue/);
    assert.doesNotMatch(html, /Next dose/);
    assert.match(html, /Next: Example Compound A<\/p>/);
    assert.match(html, /last: 8:02 AM/);
  });

  test("a taken row shows last time instead of the next countdown", () => {
    signIn("2026-11-19", 4, 0);
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    assert.equal(logRoutineItem(app.state, itemNamed("Example Compound A").id), true);
    assert.equal(toggleRoutineCollapsed(app.state, morning), true);
    const { toggleRoutineReveal } = app;
    assert.equal(toggleRoutineReveal(app.state, morning), true);
    const html = dailyRoutinesHTML();
    assert.match(html, /last: 4:00 AM/);
    assert.match(html, /data-state="done"/);
    assert.doesNotMatch(html, /Next dose in 25 hr/);
    assert.doesNotMatch(html, /data-next-dose=/);
  });

  test("rows wrap to two lines and the amount is not clipped", () => {
    signIn("2026-11-19", 4, 0);
    const morning = blockId("Morning routine");
    const name = "Example Compound With A Very Long Synthetic Label";
    assert.equal(addRoutineItem(app.state, morning, { name, kind: "dose", amount: 0.25, unit: "mcg" }), true);
    const html = dailyRoutinesHTML();
    assert.match(html, new RegExp(`${name}</span><span class="dr-dose"> · 0\\.25 mcg</span>`));
    assert.match(css, /\.dr-line \{[^}]*flex-wrap:\s*wrap/);
    assert.match(css, /\.dr-name \{[^}]*overflow-wrap:\s*anywhere/);
    assert.match(css, /\.dr-name \{[^}]*white-space:\s*normal/);
    assert.match(css, /\.dr-dose \{[^}]*white-space:\s*nowrap/);
    assert.match(css, /\.dr-dose \{[^}]*flex-shrink:\s*0/);
    assert.doesNotMatch(css, /\.dr-dose[^{]*\{[^}]*text-overflow:\s*ellipsis/);
    assert.doesNotMatch(css, /\.dr-name[^{]*\{[^}]*text-overflow:\s*ellipsis/);
    assert.doesNotMatch(css, /\.dr-dose[^{]*\{[^}]*line-clamp/);
    assert.doesNotMatch(css, /\.dr-name[^{]*\{[^}]*line-clamp/);
  });

  test("collapse and the all-done card respect Reduce Motion", () => {
    const prefer = css.indexOf("@media (prefers-reduced-motion: no-preference)");
    const reduce = css.indexOf("@media (prefers-reduced-motion: reduce)");
    assert.ok(prefer >= 0 && reduce > prefer);
    const motion = css.slice(prefer, reduce);
    const quiet = css.slice(reduce);
    assert.match(motion, /@keyframes dr-all-done-in/);
    assert.match(motion, /\.dr-chevron \{ transition:/);
    assert.match(quiet, /\.dr-all-done/);
    assert.match(quiet, /\.dr-chevron/);
    assert.match(quiet, /animation:\s*none/);
    assert.match(quiet, /transition:\s*none/);
    assert.doesNotMatch(quiet, /@keyframes/);
  });

  test("rest does not finish the day or count as a logged dose", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    assert.equal(logRoutineRest(app.state), true);
    const html = dailyRoutinesHTML();
    assert.equal(routineDayComplete(app.state.dailyRoutines, "2026-11-19"), false);
    assert.doesNotMatch(html, /data-all-done="true"/);
    assert.match(countText(html), /<b>0<\/b> of 1 today/);
    assert.match(html, /data-action="routines-log"/);
    assert.match(html, /data-overdue="true"/);
    assert.doesNotMatch(html, /last:/);
  });

  test("the flag stays off and this page does not import it", () => {
    const flag = readFileSync(new URL("../logger/js/shared/routines-flag.js", import.meta.url), "utf8");
    const page = readFileSync(new URL("../logger/js/pages/daily-routines.js", import.meta.url), "utf8");
    assert.match(flag, /ROUTINES_ENABLED = false/);
    assert.doesNotMatch(page, /routines-flag/);
  });
});
