import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* Synthetic accounts only. The setup answers are keys from a fixed list, so
   no free text is stored. Every test starts from a fresh signed-in store. */

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
const { addRoutineItem, dailyRoutinesHTML, renameRoutineBlock, routinesSettingsSheetHTML, deleteRoutineBlock } = await import("../logger/js/pages/daily-routines.js");
const { routineItemSheetHTML } = await import("../logger/js/pages/daily-routines-edit.js");
const setupUi = await import("../logger/js/pages/daily-routines-setup.js");
const {
  applySetup,
  askedQuestions,
  normalizeSetupAnswers,
  readSetup,
  routineSetupShows,
  setupBlocks,
  setupChoices,
  setupShape,
} = await import("../logger/js/shared/routine-setup.js");
const { isLive, liveOf, mergeDailyRoutines, seedDefaultBlocks } = await import("../logger/js/shared/daily-routines-store.js");

function pin(hour = 8) {
  app.today = () => "2026-11-22";
  app.routineNow = () => new Date(2026, 10, 22, hour, 15, 0);
}

function signIn(hour = 8) {
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.sb = null;
  app.cloudPullOk = true;
  app.state = { dailyRoutines: null };
  app.ui = { sheet: null, sd: {}, dailyRoutineEdit: false, tab: "daily-routines" };
  app.save = () => {};
  app.render = () => {};
  app.renderSheet = () => {};
  app.$ = () => null;
  pin(hour);
  dailyRoutinesHTML();
}

function liveNames() {
  return liveOf(app.state.dailyRoutines.blocks).sort((a, b) => a.order - b.order).map((block) => block.name);
}

/* Answers the sheet the way a person would, one tap per question. */
function answer(picks) {
  for (const [id, value] of picks) {
    assert.equal(app.ui.routineSetupDraft.step, id, `expected ${id}`);
    if (Array.isArray(value)) {
      for (const one of value) assert.ok(setupUi.pickRoutineSetup(id, one));
      assert.ok(setupUi.nextRoutineSetup());
    } else {
      assert.ok(setupUi.pickRoutineSetup(id, value));
    }
  }
}

const SUPPLEMENTS_ONLY = [
  ["goals", ["supplements"]],
  ["experience", "some"],
  ["days", "regular"],
  ["wake", "6-8"],
  ["sleep", "10-12"],
  ["train", "3-4"],
  ["track", ["supplements"]],
  ["enhancers", "no"],
  ["count", "4-8"],
  ["supply", "no"],
  ["timing", ["waking", "meals"]],
  ["watch", ["sleep"]],
  ["home", "next"],
  ["feel", "all"],
];

describe("which questions are asked", () => {
  test("just looking asks only the two clock questions", () => {
    assert.deepEqual(askedQuestions({ goals: ["looking"] }), ["goals", "wake", "sleep"]);
  });

  test("enhancers in the first answer skips the enhancers question and asks about injecting", () => {
    const list = askedQuestions({ goals: ["enhancers"] });
    assert.ok(!list.includes("enhancers"));
    assert.ok(list.includes("inject"));
    assert.ok(list.includes("count"));
  });

  test("habits only skips the taking questions", () => {
    const list = askedQuestions({ goals: ["habits"], track: ["habits"], enhancers: "no" });
    for (const id of ["inject", "count", "supply", "timing"]) assert.ok(!list.includes(id), id);
  });

  test("recover better brings results and Home forward", () => {
    const list = askedQuestions({ goals: ["recover"] });
    assert.deepEqual(list.slice(0, 3), ["goals", "watch", "home"]);
    assert.equal(list.at(-1), "feel");
  });

  test("around workouts is not offered without a training day", () => {
    assert.ok(!setupChoices("timing", { train: "none" }).some((choice) => choice.value === "workouts"));
    assert.ok(setupChoices("timing", { train: "3-4" }).some((choice) => choice.value === "workouts"));
  });

  test("unknown keys and values are dropped and exclusive picks stand alone", () => {
    assert.deepEqual(normalizeSetupAnswers({ goals: ["habits", "looking"], feel: "loud", note: "free text" }), { goals: ["looking"] });
  });
});

describe("what the answers show", () => {
  test("no setup shows every part, as before", () => {
    const shape = setupShape({});
    for (const key of ["doses", "calculator", "injection", "supply", "rest"]) assert.equal(shape[key], true, key);
    assert.equal(shape.tips, false);
  });

  test("supplements only hides the enhancer tools and the word enhancers", () => {
    const answers = Object.fromEntries(SUPPLEMENTS_ONLY);
    const prefs = { setup: { status: "done", answers } };
    assert.equal(routineSetupShows(prefs, "calculator"), false);
    assert.equal(routineSetupShows(prefs, "injection"), false);
    assert.equal(routineSetupShows(prefs, "supply"), false);
    assert.equal(routineSetupShows(prefs, "doses"), true);
    const names = setupBlocks(answers).map((block) => block.name);
    assert.ok(names.every((name) => !/enhancer/i.test(name)), names.join());
    assert.deepEqual(names, ["Supplements"]);
  });

  test("enhancers yes adds the section with its tools, and no injecting hides only the injection tools", () => {
    const yes = { goals: ["supplements"], track: ["supplements"], enhancers: "yes", inject: "yes" };
    assert.ok(setupBlocks(yes).some((block) => block.name === "Enhancers & peptides"));
    for (const key of ["calculator", "injection", "supply", "doses"]) assert.equal(routineSetupShows({ setup: { status: "done", answers: yes } }, key), true, key);
    const noInject = { ...yes, inject: "no" };
    const prefs = { setup: { status: "done", answers: noInject } };
    assert.equal(routineSetupShows(prefs, "calculator"), false);
    assert.equal(routineSetupShows(prefs, "supply"), true);
    assert.equal(routineSetupShows(prefs, "doses"), true);
  });

  test("new to it shows tips and leaves Focus mode alone", () => {
    const store = seedDefaultBlocks(null, 10);
    const next = applySetup(store, { status: "done", answers: { goals: ["habits"], experience: "new", track: ["habits"], enhancers: "no" }, at: 100 });
    assert.equal(routineSetupShows(next.prefs, "tips"), true);
    assert.equal(next.prefs.focusMode, undefined);
  });

  test("only just what's next turns Focus mode on", () => {
    const store = seedDefaultBlocks(null, 10);
    assert.equal(applySetup(store, { status: "done", answers: { feel: "next" }, at: 100 }).prefs.focusMode, true);
    assert.equal(applySetup(store, { status: "done", answers: { feel: "all" }, at: 100 }).prefs.focusMode, false);
  });

  test("no training day hides the rest-day button", () => {
    assert.equal(routineSetupShows({ setup: { status: "done", answers: { train: "none" } } }, "rest"), false);
    assert.equal(routineSetupShows({ setup: { status: "done", answers: { train: "1-2" } } }, "rest"), true);
  });

  test("there is never a Workout block", () => {
    const answers = { goals: ["habits", "supplements", "enhancers", "meds"], train: "5+", track: ["supplements", "meds", "habits"], timing: ["workouts"] };
    assert.ok(setupBlocks(answers).every((block) => !/workout/i.test(block.name)));
  });

  test("night shifts rename the habit blocks", () => {
    const names = setupBlocks({ goals: ["habits"], days: "night" }).map((block) => block.name);
    assert.deepEqual(names, ["Wake-up routine", "Wind-down routine"]);
  });

  test("a few supplements and medications share one block", () => {
    const names = setupBlocks({ goals: ["supplements", "meds"], track: ["supplements", "meds"], count: "1-3" }).map((block) => block.name);
    assert.deepEqual(names, ["Supplements & medications"]);
  });
});

describe("applying a setup", () => {
  test("a new account gets exactly the blocks its answers ask for", () => {
    signIn();
    assert.equal(app.ui.sheet, null, "painting the page alone opens nothing");
    assert.ok(setupUi.maybeOfferRoutineSetup());
    assert.equal(app.ui.sheet, "routines-setup");
    answer(SUPPLEMENTS_ONLY);
    assert.equal(app.ui.sheet, null);
    assert.deepEqual(liveNames(), ["Supplements"]);
    const store = app.state.dailyRoutines;
    assert.equal(readSetup(store.prefs).status, "done");
    assert.equal(store.prefs.focusMode, false);
    const starters = liveOf(store.items).map((item) => item.name).sort();
    assert.deepEqual(starters, ["On waking", "With meals"]);
    assert.ok(liveOf(store.placements).every((place) => place.blockId === "block_default_stack"));
    assert.equal(app.ui.routineAnnounce, "Your Routines page is set up.");
    assert.ok(!setupUi.maybeOfferRoutineSetup(), "a settled setup is not offered again");
  });

  test("a block the user already made their own is never renamed or removed", () => {
    signIn();
    const store = app.state.dailyRoutines;
    assert.ok(renameRoutineBlock(app.state, "block_default_stack", "Example stack"));
    assert.ok(addRoutineItem(app.state, "block_default_night", { name: "Example check", kind: "check" }));
    const next = applySetup(app.state.dailyRoutines, { status: "done", answers: { goals: ["habits"], track: ["habits"], enhancers: "no", days: "night" }, at: Date.now() + 10 });
    const names = new Map(liveOf(next.blocks).map((block) => [block.id, block.name]));
    assert.equal(names.get("block_default_stack"), "Example stack");
    assert.equal(names.get("block_default_night"), "Night routine", "a block with items keeps its name");
    assert.equal(names.get("block_default_morning"), "Wake-up routine", "an untouched block follows the answers");
    assert.ok(store.blocks.length <= next.blocks.length, "no row is dropped");
  });

  test("a deleted default block stays deleted and a fallback block is added once", () => {
    signIn();
    assert.ok(deleteRoutineBlock(app.state, "block_default_stack"));
    const answers = Object.fromEntries(SUPPLEMENTS_ONLY);
    const once = applySetup(app.state.dailyRoutines, { status: "done", answers, at: Date.now() + 10 });
    assert.equal(isLive(once.blocks.find((block) => block.id === "block_default_stack")), false);
    assert.ok(liveOf(once.blocks).some((block) => block.id === "block_setup_supplements" && block.name === "Supplements"));
    const twice = applySetup(once, { status: "done", answers, at: Date.now() + 20 });
    assert.equal(twice.blocks.filter((block) => block.id === "block_setup_supplements").length, 1);
  });

  test("two phones finishing the same answers write the same rows", () => {
    const base = seedDefaultBlocks(null, 10);
    const answers = { goals: ["supplements", "enhancers"], track: ["supplements"], inject: "yes", count: "4-8", supply: "yes", timing: ["waking", "bed"] };
    const left = applySetup(base, { status: "done", answers, at: 1000 });
    const right = applySetup(base, { status: "done", answers, at: 2000 });
    const merged = mergeDailyRoutines(left, right, 5000);
    const ids = (list) => liveOf(list).map((row) => row.id).sort();
    assert.deepEqual(ids(merged.blocks), ids(right.blocks));
    assert.deepEqual(ids(merged.items), ids(right.items));
    assert.deepEqual(ids(merged.placements), ids(right.placements));
    assert.equal(new Set(ids(merged.blocks)).size, ids(merged.blocks).length);
  });

  test("nine or more a day collapses every block except the current one", () => {
    const base = seedDefaultBlocks(null, 10);
    const answers = { goals: ["habits", "supplements", "meds"], track: ["supplements", "meds"], count: "9+" };
    const next = applySetup(base, { status: "done", answers, at: 100, keepOpen: () => "block_default_morning" });
    assert.ok(!next.prefs.collapsedBlocks.includes("block_default_morning"));
    assert.ok(next.prefs.collapsedBlocks.includes("block_default_stack"));
    assert.ok(next.prefs.collapsedBlocks.includes("block_setup_meds"));
  });

  test("skip setup settles it with the generic page and no word enhancers", () => {
    signIn();
    assert.ok(setupUi.maybeOfferRoutineSetup());
    assert.ok(setupUi.skipRoutineSetup());
    assert.equal(readSetup(app.state.dailyRoutines.prefs).status, "skipped");
    assert.deepEqual(liveNames(), ["Morning routine", "Supplements", "Night routine"]);
    assert.equal(routineSetupShows(app.state.dailyRoutines.prefs, "calculator"), true, "a skipped setup still shows every tool");
  });
});

describe("the setup sheet", () => {
  test("closing it saves nothing and leaves a card to finish later", () => {
    signIn();
    setupUi.maybeOfferRoutineSetup();
    setupUi.pickRoutineSetup("goals", "habits");
    setupUi.nextRoutineSetup();
    setupUi.closeRoutineSetup();
    assert.equal(app.ui.sheet, null);
    assert.equal(readSetup(app.state.dailyRoutines.prefs), null);
    assert.ok(!setupUi.maybeOfferRoutineSetup(), "it does not reopen on its own after a close");
    assert.match(dailyRoutinesHTML(), /Finish setting up Routines/);
    assert.ok(setupUi.openRoutineSetup("quiz"));
    assert.equal(app.ui.routineSetupDraft.step, "experience", "it picks up where it was left");
  });

  test("a neighbour pane painted during a swipe does not open it", () => {
    signIn();
    app.ui.tab = "home";
    dailyRoutinesHTML();
    assert.ok(!setupUi.maybeOfferRoutineSetup());
    assert.equal(app.ui.sheet, null);
  });

  test("it waits while the account is still syncing", () => {
    signIn();
    app.sb = {};
    app.cloudPullOk = false;
    assert.ok(!setupUi.maybeOfferRoutineSetup());
  });

  test("Back steps through asked questions and skip this question moves on", () => {
    signIn();
    setupUi.maybeOfferRoutineSetup();
    setupUi.pickRoutineSetup("goals", "looking");
    setupUi.nextRoutineSetup();
    assert.equal(app.ui.routineSetupDraft.step, "wake");
    assert.ok(setupUi.skipRoutineSetupQuestion());
    assert.equal(app.ui.routineSetupDraft.step, "sleep");
    assert.ok(setupUi.backRoutineSetup());
    assert.equal(app.ui.routineSetupDraft.step, "wake");
    assert.match(setupUi.routineSetupSheetHTML(), /Question 2 of 3/);
  });

  test("a picked answer that no longer applies is not saved", () => {
    assert.deepEqual(setupUi.pruneSetupAnswers({ goals: ["habits"], enhancers: "no", inject: "yes", train: "none", track: ["supplements"], timing: ["workouts", "bed"] }), {
      goals: ["habits"], train: "none", track: ["supplements"], enhancers: "no", timing: ["bed"],
    });
  });

  test("settings list each answer and changing one keeps the rest", () => {
    signIn();
    setupUi.maybeOfferRoutineSetup();
    answer(SUPPLEMENTS_ONLY);
    const settings = routinesSettingsSheetHTML();
    assert.match(settings, /Your setup/);
    assert.match(settings, /data-action="routines-setup-change" data-q="feel"/);
    assert.doesNotMatch(settings, /Reconstitution calculator/);
    assert.ok(setupUi.openRoutineSetup("edit", "feel"));
    assert.ok(setupUi.pickRoutineSetup("feel", "next"));
    assert.equal(app.ui.sheet, "routines-settings");
    const prefs = app.state.dailyRoutines.prefs;
    assert.equal(prefs.focusMode, true);
    assert.equal(readSetup(prefs).answers.train, "3-4");
    assert.deepEqual(liveNames(), ["Supplements"]);
  });
});

describe("the page follows the answers", () => {
  test("no injecting removes the calculator button and no training removes Log rest", () => {
    signIn();
    const before = dailyRoutinesHTML();
    assert.match(before, /data-action="routines-calc"/);
    assert.match(before, /data-action="routines-rest"/);
    app.state.dailyRoutines = applySetup(app.state.dailyRoutines, { status: "done", answers: { goals: ["habits"], train: "none", track: ["habits"], enhancers: "no" }, at: Date.now() + 10 });
    const after = dailyRoutinesHTML();
    assert.doesNotMatch(after, /data-action="routines-calc"/);
    assert.doesNotMatch(after, /data-action="routines-rest"/);
  });

  test("habits only hides the Dose type for a new item and tips can be hidden", () => {
    signIn();
    app.state.dailyRoutines = applySetup(app.state.dailyRoutines, { status: "done", answers: { goals: ["habits"], experience: "new", track: ["habits"], enhancers: "no" }, at: Date.now() + 10 });
    app.ui.sd = { kind: "check", blockIds: [] };
    assert.doesNotMatch(routineItemSheetHTML(), /data-kind="dose"/);
    assert.match(dailyRoutinesHTML(), /Getting started/);
    assert.ok(app.hideRoutineTips(app.state));
    assert.doesNotMatch(dailyRoutinesHTML(), /Getting started/);
  });

  test("the shell lists the new files and the close action keeps setup open", () => {
    const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
    const main = readFileSync(new URL("../logger/js/main.js", import.meta.url), "utf8");
    const actions = readFileSync(new URL("../logger/js/shell/actions.js", import.meta.url), "utf8");
    const pager = readFileSync(new URL("../logger/js/shell/pager.js", import.meta.url), "utf8");
    assert.match(sw, /"\.\/js\/pages\/daily-routines-setup\.js"/);
    assert.match(sw, /"\.\/js\/shared\/routine-setup\.js"/);
    assert.match(main, /import "\.\/pages\/daily-routines-setup\.js";/);
    assert.match(actions, /app\.ui\.sheet === "routines-setup" && typeof app\.closeRoutineSetup === "function"/);
    assert.match(pager, /app\.maybeOfferRoutineSetup\(\);\n  app\.renderSheet\(\);/);
  });
});
