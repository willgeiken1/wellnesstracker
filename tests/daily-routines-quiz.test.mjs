import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

/* Synthetic starter only. No personal stack, no skincare, no re-run. */

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
  dailyRoutinesHTML,
  deleteRoutineBlock,
  deleteRoutineItem,
  ensureRoutineShell,
  renameRoutineItem,
  restoreRoutineBlock,
  routinesSettingsSheetHTML,
} = await import("../logger/js/pages/daily-routines.js");
const {
  chooseRoutineQuiz,
  finishRoutineQuiz,
  maybeOfferRoutineQuiz,
  routineQuizSheetHTML,
  skipRoutineQuiz,
  toggleRoutineQuizBlock,
} = await import("../logger/js/pages/daily-routines-quiz.js");
const { GENERIC_STARTER_ITEMS, STARTER_BLOCKS } = await import("../logger/js/shared/routine-starter.js");
const {
  applyStoredQuizStartTimes,
  isLive,
  mergeDailyRoutines,
  normalizeDailyRoutines,
  seedDefaultBlocks,
} = await import("../logger/js/shared/daily-routines-store.js");

const BANNED = /skincare|peptide|sarm|steroid|retinoid|notification|showNotification|geiken|\bwill\b/i;
const RERUN = /re-?run|retake|take the quiz|set up again|quiz again/i;

function signIn() {
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.sb = null;
  app.cloudPullOk = true;
  app.state = { dailyRoutines: null };
  app.ui = { sheet: null, routineQuiz: null };
  app.today = () => "2026-11-19";
  app.routineNow = () => new Date(2026, 10, 19, 8, 30);
  app.save = () => {};
  app.render = () => {};
  app.renderSheet = () => {};
}

function liveNames(blockName) {
  const store = app.state.dailyRoutines;
  const block = store.blocks.find((row) => row.name === blockName && isLive(row));
  if (!block) return [];
  const items = new Map(store.items.filter(isLive).map((item) => [item.id, item]));
  return store.placements
    .filter((row) => isLive(row) && row.blockId === block.id && items.has(row.itemId))
    .sort((a, b) => a.order - b.order)
    .map((row) => items.get(row.itemId).name);
}

function starterNames(keys) {
  const wanted = new Set(keys);
  return GENERIC_STARTER_ITEMS.filter((row) => wanted.has(row.block)).map((row) => row.name);
}

function answer(tracks = "checks") {
  assert.equal(chooseRoutineQuiz("tracks", tracks), true);
  assert.equal(chooseRoutineQuiz("wake", "07:00"), true);
  assert.equal(chooseRoutineQuiz("bed", "23:00"), true);
}

describe("routine setup quiz", { concurrency: false }, () => {
  test("the starter is three blocks with one or two generic checks and no personal stack", () => {
    assert.deepEqual(STARTER_BLOCKS.map((block) => block.name), [
      "Morning routine",
      "Supplement & enhancer stack",
      "Night routine",
    ]);
    const counts = new Map();
    for (const row of GENERIC_STARTER_ITEMS) counts.set(row.block, (counts.get(row.block) || 0) + 1);
    assert.deepEqual([...counts.keys()], ["morning", "stack", "night"]);
    for (const count of counts.values()) {
      assert.ok(count >= 1 && count <= 2, String(count));
    }
    const starter = readFileSync(new URL("../logger/js/shared/routine-starter.js", import.meta.url), "utf8");
    const quiz = readFileSync(new URL("../logger/js/pages/daily-routines-quiz.js", import.meta.url), "utf8");
    assert.doesNotMatch(starter, BANNED);
    assert.doesNotMatch(quiz, BANNED);
    assert.doesNotMatch(starter, /kind:\s*"dose"|amount:/);
    assert.doesNotMatch(quiz, RERUN);
    assert.doesNotMatch(quiz, /fetch\(|XMLHttpRequest|sendBeacon|posthog|Sentry/);
  });

  test("the quiz auto-pops once and skipping leaves the generic starter", () => {
    signIn();
    const first = dailyRoutinesHTML();
    assert.equal(app.ui.sheet, "routines-quiz");
    assert.equal(maybeOfferRoutineQuiz(), false);
    assert.match(routineQuizSheetHTML(), /data-quiz-step="tracks"/);
    assert.match(routineQuizSheetHTML(), /What do you want to track\?/);
    assert.match(routineQuizSheetHTML(), /1 of 4/);
    assert.match(routineQuizSheetHTML(), /data-action="routines-quiz-skip"/);
    assert.doesNotMatch(first, /Morning supplements|Stack check|Night supplements/);
    assert.doesNotMatch(routineQuizSheetHTML(), BANNED);
    assert.doesNotMatch(routineQuizSheetHTML(), RERUN);
    assert.equal(app.state.dailyRoutines.quiz, null);

    assert.equal(skipRoutineQuiz(app.state), true);
    app.ui.sheet = null;
    app.ui.routineQuiz = null;
    const names = app.state.dailyRoutines.items.filter(isLive).map((item) => item.name);
    assert.deepEqual(names, starterNames(["morning", "stack", "night"]));
    assert.ok(app.state.dailyRoutines.items.every((item) => isLive(item) && item.kind === "check" && !item.compoundId));
    assert.equal(app.state.dailyRoutines.compounds.length, 0);
    assert.equal(app.state.dailyRoutines.quiz.status, "skipped");
    assert.equal(app.state.dailyRoutines.quiz.wake, null);
    assert.equal(app.state.dailyRoutines.quiz.bed, null);
    assert.equal(app.state.dailyRoutines.quiz.tracks, null);
    assert.deepEqual(liveNames("Morning routine"), ["Morning supplements", "Morning check"]);
    assert.deepEqual(liveNames("Supplement & enhancer stack"), ["Stack check"]);
    assert.deepEqual(liveNames("Night routine"), ["Night supplements", "Night check"]);
    for (const block of app.state.dailyRoutines.blocks) assert.equal(Object.hasOwn(block, "startTime"), false);

    const again = dailyRoutinesHTML();
    assert.equal(app.ui.sheet, null);
    assert.equal(maybeOfferRoutineQuiz(), false);
    assert.match(again, /Morning supplements/);
    assert.match(again, /Night supplements/);
    assert.doesNotMatch(again, /Add the first item/);
    assert.doesNotMatch(again, RERUN);
    assert.doesNotMatch(routinesSettingsSheetHTML(), /quiz|re-?run|retake/i);
    assert.equal(skipRoutineQuiz(app.state), false);
    assert.equal(app.state.dailyRoutines.items.filter(isLive).length, GENERIC_STARTER_ITEMS.length);

    signIn();
    dailyRoutinesHTML();
    assert.equal(chooseRoutineQuiz("tracks", "both"), true);
    assert.equal(chooseRoutineQuiz("wake", "08:00"), true);
    assert.equal(chooseRoutineQuiz("bed", "00:00"), true);
    assert.equal(toggleRoutineQuizBlock("night"), true);
    assert.equal(skipRoutineQuiz(app.state), true);
    assert.equal(app.state.dailyRoutines.quiz.status, "skipped");
    assert.equal(app.state.dailyRoutines.quiz.wake, null);
    assert.equal(app.state.dailyRoutines.quiz.bed, null);
    assert.deepEqual(app.state.dailyRoutines.blocks.filter(isLive).map((block) => block.name), STARTER_BLOCKS.map((block) => block.name));
    assert.deepEqual(app.state.dailyRoutines.items.filter(isLive).map((item) => item.name), starterNames(["morning", "stack", "night"]));
  });

  test("four taps finish the quiz and a fifth only drops a block", () => {
    signIn();
    dailyRoutinesHTML();
    let taps = 0;
    const tap = (ok) => { taps += 1; assert.equal(ok, true); };
    tap(chooseRoutineQuiz("tracks", "checks"));
    assert.match(routineQuizSheetHTML(), /data-quiz-step="wake"/);
    assert.match(routineQuizSheetHTML(), /2 of 4/);
    tap(chooseRoutineQuiz("wake", "07:00"));
    assert.match(routineQuizSheetHTML(), /data-quiz-step="bed"/);
    tap(chooseRoutineQuiz("bed", "23:00"));
    assert.match(routineQuizSheetHTML(), /data-quiz-step="blocks"/);
    assert.match(routineQuizSheetHTML(), /4 of 4/);
    assert.match(routineQuizSheetHTML(), /aria-pressed="true"/);
    tap(finishRoutineQuiz(app.state));
    assert.equal(taps, 4);
    assert.equal(app.state.dailyRoutines.quiz.status, "done");
    assert.equal(app.state.dailyRoutines.quiz.wake, "07:00");
    assert.equal(app.state.dailyRoutines.quiz.bed, "23:00");
    assert.equal(app.state.dailyRoutines.quiz.tracks, "checks");
    assert.deepEqual(app.state.dailyRoutines.quiz.kept, ["morning", "stack", "night"]);
    assert.deepEqual(app.state.dailyRoutines.items.filter(isLive).map((item) => item.name), starterNames(["morning", "stack", "night"]));
    for (const block of app.state.dailyRoutines.blocks) assert.equal(Object.hasOwn(block, "startTime"), false);
    app.ui.sheet = null;
    dailyRoutinesHTML();
    assert.equal(app.ui.sheet, null);
    assert.equal(finishRoutineQuiz(app.state), false);

    signIn();
    dailyRoutinesHTML();
    taps = 0;
    tap(chooseRoutineQuiz("tracks", "supplements"));
    tap(chooseRoutineQuiz("wake", "06:00"));
    tap(chooseRoutineQuiz("bed", "22:00"));
    tap(toggleRoutineQuizBlock("stack"));
    assert.deepEqual(app.ui.routineQuiz.kept, ["morning", "night"]);
    tap(finishRoutineQuiz(app.state));
    assert.equal(taps, 5);
    const live = app.state.dailyRoutines.blocks.filter(isLive).map((block) => block.name);
    assert.deepEqual(live, ["Morning routine", "Night routine"]);
    const stack = app.state.dailyRoutines.blocks.find((block) => block.name === "Supplement & enhancer stack");
    assert.ok(stack.deletedAt > 0);
    assert.equal(isLive(stack), false);
    assert.deepEqual(liveNames("Morning routine"), ["Morning supplements", "Morning check"]);
    assert.deepEqual(liveNames("Night routine"), ["Night supplements", "Night check"]);
    assert.deepEqual(app.state.dailyRoutines.items.filter(isLive).map((item) => item.name), starterNames(["morning", "night"]));
    assert.equal(seedDefaultBlocks(app.state.dailyRoutines, 50).blocks.filter(isLive).length, 2);
    assert.equal(app.state.dailyRoutines.blocks.filter(isLive).length + app.state.dailyRoutines.blocks.filter((block) => !isLive(block)).length, 3);
    assert.equal(app.state.dailyRoutines.quiz.wake, "06:00");
    assert.equal(app.state.dailyRoutines.quiz.bed, "22:00");
    assert.deepEqual(app.state.dailyRoutines.quiz.kept, ["morning", "night"]);
  });

  test("what you track does not add a block or change the starter", () => {
    const seen = [];
    for (const tracks of ["checks", "supplements", "both"]) {
      signIn();
      dailyRoutinesHTML();
      answer(tracks);
      assert.equal(finishRoutineQuiz(app.state), true);
      seen.push(app.state.dailyRoutines.items.filter(isLive).map((item) => item.name).join("|"));
      assert.deepEqual(app.state.dailyRoutines.blocks.filter(isLive).map((block) => block.name), STARTER_BLOCKS.map((block) => block.name));
      assert.equal(app.state.dailyRoutines.quiz.tracks, tracks);
    }
    assert.equal(new Set(seen).size, 1);
    signIn();
    dailyRoutinesHTML();
    assert.equal(chooseRoutineQuiz("tracks", "skincare"), false);
    assert.equal(app.ui.routineQuiz.step, "tracks");
    assert.equal(toggleRoutineQuizBlock("skincare"), false);
    assert.equal(app.state.dailyRoutines.quiz, null);
  });

  test("wake and bed stay on the quiz and apply only when startTime already exists", () => {
    signIn();
    dailyRoutinesHTML();
    for (const block of app.state.dailyRoutines.blocks) {
      if (block.name === "Morning routine") block.startTime = "05:00";
      if (block.name === "Night routine") block.startTime = "17:00";
      if (block.name === "Supplement & enhancer stack") block.startTime = "12:00";
    }
    answer("both");
    assert.equal(finishRoutineQuiz(app.state), true);
    const byName = Object.fromEntries(app.state.dailyRoutines.blocks.map((block) => [block.name, block]));
    assert.equal(byName["Morning routine"].startTime, "07:00");
    assert.equal(byName["Night routine"].startTime, "23:00");
    assert.equal(byName["Supplement & enhancer stack"].startTime, "12:00");
    assert.equal(app.state.dailyRoutines.quiz.wake, "07:00");
    assert.equal(app.state.dailyRoutines.quiz.bed, "23:00");
    byName["Morning routine"].startTime = "09:00";
    app.ui.sheet = null;
    dailyRoutinesHTML();
    assert.equal(app.state.dailyRoutines.blocks.find((block) => block.name === "Morning routine").startTime, "09:00");

    const untouched = applyStoredQuizStartTimes({
      updatedAt: 1,
      blocks: [{ id: "morning", name: "Morning routine", color: "citrus", order: 0, updatedAt: 1, deletedAt: null }],
      items: [],
      placements: [],
      compounds: [],
      logs: [],
      prefs: { lastBlockId: null, updatedAt: 1 },
      quiz: { status: "done", wake: "06:00", bed: "22:00", tracks: "checks", kept: ["morning"], updatedAt: 2 },
    });
    assert.equal(untouched.applied, false);
    assert.equal(Object.hasOwn(untouched.store.blocks[0], "startTime"), false);

    const renamed = applyStoredQuizStartTimes({
      updatedAt: 3,
      blocks: [{ id: "morning", name: "Early block", color: "citrus", order: 0, updatedAt: 3, deletedAt: null, startTime: "05:00" }],
      items: [],
      placements: [],
      compounds: [],
      logs: [],
      prefs: { lastBlockId: null, updatedAt: 3 },
      quiz: { status: "done", wake: "06:00", bed: "22:00", tracks: "checks", kept: ["morning"], updatedAt: 4 },
    });
    assert.equal(renamed.applied, false);
    assert.equal(renamed.store.blocks[0].startTime, "05:00");
  });

  test("a newer quiz wins a merge and a bad answer is dropped", () => {
    const base = {
      updatedAt: 1,
      blocks: [],
      items: [],
      placements: [],
      compounds: [],
      logs: [],
      prefs: { lastBlockId: null, updatedAt: 1 },
    };
    const done = {
      ...base,
      quiz: { status: "done", wake: "07:00", bed: "23:00", tracks: "both", kept: ["night", "skincare", "morning"], updatedAt: 10, note: "Example Compound A" },
    };
    const skipped = { ...base, quiz: { status: "skipped", wake: "05:00", bed: "21:00", tracks: "checks", kept: ["morning"], updatedAt: 20 } };
    const newerSkip = mergeDailyRoutines(done, skipped);
    assert.equal(newerSkip.quiz.status, "skipped");
    assert.equal(newerSkip.quiz.wake, null);
    const tie = mergeDailyRoutines(done, { ...base, quiz: { ...done.quiz, wake: "05:00", updatedAt: 10 } });
    assert.equal(tie.quiz.wake, "07:00");
    const cleaned = normalizeDailyRoutines(done);
    assert.equal(cleaned.quiz.wake, "07:00");
    assert.equal(cleaned.quiz.bed, "23:00");
    assert.deepEqual(cleaned.quiz.kept, ["morning", "night"]);
    assert.equal(Object.hasOwn(cleaned.quiz, "note"), false);
    const junk = normalizeDailyRoutines({ ...base, quiz: { status: "done", wake: "7am", bed: "25:00", tracks: "skincare", kept: ["peptide"], updatedAt: 3 } });
    assert.equal(junk.quiz.status, "done");
    assert.equal(junk.quiz.wake, null);
    assert.equal(junk.quiz.bed, null);
    assert.equal(junk.quiz.tracks, null);
    assert.deepEqual(junk.quiz.kept, []);
    assert.equal(normalizeDailyRoutines({ ...base, quiz: { status: "later" } }).quiz, null);
  });

  test("painting Routines as a neighbour pane does not open the quiz over another tab", () => {
    signIn();
    app.ui.tab = "home";
    app.paintingNeighbour = true;
    try { dailyRoutinesHTML(); } finally { app.paintingNeighbour = false; }
    assert.equal(app.ui.sheet, null);
    assert.equal(app.ui.routineQuiz, null);
    const pager = readFileSync(new URL("../logger/js/shell/pager.js", import.meta.url), "utf8");
    assert.match(pager, /app\.paintingNeighbour = true;[\s\S]*finally \{[^}]*app\.paintingNeighbour = false/);
    app.ui.tab = "daily-routines";
    dailyRoutinesHTML();
    assert.equal(app.ui.sheet, "routines-quiz");
    assert.equal(maybeOfferRoutineQuiz(), false);
  });

  test("the quiz does not open when signed out, flag off, or still pulling", () => {
    signIn();
    app.session = null;
    assert.equal(dailyRoutinesHTML().includes("signed-out"), true);
    assert.equal(app.ui.sheet, null);
    assert.equal(skipRoutineQuiz(app.state), false);
    assert.equal(app.state.dailyRoutines, null);

    signIn();
    app.ROUTINES_ENABLED = false;
    assert.equal(dailyRoutinesHTML(), "");
    assert.equal(maybeOfferRoutineQuiz(), false);
    assert.equal(app.state.dailyRoutines, null);

    signIn();
    app.sb = { from() {} };
    app.cloudPullOk = false;
    app.save = () => { throw new Error("pull in flight must not save"); };
    const html = dailyRoutinesHTML();
    assert.match(html, /data-routines-shell="syncing"/);
    assert.equal(app.ui.sheet, null);
    assert.equal(skipRoutineQuiz(app.state), false);
    assert.equal(finishRoutineQuiz(app.state), false);
    assert.equal(app.state.dailyRoutines, null);
  });

  test("the last block stays and there is no re-run control in the shell", () => {
    signIn();
    dailyRoutinesHTML();
    answer("checks");
    assert.equal(toggleRoutineQuizBlock("morning"), true);
    assert.equal(toggleRoutineQuizBlock("stack"), true);
    assert.equal(toggleRoutineQuizBlock("night"), false);
    assert.deepEqual(app.ui.routineQuiz.kept, ["night"]);
    const actions = readFileSync(new URL("../logger/js/shell/actions.js", import.meta.url), "utf8");
    const workout = readFileSync(new URL("../logger/js/shell/workout.js", import.meta.url), "utf8");
    const page = readFileSync(new URL("../logger/js/pages/daily-routines.js", import.meta.url), "utf8");
    const main = readFileSync(new URL("../logger/js/main.js", import.meta.url), "utf8");
    const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
    const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
    const flag = readFileSync(new URL("../logger/js/shared/routines-flag.js", import.meta.url), "utf8");
    for (const name of ["routines-quiz-skip", "routines-quiz-finish", "routines-quiz-tracks", "routines-quiz-wake", "routines-quiz-bed", "routines-quiz-block"]) {
      assert.match(actions, new RegExp(`case "${name}"`));
    }
    assert.match(actions, /sheet === "routines-quiz"/);
    assert.match(actions, /skipRoutineQuiz/);
    assert.match(workout, /routines-quiz/);
    assert.match(workout, /Setup quiz/);
    assert.match(page, /maybeOfferRoutineQuiz/);
    assert.doesNotMatch(page, RERUN);
    assert.doesNotMatch(page, /routines-flag/);
    assert.match(flag, /ROUTINES_ENABLED = false/);
    assert.equal(main.match(/routines-flag/g).length, 1);
    assert.match(main, /import "\.\/pages\/daily-routines-quiz\.js";/);
    assert.match(sw, /const CACHE = "insight-shell-v64"/);
    assert.match(sentry, /insight-shell-v64/);
    assert.match(sw, /js\/pages\/daily-routines-quiz\.js/);
    assert.match(sw, /js\/shared\/routine-starter\.js/);
    assert.equal(fileURLToPath(import.meta.url).includes("/native/"), false);
  });
  for (const mode of ["finish", "skip"]) {
    test(`two clients that each ${mode} the quiz converge on one starter after a merge`, () => {
      signIn();
      ensureRoutineShell(app.state);
      const shared = JSON.stringify(app.state.dailyRoutines);
      const clients = [];
      for (let i = 0; i < 2; i += 1) {
        app.state = { dailyRoutines: JSON.parse(shared) };
        app.ui = { sheet: null, routineQuiz: null };
        if (mode === "skip") assert.equal(skipRoutineQuiz(app.state), true);
        else {
          answer();
          assert.equal(finishRoutineQuiz(app.state), true);
        }
        clients.push(app.state.dailyRoutines);
      }
      const total = GENERIC_STARTER_ITEMS.length;
      for (const [left, right] of [[clients[0], clients[1]], [clients[1], clients[0]]]) {
        const merged = mergeDailyRoutines(left, right);
        assert.equal(merged.items.filter(isLive).length, total);
        assert.equal(merged.placements.filter(isLive).length, total);
        assert.equal(merged.items.length, total);
        assert.equal(merged.placements.length, total);
      }

      // A starter deleted on one phone stays deleted after the other phone merges.
      app.state = { dailyRoutines: clients[0] };
      const victim = clients[0].items.find((item) => item.name === "Morning check");
      app.routineNow = () => new Date(2026, 10, 19, 9, 30);
      assert.equal(deleteRoutineItem(app.state, victim.id), true);
      for (const merged of [mergeDailyRoutines(app.state.dailyRoutines, clients[1]), mergeDailyRoutines(clients[1], app.state.dailyRoutines)]) {
        assert.equal(merged.items.filter(isLive).length, total - 1);
        assert.equal(merged.items.filter(isLive).some((item) => item.id === victim.id), false);
        const placed = merged.placements.filter((row) => isLive(row) && row.itemId === victim.id);
        assert.equal(placed.length, 0);
      }
    });
  }

  function finishKeeping(shared, key, minute) {
    app.state = { dailyRoutines: JSON.parse(shared) };
    app.ui = { sheet: null, routineQuiz: null };
    app.routineNow = () => new Date(2026, 10, 19, 8, minute);
    answer();
    for (const other of ["morning", "stack", "night"]) if (other !== key) assert.equal(toggleRoutineQuizBlock(other), true);
    assert.deepEqual(app.ui.routineQuiz.kept, [key]);
    assert.equal(finishRoutineQuiz(app.state), true);
    return app.state.dailyRoutines;
  }

  function liveBlockNames(store) {
    return store.blocks.filter(isLive).map((block) => block.name).sort();
  }

  test("two phones that keep different blocks merge to the winning answer, never to no blocks", () => {
    signIn();
    ensureRoutineShell(app.state, new Date(2026, 10, 19, 8, 0).getTime());
    const shared = JSON.stringify(app.state.dailyRoutines);
    const phoneA = finishKeeping(shared, "morning", 30);
    const phoneB = finishKeeping(shared, "night", 40);
    for (const merged of [mergeDailyRoutines(phoneA, phoneB), mergeDailyRoutines(phoneB, phoneA)]) {
      assert.deepEqual(merged.quiz.kept, ["night"]);
      assert.deepEqual(liveBlockNames(merged), ["Night routine"]);
      app.state = { dailyRoutines: merged };
      assert.deepEqual(liveNames("Night routine"), starterNames(["night"]));
      assert.equal(seedDefaultBlocks(merged, 50).blocks.filter(isLive).length, 1);
      // Merging again, with either stale copy, changes nothing.
      for (const stale of [phoneA, phoneB]) {
        assert.deepEqual(liveBlockNames(mergeDailyRoutines(merged, stale)), ["Night routine"]);
        assert.deepEqual(liveBlockNames(mergeDailyRoutines(stale, merged)), ["Night routine"]);
      }
    }

    // A real delete after the quiz still stands, on the winner or the loser.
    app.state = { dailyRoutines: mergeDailyRoutines(phoneA, phoneB) };
    const night = app.state.dailyRoutines.blocks.find((block) => block.name === "Night routine");
    app.routineNow = () => new Date(2026, 10, 19, 9, 30);
    assert.equal(deleteRoutineBlock(app.state, night.id), true);
    assert.deepEqual(liveBlockNames(mergeDailyRoutines(app.state.dailyRoutines, phoneA)), []);
    app.state = { dailyRoutines: JSON.parse(JSON.stringify(phoneA)) };
    app.routineNow = () => new Date(2026, 10, 19, 9, 0);
    assert.equal(restoreRoutineBlock(app.state, night.id), true);
    app.routineNow = () => new Date(2026, 10, 19, 9, 5);
    assert.equal(deleteRoutineBlock(app.state, night.id), true);
    for (const merged of [mergeDailyRoutines(app.state.dailyRoutines, phoneB), mergeDailyRoutines(phoneB, app.state.dailyRoutines)]) {
      assert.equal(merged.blocks.filter(isLive).some((block) => block.id === night.id), false);
    }
  });

  test("a phone that seeds the starter late cannot undo another phone's delete or rename", () => {
    signIn();
    ensureRoutineShell(app.state, new Date(2026, 10, 19, 8, 0).getTime());
    const shared = JSON.stringify(app.state.dailyRoutines);
    app.state = { dailyRoutines: JSON.parse(shared) };
    assert.equal(skipRoutineQuiz(app.state), true);
    const victim = app.state.dailyRoutines.items.find((item) => item.name === "Morning check");
    const renamed = app.state.dailyRoutines.items.find((item) => item.name === "Night check");
    app.routineNow = () => new Date(2026, 10, 19, 9, 0);
    assert.equal(deleteRoutineItem(app.state, victim.id), true);
    app.routineNow = () => new Date(2026, 10, 19, 9, 5);
    assert.equal(renameRoutineItem(app.state, renamed.id, "Evening wind-down"), true);
    const phoneA = app.state.dailyRoutines;

    // Phone B never saw any of that and seeds from the old copy an hour later.
    app.state = { dailyRoutines: JSON.parse(shared) };
    app.ui = { sheet: null, routineQuiz: null };
    app.routineNow = () => new Date(2026, 10, 19, 10, 0);
    assert.equal(skipRoutineQuiz(app.state), true);
    const phoneB = app.state.dailyRoutines;

    for (const merged of [mergeDailyRoutines(phoneA, phoneB), mergeDailyRoutines(phoneB, phoneA)]) {
      assert.equal(merged.items.filter(isLive).some((item) => item.id === victim.id), false);
      assert.equal(merged.placements.filter((row) => isLive(row) && row.itemId === victim.id).length, 0);
      assert.equal(merged.items.find((item) => item.id === renamed.id).name, "Evening wind-down");
      assert.equal(merged.items.filter(isLive).length, GENERIC_STARTER_ITEMS.length - 1);
    }
  });
});
