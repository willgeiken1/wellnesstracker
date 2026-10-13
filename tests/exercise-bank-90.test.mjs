import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import "../logger/js/data/body.js";
import "../logger/js/shared/muscles.js";

app.esc = (s) => String(s);
app.customExercises = () => [];
app.musclesLabel = () => "";

// The 90 exercises added in v36 (75 gap-list + 15 extra). Names only.
const ADDED = [
  "Rope Hammer Curl", "EZ Bar Preacher Curl", "Machine Preacher Curl", "Cross-Body Hammer Curl",
  "Cable Preacher Curl", "Incline Hammer Curl", "Dumbbell Triceps Kickback", "Cable Triceps Kickback",
  "Tricep Pushdown With V-Bar", "Reverse-Grip Tricep Pushdown", "One-Handed Tricep Pushdown",
  "Machine Triceps Extension", "Seated Dip Machine", "Incline Dumbbell Fly", "Low to High Cable Chest Fly",
  "Incline Cable Chest Fly", "Machine Incline Chest Press", "Machine Decline Chest Press",
  "Decline Dumbbell Fly", "Dumbbell Squeeze Press", "Pause Bench Press",
  "Smith Machine Close-Grip Bench Press", "Smith Machine Decline Bench Press", "Pike Push-Up",
  "Dumbbell Upright Row", "Cable Upright Row", "Smith Machine Upright Row", "Cable Y-Raise", "Battle Ropes",
  "Resistance Band Shoulder Press", "Meadows Row", "Chest-Supported T-Bar Row", "Machine High Row",
  "Plate Loaded Low Row", "Underhand Barbell Row", "Machine Pullover", "Smith Machine Row",
  "Smith Machine Shrug", "Cable Shrug", "Machine Shrug", "Machine Back Extension", "Kettlebell Deadlift",
  "Dumbbell Snatch", "Clean Pull", "Rope Climb", "Resistance Band Row", "Dumbbell Split Squat",
  "Smith Machine Split Squat", "One-Legged Leg Press", "Overhead Squat", "Barbell Thruster",
  "Dumbbell Thruster", "Burpee", "Sissy Squat", "Wall Sit", "Sled Drag", "Smith Machine Calf Raise",
  "One-Legged Calf Raise", "Dumbbell Calf Raise", "Calf Raise in Hack Squat Machine", "Barbell Glute Bridge",
  "Dumbbell Hip Thrust", "Kettlebell Sumo Deadlift", "Reverse Crunch", "Decline Sit-Up", "Toes to Bar",
  "Flutter Kicks", "Heel Touches", "Stability Ball Crunch", "Stability Ball Knee Tuck", "Suitcase Carry",
  "Torso Rotation Machine", "Barbell Reverse Wrist Curl", "Dumbbell Reverse Wrist Curl", "Cable Wrist Curl",
  "Bench Leg Pull-In", "Stability Ball Pike", "Bent-Over Dumbbell Row", "Kettlebell Sumo High Pull",
  "Resistance Band Good Morning", "Smith Machine Good Morning", "Barbell Pullover",
  "Close-Grip Dumbbell Bench Press", "Dumbbell Kickstand Romanian Deadlift",
  "Glute Bridge With Band Around Knees", "Side-Lying Hip Abduction", "Horizontal Leg Press",
  "Resistance Band Romanian Deadlift", "Standing Leg Curl Against Band", "Dumbbell Push Press",
];
const GROUPS = ["Abs", "Back", "Biceps", "Calves", "Chest", "Forearms", "Glutes", "Legs", "Shoulders", "Triceps"];
const KEYS = new Set(app.ASSETS.advGroups.flatMap(([, items]) => items.map(([k]) => k)));
const bankNames = () => app.ASSETS.bank.map((b) => b.n.toLowerCase());

test("the bank has 478 exercises with no duplicate names", () => {
  assert.equal(ADDED.length, 90);
  assert.equal(new Set(ADDED.map((n) => n.toLowerCase())).size, 90);
  assert.equal(app.ASSETS.bank.length, 478);
  const names = bankNames();
  assert.equal(new Set(names).size, names.length);
});

test("every bank entry has a known group and only known muscle keys", () => {
  for (const b of app.ASSETS.bank) {
    assert.ok(GROUPS.includes(b.g), `${b.n}: group ${b.g}`);
    assert.ok(b.a.length, b.n);
    for (const k of b.a) assert.ok(KEYS.has(k), `${b.n}: ${k}`);
  }
});

test("each added exercise is in the bank exactly once", () => {
  const names = bankNames();
  for (const n of ADDED) assert.equal(names.filter((x) => x === n.toLowerCase()).length, 1, n);
  for (const n of ["JM Press", "Smith Machine JM Press"]) assert.equal(names.filter((x) => x === n.toLowerCase()).length, 1, n);
});

// Property-style: random added names, random casing, and pieces of the movement name are found.
// Equipment words (barbell, machine, cable) are not part of the search.
test("picker search finds random picks from the added exercises", () => {
  const EQUIP = new Set(["barbell", "dumbbell", "dumbbells", "cable", "cables", "machine", "machines", "smith", "kettlebell", "kettlebells", "ez", "band", "bands", "plate", "plates", "landmine", "resistance", "selectorized"]);
  const seed = Number(process.env.BANK_SEED) || Date.now() % 2147483647;
  let s = seed;
  const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  for (let i = 0; i < 60; i++) {
    const n = pick(ADDED);
    const cased = [...n].map((c) => (rnd() < 0.5 ? c.toLowerCase() : c.toUpperCase())).join("");
    const html = app.bankListHTML({ q: cased, action: "pick" });
    assert.ok(html.includes(`data-src="bank" data-name="${n}"`), `seed ${seed}: "${cased}" -> ${n}`);
    const words = n.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !EQUIP.has(w));
    if (!words.length) continue;
    const word = pick(words);
    let q = word;
    if (word.length > 4 && rnd() < 0.5) {
      const start = Math.floor(rnd() * (word.length - 2));
      q = word.slice(start, start + Math.min(word.length - start, 3 + Math.floor(rnd() * 3)));
    }
    if (q.length < 3) continue;
    const sub = app.bankListHTML({ q, action: "pick" });
    assert.ok(sub.includes(`data-name="${n}"`), `seed ${seed}: "${q}" -> ${n}`);
  }
});
