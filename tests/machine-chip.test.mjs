import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import { isMachineLike, machineChipHTML } from "../logger/js/shell/workout.js";

app.esc = (s) => String(s);
app.GEAR_SVG = "<svg></svg>";
app.state = { workouts: [{ exercises: [{ name: "Chest Thing", equipment: "Selectorized" }] }], machineNotes: {} };
app.DEFAULT_WORKOUTS = [];
app.machineNote = (n) => app.state.machineNotes[n] || "";

test("machine, cable, smith and plate-loaded moves get the add button", () => {
  for (const n of ["Pec Fly Machine", "Cable Lateral Raise", "Smith Machine Incline Bench Press", "Lat Pulldown", "Pec Deck", "Leg Press", "Hack Squat", "Plate-Loaded Row", "Assisted Pull-Up"]) {
    assert.ok(isMachineLike(n), n);
    assert.match(machineChipHTML(n), /class="ms-add"/, n);
  }
});

test("barbell, dumbbell and bodyweight moves get no add button", () => {
  for (const n of ["Barbell Bench Press", "Back Squat", "Deadlift", "Push-Up", "Pull-Up", "Dumbbell Curl"]) {
    assert.equal(machineChipHTML(n), "", n);
  }
});

test("an equipment field on the exercise can opt a move in", () => {
  assert.match(machineChipHTML("Chest Thing"), /class="ms-add"/);
});

test("an existing note always shows the chip, even on a barbell move", () => {
  app.state.machineNotes["Back Squat"] = "Pins at 4";
  const html = machineChipHTML("Back Squat");
  assert.match(html, /class="ms-chip"/);
  assert.match(html, /Pins at 4/);
});
