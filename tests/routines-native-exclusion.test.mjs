import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { app } from "../logger/js/runtime.js";
import { ROUTINES_ENABLED } from "../logger/js/shared/routines-flag.js";

const APP_ROOT = fileURLToPath(new URL("../native/src/app/", import.meta.url));
const TAB_DIR = join(APP_ROOT, "(tabs)");
const TAB_FILES = ["_layout.tsx", "food.tsx", "index.tsx", "progress.tsx", "routines.tsx", "workouts.tsx"];
/* The iPhone app has one Routines tab, and its screens live in one folder beside
   the tabs. These two paths are the only routine routes the app may have. */
const NATIVE_ROUTINES_TAB = "(tabs)/routines.tsx";
const NATIVE_ROUTINES_DIR = "routines";
const PWA_TABS = ["home", "workouts", "food", "progress", "insights"];

/* Route segment only. Workout-template "routines" live in stores and the PWA
   segment control, not as files under native/src/app, so they are not scanned. */
function routeSegmentKey(name) {
  const base = name.replace(/\.(tsx|ts|jsx|js)$/i, "");
  const inner = base.startsWith("(") && base.endsWith(")") ? base.slice(1, -1) : base;
  return inner
    .replace(/^\+/, "")
    .replace(/\[|\]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

/* Any route segment containing routine, discover, reconstitut, or peptide.
   Workout-template usage is the exception: workout-routines, and a store
   call such as list('routines'), which is not a file under native/src/app. */
const WORKOUT_TEMPLATE_OK = new Set(["workout-routines", "workout-routine", "routine-editor"]);

function forbiddenRouteName(name, relPath) {
  if (typeof name !== "string") return null;
  if (/list\(\s*['"]routines['"]\s*\)/.test(name)) return null;
  const rel = String(relPath || name).replace(/\\/g, "/").toLowerCase();
  const underWorkout = rel.startsWith("workout/") || rel.includes("/workout/");
  const key = routeSegmentKey(relPath && relPath !== name ? name : name);
  if (!key || key === "_layout" || key === "native-intent") return null;
  if (key === "workout-routines" || key === "workout-routine") return null;
  const compact = key.replace(/-/g, "");
  const routine = key.includes("routine") || compact.includes("routine");
  if (routine && underWorkout && WORKOUT_TEMPLATE_OK.has(key)) return null;
  if (routine && underWorkout && key.endsWith("-editor")) return null;
  if (routine) return "routine";
  if (key.includes("discover") || compact.includes("discover")) return "discover";
  if (key.includes("reconstitut") || compact.includes("reconstitut")) return "reconstitut";
  if (key.includes("peptide") || compact.includes("peptide")) return "peptide";
  return null;
}

function quotedField(src, field) {
  const values = [];
  const re = new RegExp("\\b" + field + "\\s*:\\s*(?:'([^']*)'|\"([^\"]*)\"|`([^`]*)`)", "g");
  let match;
  while ((match = re.exec(src))) values.push(match[1] ?? match[2] ?? match[3]);
  return values;
}

function tabConfigEntries(src) {
  const routes = quotedField(src, "route");
  const labels = quotedField(src, "label");
  const count = Math.min(routes.length, labels.length);
  const entries = [];
  for (let i = 0; i < count; i++) entries.push({ route: routes[i], label: labels[i] });
  return entries;
}

function routeEntries(dir, rel = "") {
  const entries = [];
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    const relPath = rel ? `${rel}/${dirent.name}` : dirent.name;
    entries.push({ name: dirent.name, relPath });
    if (dirent.isDirectory()) entries.push(...routeEntries(join(dir, dirent.name), relPath));
  }
  return entries;
}

function forbiddenRoutes() {
  const hits = [];
  for (const entry of routeEntries(APP_ROOT)) {
    if (entry.relPath === NATIVE_ROUTINES_TAB || entry.relPath === NATIVE_ROUTINES_DIR) continue;
    const why = forbiddenRouteName(entry.name, entry.relPath);
    if (why) hits.push(`${entry.relPath} (${why})`);
  }
  return hits;
}

function shellArray(src) {
  const start = src.indexOf("const SHELL = [");
  assert.ok(start >= 0, "SHELL array missing");
  const end = src.indexOf("];", start);
  assert.ok(end > start, "SHELL array not closed");
  return src.slice(start, end + 2);
}

function codeWithoutComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("ROUTINES_ENABLED is strictly true and cannot be switched from the page", () => {
  const src = readFileSync(new URL("../logger/js/shared/routines-flag.js", import.meta.url), "utf8");
  assert.equal(ROUTINES_ENABLED, true);
  assert.equal(app.ROUTINES_ENABLED, true);
  assert.match(src, /^export const ROUTINES_ENABLED = true;$/m);
  assert.doesNotMatch(codeWithoutComments(src), /localStorage|sessionStorage|URLSearchParams|location\.search|process\.env|import\.meta\.env|searchParams/);
});

test("main.js is the only app import, and the shell caches the flag module", () => {
  const main = readFileSync(new URL("../logger/js/main.js", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
  assert.match(main, /import "\.\/shared\/routines-flag\.js";/);
  assert.deepEqual(main.match(/routines-flag\.js/g), ["routines-flag.js"]);
  const jsRoot = fileURLToPath(new URL("../logger/js/", import.meta.url));
  const importers = [];
  for (const entry of routeEntries(jsRoot)) {
    if (!entry.name.endsWith(".js") || entry.relPath === "shared/routines-flag.js") continue;
    const text = readFileSync(join(jsRoot, entry.relPath), "utf8");
    if (text.includes("routines-flag")) importers.push(entry.relPath);
  }
  assert.deepEqual(importers, ["main.js"]);
  const listed = shellArray(sw).match(/\.\/js\/shared\/routines-flag\.js/g);
  assert.deepEqual(listed, ["./js/shared/routines-flag.js"]);
});

test("the PWA tab bar stays Home, Workouts, Food, Progress, Insights", () => {
  const pager = readFileSync(new URL("../logger/js/shell/pager.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../logger/index.html", import.meta.url), "utf8");
  assert.match(pager, /app\.TAB_ORDER = \["home", "workouts", "food", "progress", "insights"\];/);
  const tabs = [...html.matchAll(/class="tab"[^>]*data-tab="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(tabs, PWA_TABS);
});

test("native tabs are exactly Home, Workouts, Food, Progress, and Routines", () => {
  const names = readdirSync(TAB_DIR).sort();
  assert.deepEqual(names, TAB_FILES.slice().sort());
});

test("native Insights is a section of Progress: /insights only redirects there", () => {
  /* A file left in (tabs) is still a tab route, so insights.tsx may only live outside it. */
  assert.ok(!readdirSync(TAB_DIR).includes("insights.tsx"));
  const src = codeWithoutComments(readFileSync(join(APP_ROOT, "insights.tsx"), "utf8"));
  assert.match(src, /<Redirect\s+href=\{\{\s*pathname:\s*'\/progress'/);
  assert.equal(forbiddenRouteName("insights.tsx"), null);
});

test("the only native Routines routes are the tab and its routines folder; no Discover or calculator route", () => {
  assert.ok(existsSync(join(APP_ROOT, NATIVE_ROUTINES_TAB)), "the Routines tab route is missing");
  assert.ok(existsSync(join(APP_ROOT, NATIVE_ROUTINES_DIR)), "the Routines screens folder is missing");
  const hits = forbiddenRoutes();
  assert.deepEqual(hits, [], `forbidden native app route:\n${hits.join("\n")}`);
  /* The two paths are let through by their exact place, not by name: the same
     names anywhere else are still refused, and so is a second routine route
     inside the folder. */
  assert.equal(forbiddenRouteName("routines.tsx", "settings/routines.tsx"), "routine");
  assert.equal(forbiddenRouteName("routines", "food/routines"), "routine");
  assert.equal(forbiddenRouteName("daily-routines.tsx", "routines/daily-routines.tsx"), "routine");
  assert.equal(forbiddenRouteName("peptides.tsx", "routines/peptides.tsx"), "peptide");
  assert.equal(forbiddenRouteName("reconstitution.tsx", "routines/reconstitution.tsx"), "reconstitut");
  /* App Store 1.4.2: the tool is a concentration converter inside Add item, and no route is named a calculator. */
  const calculators = routeEntries(APP_ROOT).filter((entry) => /calculator/i.test(entry.name)).map((entry) => entry.relPath);
  assert.deepEqual(calculators, []);
});

test("workout template routines are not treated as a native Routines route", () => {
  const store = readFileSync(new URL("../native/src/data/workout/store.ts", import.meta.url), "utf8");
  const workouts = readFileSync(new URL("../logger/js/pages/workouts.js", import.meta.url), "utf8");
  assert.match(store, /list\('routines'\)/);
  assert.match(workouts, /ui\.wseg === "routines"/);
  assert.equal(forbiddenRouteName("repo.list('routines')"), null);
  assert.equal(forbiddenRouteName("workout-routines.tsx"), null);
  assert.equal(forbiddenRouteName("workouts.tsx"), null);
});

test("close variants of a Routines, Discover, or calculator route are rejected", () => {
  const banned = [
    "daily-routines.tsx",
    "daily_routines.tsx",
    "dailyRoutines.tsx",
    "dailyroutines",
    "daily-routine",
    "care-routines",
    "care_routines.tsx",
    "careRoutines",
    "care-routine",
    "(daily-routines)",
    "discover.tsx",
    "discovery",
    "discover-tab.tsx",
    "reconstitution.tsx",
    "Reconstitution.tsx",
    "reconstitutor",
    "reconstitution-calculator.tsx",
    "peptide-calculator.tsx",
    "peptide_calculator.tsx",
    "peptideCalculator.tsx",
    "peptidecalculator.tsx",
    "routines.tsx",
    "(routines)",
    "my-routines.tsx",
    "routine.tsx",
    "Routine.tsx",
  ];
  for (const name of banned) assert.ok(forbiddenRouteName(name), name);
  const allowed = [
    "workouts.tsx",
    "template.tsx",
    "_layout.tsx",
    "+native-intent.ts",
    "[key].tsx",
    "[section].tsx",
    "index.tsx",
    "food.tsx",
    "insights.tsx",
    "progress.tsx",
    "dev-oura-preview.tsx",
    "workout-routines.tsx",
    "repo.list('routines')",
  ];
  for (const name of allowed) assert.equal(forbiddenRouteName(name), null, name);
});

test("my-routines.tsx and routine.tsx are forbidden native routes", () => {
  assert.equal(forbiddenRouteName("my-routines.tsx"), "routine");
  assert.equal(forbiddenRouteName("routine.tsx"), "routine");
  assert.equal(forbiddenRouteName("workout-routines.tsx"), null);
  assert.equal(forbiddenRouteName("repo.list('routines')"), null);
  assert.equal(forbiddenRouteName("routine-editor.tsx", "workout/routine-editor.tsx"), null);
  assert.equal(forbiddenRouteName("routine.tsx", "workout/routine.tsx"), "routine");
});

test("tabs.ts lists exactly the five tabs, and Routines is the only routine tab", () => {
  const src = readFileSync(new URL("../native/src/features/shell/tabs.ts", import.meta.url), "utf8");
  const tabs = tabConfigEntries(src);
  assert.deepEqual(tabs.map((tab) => tab.route), ["index", "workouts", "food", "progress", "routines"]);
  assert.deepEqual(tabs.map((tab) => tab.label), ["home", "workouts", "food", "progress", "routines"]);
  assert.ok(existsSync(join(TAB_DIR, "routines.tsx")), "tabs.ts names a Routines tab with no route file");
  for (const tab of tabs.slice(0, 4)) {
    assert.equal(forbiddenRouteName(`${tab.route}.tsx`), null, tab.route);
    assert.equal(forbiddenRouteName(`${tab.label}.tsx`), null, tab.label);
  }
  const sneaky = tabConfigEntries("{ route: 'my-routines', label: 'routines', symbol: 'pills' }");
  assert.equal(sneaky.length, 1);
  assert.equal(forbiddenRouteName(`${sneaky[0].route}.tsx`), "routine");
  assert.equal(forbiddenRouteName(`${sneaky[0].label}.tsx`), "routine");
  const routineOnly = tabConfigEntries("{ route: 'index', label: 'routine', symbol: 'house' }");
  assert.equal(forbiddenRouteName(`${routineOnly[0].label}.tsx`), "routine");
  const cased = tabConfigEntries("{ route: 'index', label: 'Home', options: { nested: true } }");
  assert.equal(cased.length, 1);
  assert.equal(forbiddenRouteName(`${cased[0].label}.tsx`), null);
  const templated = tabConfigEntries("{ route: `my-routines`, label: `routines`, options: { nested: true } }");
  assert.equal(templated.length, 1);
  assert.equal(forbiddenRouteName(`${templated[0].route}.tsx`), "routine");
});
